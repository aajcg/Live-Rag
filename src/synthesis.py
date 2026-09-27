import re
import time
from typing import List, Dict, Optional, Tuple
from pydantic import BaseModel, Field
from src.config import settings
from src.retrieval import RetrievedChunk
from src.memory import SessionState
from src.controller import STOPWORDS

MIN_CONTENT_OVERLAP_COVERAGE = 0.55
UNCERTAINTY_COVERAGE_THRESHOLD = 0.45
MAX_ANSWER_SENTENCES = 4


def _content_words(text: str) -> List[str]:
    return [
        w for w in re.findall(r"[A-Za-z0-9%]+", (text or "").lower())
        if len(w) > 1 and w not in STOPWORDS
    ]


def _weighted_terms(text: str) -> Dict[str, int]:
    return {w: len(w) for w in _content_words(text)}


class Citation(BaseModel):
    source: str
    page: int
    chunk_id: str
    document_title: Optional[str] = None
    score: float = 1.0
    label: Optional[str] = None
    section: Optional[str] = None

    def model_post_init(self, __context) -> None:
        if not self.label:
            title = self.document_title or self.source
            section = f" \u00a7{self.section}" if self.section else ""
            self.label = f"{title} \u00a7p{self.page}{section}"


class Claim(BaseModel):
    text: str
    grounded: bool
    chunk_id: Optional[str] = None
    source: Optional[str] = None
    page: Optional[int] = None
    support_score: float = 0.0
    updated: bool = False
    citation_label: Optional[str] = None


class GroundedAnswer(BaseModel):
    answer_text: str
    citations: List[Citation] = Field(default_factory=list)
    claims: List[Claim] = Field(default_factory=list)
    uncertainty_flag: bool = False
    uncertainty: str = ""
    answer_version: int = 1
    synthesis_mode: str = "extractive_fallback"
    ttft_ms: float = 0.0
    preserved_claim_count: int = 0
    updated_claim_count: int = 0
    tokens_in_estimate: int = 0
    tokens_out_estimate: int = 0


