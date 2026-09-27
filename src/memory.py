import re
import threading
import time
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from src.controller import STOPWORDS

QUALIFIER_PREFIXES = (
    "only ",
    "specifically ",
    "what about ",
    "including ",
    "except ",
    "just ",
    "also ",
    "and ",
    "for the ",
    "in the ",
    "for india",
    "international",
)

DISCOURSE_MARKERS = (
    "actually",
    "i mean",
    "by the way",
    "oh and",
    "note that",
    "in that case",
    "one more thing",
    "additionally",
    "and also",
    "correction",
)

CONSTRAINT_MARKERS = (
    "international",
    "domestic",
    "after",
    "before",
    "expired",
    "ended",
    "instead",
    "except",
    "excluding",
    "including",
    "only",
    "applies to",
    "does not apply",
    "was made",
    "was done",
    "was booked",
    "if the",
    "in case",
)

QUESTION_STARTERS = (
    "what", "how", "why", "where", "when", "who", "which", "whose",
    "do", "does", "did", "is", "are", "was", "were",
    "can", "could", "should", "would", "will",
    "tell", "show", "give", "explain", "list", "describe", "define", "compare",
    "summarize", "summarise",
)


def _content_words(text: str) -> List[str]:
    return [
        w for w in re.findall(r"[A-Za-z0-9%]+", (text or "").lower())
        if len(w) > 1 and w not in STOPWORDS
    ]


