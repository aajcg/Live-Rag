import re
import json
from enum import Enum
from typing import Optional, Dict, Any, List, Tuple
from pydantic import BaseModel, Field
from src.config import settings


class ControllerDecisionEnum(str, Enum):
    WAIT = "WAIT"
    RETRIEVE = "RETRIEVE"
    SUPPRESS = "SUPPRESS"


class ControllerResult(BaseModel):
    decision: ControllerDecisionEnum
    reason: str
    confidence: float = Field(ge=0.0, le=1.0)
    normalized_query: str
    retrieval_required: bool = True
    intent_stability: float = Field(default=0.0, ge=0.0, le=1.0)
    trigger: str = "full"


STOPWORDS = {
    "a", "an", "the", "of", "to", "in", "on", "at", "by", "for", "with", "about", "into",
    "from", "as", "is", "are", "was", "were", "be", "been", "being", "do", "does", "did",
    "have", "has", "had", "i", "me", "my", "we", "our", "you", "your", "it", "its", "this",
    "that", "these", "those", "and", "or", "but", "so", "if", "then", "than", "when", "where",
    "what", "which", "who", "whom", "whose", "why", "how", "can", "could", "should", "would",
    "will", "shall", "may", "might", "must", "please", "tell", "give", "show", "need", "want",
    "like", "just", "also", "not", "no", "yes", "ok", "okay", "sure", "there", "here", "am",
    "get", "got", "make", "made", "use", "used", "know", "any", "some", "all", "more", "most",
}

QUESTION_WORDS = {"what", "where", "when", "why", "how", "who", "which", "whose", "whom"}

SUPPRESS_REASON_PRESENTATION = "presentation_restructure"