class AnswerSynthesizer:
    """
    Grounded Answer Synthesis module.

    * Offline deterministic extractive synthesis over retrieved evidence.
    * Claim-level grounding with directional content-word coverage checks.
    * Explicit uncertainty when the corpus does not cover a sub-intent.
    * Delta answer engine: preserves unaffected prior claims/citations and
      updates only the claims affected by a late-arriving constraint.
    """

    def __init__(self, api_key: Optional[str] = None, use_llm: bool = False):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.use_llm = use_llm and bool(self.api_key)

    # ---------------------------------------------------------------- public
    def synthesize(
        self,
        query: str,
        evidence: List[RetrievedChunk],
        session: Optional[SessionState] = None,
        answer_version: int = 1,
        subqueries: Optional[List[str]] = None,
        prior_claims: Optional[List[Claim]] = None,
        prior_answer: Optional[str] = None,
        delta_terms: Optional[List[str]] = None,
        delta_mode: bool = False,
    ) -> GroundedAnswer:
        start_time = time.time()

        if not evidence:
            return GroundedAnswer(
                answer_text="Insufficient evidence found in the corpus to answer this request.",
                citations=[],
                claims=[],
                uncertainty_flag=True,
                uncertainty="No corpus evidence was retrieved for this query.",
                answer_version=answer_version,
                synthesis_mode="insufficient_evidence",
                ttft_ms=round((time.time() - start_time) * 1000, 2),
            )

        citations = [
            Citation(
                source=c.source_file,
                page=c.page_number,
                chunk_id=c.chunk_id,
                document_title=c.document_title,
                score=c.retrieval_score,
                section=(c.metadata or {}).get("section"),
            )
            for c in evidence
        ]
        tokens_in = self._estimate_tokens(" ".join(c.text for c in evidence) + query)

        if self.use_llm:
            try:
                answer_text, mode = self._synthesize_llm(query, evidence, session)
                claims = self.ground_claims(answer_text, evidence)
                ungrounded = [c for c in claims if not c.grounded]
                ttft_ms = round((time.time() - start_time) * 1000, 2)
                return GroundedAnswer(
                    answer_text=answer_text,
                    citations=citations,
                    claims=claims,
                    uncertainty_flag=bool(ungrounded),
                    uncertainty=(
                        f"Unverified claims: {'; '.join(c.text for c in ungrounded[:3])}"
                        if ungrounded else ""
                    ),
                    answer_version=answer_version,
                    synthesis_mode=mode,
                    ttft_ms=ttft_ms,
                    tokens_in_estimate=tokens_in,
                    tokens_out_estimate=self._estimate_tokens(answer_text),
                )
            except Exception as e:
                print(f"LLM synthesis failed, falling back to extractive: {e}")

        if delta_mode and prior_claims:
            return self._synthesize_delta(
                query, evidence, citations, subqueries, prior_claims, prior_answer or "",
                delta_terms or [], answer_version, tokens_in, start_time,
            )

        return self._synthesize_extractive(
            query, evidence, citations, subqueries, answer_version, tokens_in, start_time,
        )

    # ------------------------------------------------------------- grounding
    def ground_claims(self, answer_text: str, evidence: List[RetrievedChunk]) -> List[Claim]:
        raw = re.sub(r"\[[^\]]+\]", " ", answer_text).strip()
        raw = re.sub(r"^\s*[-*\u2022]\s*", "", raw, flags=re.MULTILINE)
        sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw) if s.strip()]
        claims: List[Claim] = []
        for sentence in sentences:
            sentence = re.sub(r"^[-*\u2022\s]+", "", sentence).strip()
            content = _content_words(sentence)
            if not content:
                continue

            best_chunk = None
            best_coverage = 0.0
            for chunk in evidence:
                chunk_content = set(_content_words(chunk.text))
                covered = sum(1 for w in content if w in chunk_content)
                coverage = covered / len(content)
                if coverage > best_coverage:
                    best_coverage = coverage
                    best_chunk = chunk

            if len(content) >= 3:
                grounded = best_chunk is not None and best_coverage >= MIN_CONTENT_OVERLAP_COVERAGE
            else:
                # Very short claims must be fully covered.
                grounded = best_chunk is not None and best_coverage >= 0.999

            claims.append(
                Claim(
                    text=sentence,
                    grounded=grounded,
                    chunk_id=best_chunk.chunk_id if (best_chunk and grounded) else None,
                    source=best_chunk.source_file if (best_chunk and grounded) else None,
                    page=best_chunk.page_number if (best_chunk and grounded) else None,
                    support_score=round(best_coverage, 4),
                    citation_label=(
                        f"{best_chunk.source_file} \u00a7p{best_chunk.page_number}"
                        if (best_chunk and grounded) else None
                    ),
                )
            )
        return claims

    # ------------------------------------------------------------ extractive
    def _best_sentence_for_intent(
        self, intent: str, evidence: List[RetrievedChunk], used: set
    ) -> Optional[Tuple[str, RetrievedChunk]]:
        intent_terms = _weighted_terms(intent)
        if not intent_terms:
            return None
        best = None
        best_score = 0.0
        for chunk in evidence:
            for sentence in re.split(r"(?<=[.!?])\s+", chunk.text):
                sentence = sentence.strip()
                if len(sentence) < 15 or sentence in used:
                    continue
                s_words = set(_content_words(sentence))
                matched = [(w, wt) for w, wt in intent_terms.items() if w in s_words]
                if not matched:
                    continue
                weight = sum(wt for _, wt in matched)
                score = weight / (len(sentence) ** 0.5)
                if score > best_score:
                    best_score = score
                    best = (sentence, chunk)
        return best

    def _coverage_report(
        self, intents: List[str], evidence: List[RetrievedChunk]
    ) -> Tuple[bool, List[str], List[str]]:
        evidence_content = set()
        for c in evidence:
            evidence_content.update(_content_words(c.text))
        missing: List[str] = []
        weak: List[str] = []
        for intent in intents:
            terms = _weighted_terms(intent)
            if not terms:
                continue
            total = sum(terms.values())
            matched = sum(wt for w, wt in terms.items() if w in evidence_content)
            coverage = matched / total if total else 1.0
            if matched == 0:
                missing.append(intent)
            elif coverage < UNCERTAINTY_COVERAGE_THRESHOLD:
                weak.append(intent)
        ok = not missing and not weak
        return ok, missing, weak

    def _synthesize_extractive(
        self,
        query: str,
        evidence: List[RetrievedChunk],
        citations: List[Citation],
        subqueries: Optional[List[str]],
        answer_version: int,
        tokens_in: int,
        start_time: float,
    ) -> GroundedAnswer:
        intents = subqueries or [query]
        covered, missing, weak = self._coverage_report(intents, evidence)

        used: set = set()
        claims: List[Claim] = []
        pieces: List[str] = []

        for intent in intents:
            found = self._best_sentence_for_intent(intent, evidence, used)
            if found:
                sentence, chunk = found
                used.add(sentence)
                cite_str = f"[{chunk.source_file}, p.{chunk.page_number}]"
                pieces.append(f"{sentence} {cite_str}")
                claims.append(
                    Claim(
                        text=sentence,
                        grounded=True,
                        chunk_id=chunk.chunk_id,
                        source=chunk.source_file,
                        page=chunk.page_number,
                        support_score=1.0,
                        citation_label=f"{chunk.source_file} \u00a7p{chunk.page_number}",
                    )
                )
            if len(pieces) >= MAX_ANSWER_SENTENCES:
                break

        # Fill remaining slots with the strongest evidence sentence matches.
        if len(pieces) < min(MAX_ANSWER_SENTENCES, len(evidence)) and intents:
            found = self._best_sentence_for_intent(query, evidence, used)
            if found:
                sentence, chunk = found
                used.add(sentence)
                cite_str = f"[{chunk.source_file}, p.{chunk.page_number}]"
                pieces.append(f"{sentence} {cite_str}")
                claims.append(
                    Claim(
                        text=sentence,
                        grounded=True,
                        chunk_id=chunk.chunk_id,
                        source=chunk.source_file,
                        page=chunk.page_number,
                        support_score=1.0,
                        citation_label=f"{chunk.source_file} \u00a7p{chunk.page_number}",
                    )
                )

        uncertainty = ""
        uncertainty_flag = False
        if missing:
            uncertainty_flag = True
            uncertainty = (
                "The retrieved corpus does not contain evidence for: "
                + "; ".join(f"'{m.rstrip('?')}'" for m in missing[:3])
                + "."
            )
        elif weak:
            uncertainty_flag = True
            uncertainty = (
                "Evidence for the following sub-intent is limited and could not be fully verified: "
                + "; ".join(f"'{w.rstrip('?')}'" for w in weak[:3])
                + "."
            )

        if not pieces:
            # No evidence sentence actually matches the requested intent(s).
            # Per the corpus-isolation rule we must not present unrelated text
            # as an answer: emit an explicit insufficient-evidence state.
            message = uncertainty or (
                "The retrieved corpus does not contain a verifiable answer for this request."
            )
            answer = f"This request could not be verified from the available corpus. {message}"
            return GroundedAnswer(
                answer_text=answer,
                citations=[],
                claims=[],
                uncertainty_flag=True,
                uncertainty=message,
                answer_version=answer_version,
                synthesis_mode="insufficient_evidence",
                ttft_ms=round((time.time() - start_time) * 1000, 2),
                tokens_in_estimate=tokens_in,
                tokens_out_estimate=self._estimate_tokens(answer),
            )

        answer = " ".join(pieces)
        used_chunk_ids = {c.chunk_id for c in claims if c.chunk_id}
        final_citations = [c for c in citations if c.chunk_id in used_chunk_ids] or citations[:1]
        return GroundedAnswer(
            answer_text=answer,
            citations=final_citations,
            claims=claims,
            uncertainty_flag=uncertainty_flag,
            uncertainty=uncertainty,
            answer_version=answer_version,
            synthesis_mode="extractive_fallback",
            ttft_ms=round((time.time() - start_time) * 1000, 2),
            tokens_in_estimate=tokens_in,
            tokens_out_estimate=self._estimate_tokens(answer),
        )

    # ----------------------------------------------------------- delta engine
    def _synthesize_delta(
        self,
        query: str,
        evidence: List[RetrievedChunk],
        citations: List[Citation],
        subqueries: Optional[List[str]],
        prior_claims: List[Claim],
        prior_answer: str,
        delta_terms: List[str],
        answer_version: int,
        tokens_in: int,
        start_time: float,
    ) -> GroundedAnswer:
        # Only genuinely new constraint vocabulary marks a prior claim as
        # affected; shared topic words (already in the prior focus) do not.
        delta_signal = set(t.lower() for t in delta_terms if t)
        if not delta_signal:
            for sq in (subqueries or []):
                delta_signal.update(_content_words(sq))

        preserved: List[Claim] = []
        affected: List[Claim] = []
        for claim in prior_claims:
            claim_words = set(_content_words(claim.text))
            if delta_signal and claim_words & delta_signal:
                affected.append(claim)
            else:
                preserved.append(claim)

        # Re-extract from the delta evidence for each delta sub-intent.
        delta_intents = subqueries or [query]
        used = set()
        new_claims: List[Claim] = []
        pieces: List[str] = []

        for claim in preserved:
            label = claim.citation_label or (f"{claim.source} \u00a7p{claim.page}" if claim.source else None)
            suffix = f" [{label.split(' \u00a7')[0]}, p.{claim.page}]" if claim.source else ""
            pieces.append(f"{claim.text}{suffix}")

        for intent in delta_intents:
            found = self._best_sentence_for_intent(intent, evidence, used)
            if found:
                sentence, chunk = found
                used.add(sentence)
                cite_str = f"[{chunk.source_file}, p.{chunk.page_number}]"
                pieces.append(f"{sentence} {cite_str}")
                new_claims.append(
                    Claim(
                        text=sentence,
                        grounded=True,
                        chunk_id=chunk.chunk_id,
                        source=chunk.source_file,
                        page=chunk.page_number,
                        support_score=1.0,
                        updated=True,
                        citation_label=f"{chunk.source_file} \u00a7p{chunk.page_number}",
                    )
                )

        preserved_content = set()
        for claim in preserved:
            preserved_content.update(_content_words(claim.text))
        unresolved = [
            a for a in affected
            if not (set(_content_words(a.text)) & set(
                w for n in new_claims for w in _content_words(n.text)
            ))
        ]

        uncertainty = ""
        uncertainty_flag = False
        if affected and not new_claims:
            uncertainty_flag = True
            uncertainty = (
                "The late constraint could not be verified against the corpus; "
                "prior answer content was preserved."
            )
        elif unresolved:
            uncertainty_flag = True
            uncertainty = (
                "The following prior claim could not be updated from corpus evidence: "
                f"'{unresolved[0].text[:120]}'."
            )

        if not pieces:
            # Nothing preserved nor newly extracted: fall back to generic extractive.
            return self._synthesize_extractive(
                query, evidence, citations, subqueries, answer_version, tokens_in, start_time,
            )

        answer = " ".join(pieces)
        used_chunk_ids = {c.chunk_id for c in new_claims if c.chunk_id}
        final_citations = [c for c in citations if c.chunk_id in used_chunk_ids]

        # Rebuild citations for preserved claims from prior citation metadata.
        for claim in preserved:
            if not claim.chunk_id:
                continue
            if any(fc.chunk_id == claim.chunk_id for fc in final_citations):
                continue
            final_citations.append(
                Citation(
                    source=claim.source or "unknown",
                    page=claim.page or 1,
                    chunk_id=claim.chunk_id,
                    document_title=claim.source or "unknown",
                    score=claim.support_score,
                    label=claim.citation_label,
                )
            )

        return GroundedAnswer(
            answer_text=answer,
            citations=final_citations,
            claims=preserved + new_claims,
            uncertainty_flag=uncertainty_flag,
            uncertainty=uncertainty,
            answer_version=answer_version,
            synthesis_mode="delta_refinement",
            ttft_ms=round((time.time() - start_time) * 1000, 2),
            preserved_claim_count=len(preserved),
            updated_claim_count=len(new_claims),
            tokens_in_estimate=tokens_in,
            tokens_out_estimate=self._estimate_tokens(answer),
        )

    # ----------------------------------------------------------------- utils
    @staticmethod
    def _estimate_tokens(text: str) -> int:
        return max(0, int(len(text) / 4))

    def _synthesize_llm(
        self, query: str, evidence: List[RetrievedChunk], session: Optional[SessionState]
    ) -> Tuple[str, str]:
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key)

        context_str = "\n\n".join(
            [f"--- Chunk ID: {c.chunk_id} | Source: {c.source_file} (Page {c.page_number}) ---\n{c.text}" for c in evidence]
        )
        prior = (session.previous_answer if session and session.previous_answer else "") or ""
        prompt = (
            "You are a helpful assistant for the Aventro Motors corpus. "
            "Answer the user question based ONLY on the retrieved evidence context. "
            "Every factual sentence must be attributable to the evidence. "
            "Include explicit citations [source_file, p.page_number]. "
            "If the context is insufficient, explicitly state uncertainty instead of guessing.\n"
            f"Question: {query}\n\n"
            f"Prior session answer (context only, do not repeat blindly):\n{prior}\n\n"
            f"Evidence Context:\n{context_str}\n\n"
        )

        response = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2
        )
        answer = response.choices[0].message.content.strip()
        return answer, "llm_openai"
