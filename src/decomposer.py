import re
import json
from typing import List, Optional
from pydantic import BaseModel
from src.config import settings
from src.controller import STOPWORDS, QUESTION_WORDS


class SubQuery(BaseModel):
    id: int
    query: str
    original_intent: str


LEADING_FILLERS = [
    r"^(?:hi|hello|hey|ok|okay|so|now|then|also|and|plus|please|kindly)\b[\s,]*",
    r"^(?:i|we)\s+(?:need|want|would like|'d like|am looking for|am asking for)\s+(?:to\s+know\s+)?",
    r"^(?:can|could|would|will)\s+you\s+(?:please\s+)?",
    r"^(?:show|tell|give)\s+me\s+(?:about\s+)?",
    r"^(?:i\s+need\s+to\s+ask\s+)",
    r"^(?:what\s+i\s+need\s+is\s+)",
]

TRAILING_FILLERS = [
    r"(?:,?\s*(?:and|but|so|because)\s+(?:i|we)\s+(?:need|want)(?:\s+to\s+know)?)\s*$",
    r"(?:,?\s*(?:and|but|so))\s*$",
    r"(?:,?\s*(?:please|thanks|thank\s+you))\s*$",
]


def _content_words(text: str) -> List[str]:
    return [
        w for w in re.findall(r"[A-Za-z0-9%]+", text.lower())
        if len(w) > 1 and w not in STOPWORDS
    ]


def _strip_fillers(text: str) -> str:
    prev = None
    out = text.strip()
    while out != prev:
        prev = out
        for pattern in LEADING_FILLERS:
            out = re.sub(pattern, "", out, flags=re.IGNORECASE).strip()
        for pattern in TRAILING_FILLERS:
            out = re.sub(pattern, "", out, flags=re.IGNORECASE).strip()
    out = re.sub(r"^[\s,;:\-]+", "", out).strip()
    out = re.sub(r"[\s,;:\-]+$", "", out).strip()
    return out


class QueryDecomposer:
    """
    Decomposes multi-intent natural language requests into structured atomic subqueries.

    Strategy:
      * normalize ellipses / discourse fillers,
      * split compound utterances on question marks, semicolons, commas and
        coordination conjunctions,
      * discard over-fragmented or near-duplicate fragments,
      * keep genuinely distinct orthogonal search intents.
    Deterministic by default, with optional LLM assistance.
    """

    def __init__(self, api_key: Optional[str] = None, use_llm: bool = False):
        self.api_key = api_key or settings.OPENAI_API_KEY
        self.use_llm = use_llm and bool(self.api_key)

    def decompose(self, query: str) -> List[SubQuery]:
        cleaned = query.strip()
        if not cleaned:
            return []

        if self.use_llm:
            try:
                subqueries = self._decompose_llm(cleaned)
                if subqueries:
                    return subqueries
            except Exception:
                pass

        return self._decompose_deterministic(cleaned)

    # ---------------------------------------------------------------- splits
    @staticmethod
    def _raw_segments(query: str) -> List[str]:
        q = re.sub(r"\.{2,}", " ", query)
        q = re.sub(r"[\u2026]", " ", q)
        q = re.sub(r"\s+", " ", q).strip()

        # 1. Explicit multi-questions: split on question marks.
        if q.count("?") > 1:
            return [p.strip() for p in re.split(r"\?+", q) if p.strip()]

        # 2. Split on semicolons, commas and coordination conjunctions.
        #    Conjunction splits are validated afterwards to avoid over-fragmenting.
        parts = re.split(
            r"(?:;|,\s*(?:and|then|also|or)?\s*|\s+(?:and|or|plus)\s+)",
            q,
            flags=re.IGNORECASE,
        )
        return [p.strip() for p in parts if p.strip()]

    @staticmethod
    def _is_question_like(fragment: str) -> bool:
        words = re.findall(r"\w+", fragment.lower())
        if not words:
            return False
        return words[0] in QUESTION_WORDS

    @staticmethod
    def _is_viable(fragment: str) -> bool:
        content = _content_words(fragment)
        if len(content) >= 2:
            return True
        if QueryDecomposer._is_question_like(fragment) and len(content) >= 1:
            return True
        if re.search(r"\d", fragment) and len(content) >= 1:
            return True
        return False

    @staticmethod
    def _is_duplicate(a: str, b: str) -> bool:
        ca, cb = set(_content_words(a)), set(_content_words(b))
        if not ca or not cb:
            return False
        union = ca | cb
        jaccard = len(ca & cb) / len(union)
        return jaccard >= 0.8

    def _decompose_deterministic(self, query: str) -> List[SubQuery]:
        segments = self._raw_segments(query)

        # Merge/clean fragments: too-short non-question fragments attach to the
        # previous segment instead of creating near-identical subqueries.
        merged: List[str] = []
        for seg in segments:
            cleaned = _strip_fillers(seg)
            if not cleaned:
                continue
            if merged and not self._is_viable(cleaned) and not self._is_question_like(cleaned):
                merged[-1] = f"{merged[-1]} {cleaned}".strip()
                continue
            merged.append(cleaned)

        if not merged:
            single = _strip_fillers(re.sub(r"\.{2,}", " ", query))
            merged = [single or query.strip()]

        # De-duplicate near-identical intents (keep the more specific one).
        unique: List[str] = []
        for frag in merged:
            duplicate = False
            for idx, existing in enumerate(unique):
                if self._is_duplicate(frag, existing):
                    if len(_content_words(frag)) > len(_content_words(existing)):
                        unique[idx] = frag
                    duplicate = True
                    break
            if not duplicate:
                unique.append(frag)

        subqueries: List[SubQuery] = []
        for idx, frag in enumerate(unique, start=1):
            sub_text = frag.strip()
            if not sub_text:
                continue
            if not sub_text.endswith("?"):
                sub_text += "?"
            subqueries.append(
                SubQuery(id=idx, query=sub_text, original_intent=query)
            )

        if not subqueries:
            subqueries = [SubQuery(
                id=1,
                query=query if query.endswith("?") else query + "?",
                original_intent=query,
            )]

        return subqueries

    # ---------------------------------------------------------------- llm
    def _decompose_llm(self, query: str) -> List[SubQuery]:
        from openai import OpenAI
        client = OpenAI(api_key=self.api_key)
        prompt = (
            f"Decompose the compound user question into atomic search-ready subqueries: '{query}'. "
            "Only create genuinely distinct intents; never duplicate near-identical queries. "
            "Return JSON object with key 'subqueries' as a list of query strings."
        )
        res = client.chat.completions.create(
            model=settings.LLM_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            response_format={"type": "json_object"}
        )
        data = json.loads(res.choices[0].message.content)
        q_list = data.get("subqueries", [])
        results = []
        for idx, sq in enumerate(q_list, start=1):
            if isinstance(sq, str) and sq.strip():
                results.append(SubQuery(id=idx, query=sq.strip(), original_intent=query))
        return results