class SessionState(BaseModel):
    session_id: str
    created_at: float = Field(default_factory=time.time)
    updated_at: float = Field(default_factory=time.time)
    transcript_history: List[str] = Field(default_factory=list)
    transcript_buffer: str = ""
    previous_query: Optional[str] = None
    previous_subqueries: List[str] = Field(default_factory=list)
    previous_evidence: List[Dict[str, Any]] = Field(default_factory=list)
    previous_answer: Optional[str] = None
    previous_claims: List[Dict[str, Any]] = Field(default_factory=list)
    previous_citations: List[Dict[str, Any]] = Field(default_factory=list)
    answer_version: int = 0
    relevant_constraints: Dict[str, Any] = Field(default_factory=dict)
    last_was_provisional: bool = False
    turn_count: int = 0

    # ------------------------------------------------------------- transcripts
    def add_transcript_chunk(self, chunk: str):
        if not self.transcript_buffer:
            self.transcript_buffer = chunk.strip()
        else:
            self.transcript_buffer += " " + chunk.strip()
        self.transcript_history.append(chunk.strip())
        self.updated_at = time.time()

    def update_turn_result(
        self,
        query: str,
        subqueries: List[str],
        evidence: List[Dict[str, Any]],
        answer: str,
        constraints: Optional[Dict[str, Any]] = None,
        clear_buffer: bool = True,
        provisional: bool = False,
        claims: Optional[List[Dict[str, Any]]] = None,
        citations: Optional[List[Dict[str, Any]]] = None,
    ):
        self.previous_query = query
        self.previous_subqueries = subqueries
        self.previous_evidence = evidence
        self.previous_answer = answer
        if claims is not None:
            self.previous_claims = claims
        if citations is not None:
            self.previous_citations = citations
        self.answer_version += 1
        self.turn_count += 1
        self.last_was_provisional = provisional
        if constraints:
            self.relevant_constraints.update(constraints)
        if clear_buffer:
            self.transcript_buffer = ""
        self.updated_at = time.time()

    # ------------------------------------------------------------- refinement
    def _previous_focus_terms(self) -> set:
        focus = _content_words(self.previous_query or "")
        for sq in self.previous_subqueries:
            focus.extend(_content_words(sq))
        return set(focus)

    def is_late_detail(self, transcript: str) -> bool:
        """
        True when the incoming utterance refines the established session topic
        (utterance continuation, qualifier clause, discourse marker, or a
        statement-style late constraint) instead of starting a new question.
        """
        if not self.previous_evidence or self.answer_version < 1:
            return False

        cur = (transcript or "").strip()
        if not cur:
            return False
        cur_lower = cur.lower().rstrip("?.!").strip()
        prev = (self.previous_query or "").lower().rstrip("?.!").strip()

        # 1. Continuation of a provisional (still-open) utterance.
        if prev and self.last_was_provisional and (cur_lower.startswith(prev) or prev in cur_lower):
            return True

        # 2. Explicit prefix continuation of the previous query.
        if prev and cur_lower != prev and cur_lower.startswith(prev):
            return True

        # 3. Qualifier / discourse-marker refinements.
        if any(cur_lower.startswith(prefix) for prefix in QUALIFIER_PREFIXES):
            return True
        if any(marker in cur_lower for marker in DISCOURSE_MARKERS):
            return True

        # 4. Statement-style late constraint (not a new question) that shares
        #    topic vocabulary with the established session focus.
        words = re.findall(r"\w+", cur_lower)
        if not words:
            return False
        starts_question = words[0] in QUESTION_STARTERS or cur.endswith("?")
        cur_content = set(_content_words(cur))
        overlap = len(cur_content & self._previous_focus_terms())
        has_marker = any(marker in cur_lower for marker in CONSTRAINT_MARKERS)

        if not starts_question and len(cur_content) >= 2 and (has_marker or overlap >= 2):
            return True

        return False

    def new_intent_text(self, transcript: str) -> str:
        """Extract the delta clause introduced by a late-detail utterance."""
        cur = (transcript or "").strip()
        prev = (self.previous_query or "").rstrip("?.!").strip()
        if prev and cur.lower().startswith(prev.lower()):
            cur = cur[len(prev):].strip(" ?.!,;:-") or transcript.strip()

        cleaned = cur
        for marker in sorted(DISCOURSE_MARKERS, key=len, reverse=True):
            cleaned = re.sub(rf"^(?:{re.escape(marker)})\b[\s,]*", "", cleaned, flags=re.IGNORECASE).strip()
        cleaned = re.sub(r"^(?:and|also|but|however|so|then)\b[\s,]*", "", cleaned, flags=re.IGNORECASE).strip()
        return cleaned or cur

    def build_delta_query(self, transcript: str) -> str:
        """Context-preserving search query: prior focus + late constraint."""
        delta = self.new_intent_text(transcript)
        prev = (self.previous_query or "").rstrip("?.!").strip()
        if not prev:
            return delta
        return f"{prev} | additional constraint: {delta.rstrip('?.!')}"

    def get_refined_query(self, new_query: str) -> str:
        """
        Refines an ambiguous or context-dependent turn query using session history.
        E.g., Turn 1: "What events are covered?"
              Turn 2: "Only international events."
              Refined -> "What events are covered? - additional constraint: only international events"
        """
        if not self.previous_query:
            return new_query

        n_lower = new_query.lower().strip()
        if self.is_late_detail(new_query):
            return self.build_delta_query(new_query)

        is_qualifier = (
            n_lower.startswith("only ") or
            n_lower.startswith("specifically ") or
            n_lower.startswith("what about ") or
            n_lower.startswith("including ") or
            n_lower.startswith("except ") or
            (len(new_query.split()) <= 4 and not any(w in n_lower for w in QUESTION_STARTERS))
        )

        if is_qualifier:
            prev_clean = self.previous_query.rstrip("?.!")
            return f"{prev_clean} - additional constraint: {new_query.strip()}"

        return new_query

    def extract_delta_constraints(self, transcript: str) -> List[str]:
        """New content words / markers introduced by the late constraint."""
        delta = self.new_intent_text(transcript)
        delta_content = _content_words(delta)
        prior_focus = self._previous_focus_terms()
        terms: List[str] = []
        for word in delta_content:
            if word not in prior_focus and word not in terms:
                terms.append(word)
        lowered = delta.lower()
        for marker in ("international", "domestic", "after", "before", "expired", "ended", "except", "only", "instead"):
            if marker in lowered and marker not in terms:
                terms.append(marker)
        return terms

    def extract_constraint_terms(self, text: str) -> List[str]:
        lowered = (text or "").lower()
        terms: List[str] = []
        for prefix in ("only ", "specifically ", "including ", "except ", "just "):
            if prefix in lowered:
                tail = lowered.split(prefix, 1)[1]
                token = re.split(r"[?.!,;]", tail, maxsplit=1)[0].strip()
                if token:
                    terms.append(token)
        for keyword in ("international", "domestic", "india", "zoom", "warranty", "after", "before", "expired"):
            if keyword in lowered and keyword not in terms:
                terms.append(keyword)
        existing = list(self.relevant_constraints.get("terms", []))
        merged = []
        for term in existing + terms:
            if term and term not in merged:
                merged.append(term)
        return merged


class SessionMemoryManager:
    """
    In-process, thread-safe session memory manager. State is strictly scoped to
    a session id; nothing is shared across independent sessions.
    """
    def __init__(self):
        self._sessions: Dict[str, SessionState] = {}
        self._lock = threading.Lock()

    def get_or_create_session(self, session_id: str) -> SessionState:
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = SessionState(session_id=session_id)
            return self._sessions[session_id]

    def get_session(self, session_id: str) -> Optional[SessionState]:
        with self._lock:
            return self._sessions.get(session_id)

    def clear_session(self, session_id: str):
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]

    def session_count(self) -> int:
        with self._lock:
            return len(self._sessions)