class RetrievalController:
    """
    Intent-stability aware retrieval controller deciding whether an incoming transcript
    warrants RETRIEVE (possibly provisional/early), WAIT (semantically unstable), or
    SUPPRESS (presentation-only restructure of session context).

    The controller is deterministic by default and can optionally delegate to an LLM
    when an API key is configured, always falling back to the heuristic policy.
    """

    TRAILING_CONJUNCTIONS = {
        "and", "but", "or", "so", "because", "if", "when", "that", "with",
        "about", "to", "for", "in", "on", "at", "by", "from", "as", "is", "are", "was", "were"
    }

    INCOMPLETE_PREFIXES = [
        r"^i want to know$",
        r"^can you tell me$",
        r"^could you please$",
        r"^what is$",
        r"^where is$",
        r"^how do i$",
        r"^tell me about$",
        r"^i would like$",
        r"^please give me$",
        r"^i need to ask$",
    ]

    # Patterns that indicate a presentation-only transformation of previously
    # generated session context. These must NEVER trigger corpus retrieval.
    # Anaphora (that/this/it/last answer/...) is required so that genuinely new
    # factual questions containing words like "summarize" are not suppressed.
    SUPPRESS_PATTERNS: List[Tuple[str, str]] = [
        (r"\b(repeat|restate|read back)\b.*\b(last|previous|prior|answer|response|reply|that|this|it|again)\b", "presentation_restructure"),
        (r"\b(say|show|give|read)\b.*\b(that|it|this|the above|last answer|previous answer)\b.*\bagain\b", "presentation_restructure"),
        (r"\bbullet\s*points?\b", "presentation_restructure"),
        (r"\b(in|as|using|with)\b\s+(\w+\s+)?\bbullets?\b", "presentation_restructure"),
        (r"\b(numbered|ordered|unordered)\s+list\b.*\b(answer|response|that|this|it)\b", "presentation_restructure"),
        (r"\b(make|keep|write|put|give)\b.*\b(it|that|this|the answer|your answer)\b.*\b(short|shorter|brief|concise|simpler|longer|detailed|clearer)\b", "presentation_restructure"),
        (r"\b(shorten|condense)\b.*\b(answer|response|that|this|it|above)\b", "presentation_restructure"),
        (r"^(summarize|summarise|rephrase|reword|reformat|restate)\b.*\b(that|this|it|above|last|previous|answer|response)\b", "presentation_restructure"),
        (r"^(summarize|summarise|rephrase|reword|reformat|restate)\s*[.!?]*$", "presentation_restructure"),
        (r"\bexplain\b.*\b(that|this|it|again|simpler|simple terms)\b", "presentation_restructure"),
        (r"\b(tl;?dr|short version|summary version)\b", "presentation_restructure"),
        (r"\btranslate\b.*\b(that|this|it|above|last|previous|answer|response)\b", "presentation_restructure"),
        (r"^(hi|hello|hey|greetings|thanks|thank you|good morning|good afternoon|good evening|ok|okay|got it|sure|nice|cool)[\.!\?]*$", "conversational_filler"),
        (r"\bwhat did you (just )?say\b", "conversational_filler"),
        (r"\bwho are you\b", "conversational_filler"),
    ]

    REFINEMENT_MODIFIERS = [
        "only", "specifically", "including", "except", "what about", "just", "for"
    ]

    def __init__(self, api_key: Optional[str] = None, use_llm: bool = False):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.use_llm = use_llm and bool(self.api_key)

    # ------------------------------------------------------------------ utils
    @staticmethod
    def content_words(text: str) -> List[str]:
        return [
            w for w in re.findall(r"[A-Za-z0-9%]+", text.lower())
            if len(w) > 1 and w not in STOPWORDS
        ]

    @staticmethod
    def _entity_signals(query: str) -> Tuple[int, int]:
        """Return (entity_count, numeric_count) for intent stability estimation."""
        tokens = re.findall(r"[A-Za-z][A-Za-z0-9\-]*|\d+(?:\.\d+)?%?", query)
        entities = 0
        numbers = 0
        for tok in tokens:
            if re.match(r"^\d", tok):
                numbers += 1
                continue
            if tok[:1].isupper() and tok.lower() not in STOPWORDS and len(tok) > 1:
                entities += 1
        return entities, numbers

    @staticmethod
    def _stability(content_count: int, entities: int, numbers: int, ends_clean: bool) -> float:
        score = 0.30 + 0.10 * min(content_count, 6) + 0.10 * min(entities, 3) + 0.08 * min(numbers, 3)
        if ends_clean:
            score += 0.12
        return round(min(1.0, score), 3)

    # --------------------------------------------------------------- evaluate
    def evaluate(
        self,
        transcript_chunk: str,
        session_context: Optional[Dict[str, Any]] = None
    ) -> ControllerResult:
        raw_text = transcript_chunk.strip()
        normalized = re.sub(r"\s+", " ", raw_text).strip()

        if not normalized:
            return ControllerResult(
                decision=ControllerDecisionEnum.WAIT,
                reason="empty_transcript_chunk",
                confidence=1.0,
                normalized_query="",
                retrieval_required=False,
                intent_stability=0.0,
                trigger="wait",
            )

        if self.use_llm:
            try:
                llm_res = self._evaluate_llm(normalized)
                if llm_res:
                    return llm_res
            except Exception:
                pass

        # 1. Presentation-only / conversational fills never hit the corpus.
        suppress_match, suppress_reason = self._check_suppress(normalized, session_context)
        if suppress_match:
            return ControllerResult(
                decision=ControllerDecisionEnum.SUPPRESS,
                reason=suppress_reason,
                confidence=0.9,
                normalized_query=normalized,
                retrieval_required=False,
                intent_stability=0.0,
                trigger="suppress",
            )

        content = self.content_words(normalized)
        words = re.findall(r"\w+", normalized.lower())
        entities, numbers = self._entity_signals(normalized)
        continuated = normalized.rstrip().endswith(("...", "\u2026", "\u2014", ",", ";", ":"))
        ends_clean = normalized.endswith(("?", "!", ".")) and not continuated
        continuation = continuated
        trailing_conj = bool(words) and words[-1] in self.TRAILING_CONJUNCTIONS

        # 2. Semantically unstable fragments must WAIT.
        wait_match, wait_reason = self._check_wait(
            normalized, content, words, entities, numbers, continuation, trailing_conj, session_context
        )
        if wait_match:
            return ControllerResult(
                decision=ControllerDecisionEnum.WAIT,
                reason=wait_reason,
                confidence=0.85,
                normalized_query=normalized,
                retrieval_required=False,
                intent_stability=self._stability(len(content), entities, numbers, ends_clean),
                trigger="wait",
            )

        # 3. Sufficient stable intent: RETRIEVE (provisional if still open).
        provisional = continuation or not ends_clean
        stability = self._stability(len(content), entities, numbers, ends_clean)
        basis = "stable intent detected"
        if entities or numbers:
            basis = "stable entities detected"
        if not provisional:
            basis = "complete question with stable intent"
        return ControllerResult(
            decision=ControllerDecisionEnum.RETRIEVE,
            reason=f"Retrieval-worthy {basis}.",
            confidence=round(min(0.95, 0.7 + 0.25 * stability), 3),
            normalized_query=normalized,
            retrieval_required=True,
            intent_stability=stability,
            trigger="provisional" if provisional else "full",
        )

    # --------------------------------------------------------------- helpers
    def _check_suppress(self, query: str, session_context: Optional[Dict[str, Any]] = None) -> Tuple[bool, str]:
        q_lower = query.lower().strip()

        for pattern, reason in self.SUPPRESS_PATTERNS:
            if re.search(pattern, q_lower):
                # A presentation pattern that also contains an explicit fresh
                # question word about a different topic is treated as new intent.
                return True, reason

        if session_context and session_context.get("last_answer"):
            if q_lower in ["why?", "how so?", "what else?", "elaborate"]:
                return True, "session_context_followup"

        return False, ""

    def _check_wait(
        self,
        query: str,
        content: List[str],
        words: List[str],
        entities: int,
        numbers: int,
        continuation: bool,
        trailing_conj: bool,
        session_context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        q_lower = query.lower().strip()

        for prefix in self.INCOMPLETE_PREFIXES:
            if re.match(prefix, q_lower):
                return True, "incomplete_query_prefix_without_target"

        # A fragment with no searchable content can never be retrieved on.
        if not content:
            return True, "no_searchable_content_in_fragment"

        if trailing_conj and len(content) < 4:
            return True, "trailing_conjunction_before_intent_completion"

        if len(words) <= 3 and not query.endswith("?"):
            if not session_context or not session_context.get("last_answer"):
                if not (entities or numbers):
                    return True, "fragment_too_short_for_search_intent"

        # Continuation punctuation without any stable entity/number is treated
        # as semantically unstable: WAIT. With stable entities (e.g. "Pune",
        # "30 people") early/provisional retrieval is allowed.
        if continuation and not (entities or numbers) and len(content) < 4:
            return True, "continuation_without_stable_entities"

        if continuation and not (entities or numbers):
            # long but entity-free continuation: still wait for stabilization
            return True, "intent_incomplete_semantically_unstable"

        return False, ""

    # --------------------------------------------------------------- llm path
    def _evaluate_llm(self, query: str) -> Optional[ControllerResult]:
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key)
        prompt = (
            f"Analyze transcript turn: '{query}'. "
            "Respond in JSON format with keys: 'decision' ('WAIT', 'RETRIEVE', or 'SUPPRESS'), 'reason', 'confidence' (float 0-1)."
        )
        res = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        content = json.loads(res.choices[0].message.content)
        dec_str = content.get("decision", "RETRIEVE").upper()
        if dec_str in ControllerDecisionEnum.__members__:
            decision = ControllerDecisionEnum(dec_str)
            return ControllerResult(
                decision=decision,
                reason=content.get("reason", "LLM decision"),
                confidence=float(content.get("confidence", 0.9)),
                normalized_query=query,
                retrieval_required=decision == ControllerDecisionEnum.RETRIEVE,
                intent_stability=0.0,
                trigger=decision.value.lower(),
            )
        return None
