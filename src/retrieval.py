import os
import time
import math
import re
import threading
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
from pydantic import BaseModel, Field

from src.config import settings
from src.ingestion import DocumentChunk, CorpusIngestingEngine

_SHARED_EMBEDDER: Any = None
_SHARED_CROSS_ENCODER: Any = None
_MODEL_LOCK = threading.Lock()


def _offline_fast() -> bool:
    return os.getenv("TEST_OFFLINE_FAST", "0") == "1"


def _get_embedder():
    global _SHARED_EMBEDDER
    if _offline_fast():
        return None
    if _SHARED_EMBEDDER is None:
        with _MODEL_LOCK:
            if _SHARED_EMBEDDER is None:
                try:
                    from sentence_transformers import SentenceTransformer
                    _SHARED_EMBEDDER = SentenceTransformer(settings.LOCAL_EMBEDDING_MODEL)
                except Exception:
                    _SHARED_EMBEDDER = False
    return _SHARED_EMBEDDER or None


def _get_cross_encoder():
    global _SHARED_CROSS_ENCODER
    if _offline_fast():
        return None
    if _SHARED_CROSS_ENCODER is None:
        with _MODEL_LOCK:
            if _SHARED_CROSS_ENCODER is None:
                try:
                    from sentence_transformers import CrossEncoder
                    encoder = CrossEncoder(settings.RERANKER_MODEL)
                    try:
                        encoder.max_seq_length = settings.RERANK_MAX_LENGTH
                    except Exception:
                        pass
                    _SHARED_CROSS_ENCODER = encoder
                except Exception:
                    _SHARED_CROSS_ENCODER = False
    return _SHARED_CROSS_ENCODER or None


class RetrievedChunk(BaseModel):
    chunk_id: str
    source_file: str
    document_title: str
    page_number: int
    corpus: str = "Aventro Motors"
    chunk_index: int = 0
    text: str
    retrieval_score: float
    retrieval_method: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

    # Legacy attributes compatibility helper
    @property
    def document_id(self) -> str:
        return self.document_title

    @property
    def source(self) -> str:
        return self.source_file

    @property
    def page(self) -> int:
        return self.page_number


class BM25Retriever:
    """
    BM25 sparse retriever. Uses rank_bm25 when installed, otherwise a pure
    Python BM25Okapi-compatible implementation (k1=1.5, b=0.75) so the sparse
    leg is genuinely BM25 even fully offline.
    """

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.chunks: List[DocumentChunk] = []
        self.bm25 = None
        self.is_indexed: bool = False
        self.k1 = k1
        self.b = b
        self._doc_tokens: List[List[str]] = []
        self._doc_len: List[int] = []
        self._avgdl: float = 0.0
        self._df: Dict[str, int] = {}
        self._idf: Dict[str, float] = {}

    def tokenize(self, text: str) -> List[str]:
        return [w.lower() for w in re.findall(r"\w+", text)]

    def index(self, chunks: List[DocumentChunk]):
        self.chunks = chunks
        if not chunks:
            self.is_indexed = False
            return

        self._doc_tokens = [self.tokenize(c.text) for c in chunks]
        self._doc_len = [len(t) for t in self._doc_tokens]
        self._avgdl = (sum(self._doc_len) / len(self._doc_len)) if self._doc_len else 0.0

        self._df = {}
        for tokens in self._doc_tokens:
            for token in set(tokens):
                self._df[token] = self._df.get(token, 0) + 1
        n = len(self._doc_tokens)
        self._idf = {
            token: math.log((n - df + 0.5) / (df + 0.5) + 1.0)
            for token, df in self._df.items()
        }

        try:
            from rank_bm25 import BM25Okapi
            self.bm25 = BM25Okapi(self._doc_tokens, k1=self.k1, b=self.b)
        except ImportError:
            self.bm25 = None
        self.is_indexed = True

    def _bm25_scores(self, query_tokens: List[str]) -> List[float]:
        if self.bm25 is not None:
            return [float(s) for s in self.bm25.get_scores(query_tokens)]

        scores = [0.0] * len(self._doc_tokens)
        for token in query_tokens:
            idf = self._idf.get(token)
            if idf is None:
                continue
            for idx, tokens in enumerate(self._doc_tokens):
                tf = tokens.count(token)
                if tf == 0:
                    continue
                denom = tf + self.k1 * (1 - self.b + self.b * (self._doc_len[idx] / (self._avgdl or 1.0)))
                scores[idx] += idf * (tf * (self.k1 + 1)) / denom
        return scores

    def search(self, query: str, top_k: int = 10) -> List[RetrievedChunk]:
        if not self.is_indexed or not self.chunks:
            return []

        q_tokens = self.tokenize(query)
        if not q_tokens:
            return []

        scores = self._bm25_scores(q_tokens)
        top_indices = sorted(range(len(scores)), key=lambda i: scores[i], reverse=True)[:top_k]

        results: List[RetrievedChunk] = []
        for idx in top_indices:
            score = float(scores[idx])
            if score <= 0:
                continue
            c = self.chunks[idx]
            results.append(
                RetrievedChunk(
                    chunk_id=c.chunk_id,
                    source_file=c.source_file,
                    document_title=c.document_title,
                    page_number=c.page_number,
                    corpus=c.corpus,
                    chunk_index=c.chunk_index,
                    text=c.text,
                    retrieval_score=round(score, 4),
                    retrieval_method="sparse_bm25",
                    metadata=dict(c.metadata),
                )
            )
        return results


class ChromaDenseRetriever:
    """
    Dense vector retriever backed by persistent ChromaDB with local embeddings.
    The embedding model is lazily loaded and shared process-wide.
    """

    COLLECTION_NAME = "aventro_corpus"

    def __init__(self, chroma_dir: Optional[str] = None):
        self.chroma_dir = Path(chroma_dir or settings.CHROMA_DIR)
        self.chroma_dir.mkdir(parents=True, exist_ok=True)
        self.client = None
        self.collection = None
        self.chunks_map: Dict[str, DocumentChunk] = {}
        self.is_indexed: bool = False

    def _open_collection(self) -> bool:
        try:
            import chromadb
            self.client = chromadb.PersistentClient(path=str(self.chroma_dir))
            self.collection = self.client.get_or_create_collection(name=self.COLLECTION_NAME)
            return True
        except Exception as e:
            print(f"ChromaDB open warning: {e}")
            return False

    def attach(self, chunks: List[DocumentChunk]) -> bool:
        """Map cached chunks onto the persisted Chroma collection without re-embedding."""
        if not chunks:
            self.is_indexed = False
            return False
        self.chunks_map = {c.chunk_id: c for c in chunks}
        if _offline_fast():
            self.is_indexed = True
            return False
        if self._open_collection():
            try:
                if self.collection.count() == len(chunks):
                    self.is_indexed = True
                    return True
            except Exception:
                pass
        # Lexical fallback path is still usable.
        self.is_indexed = True
        return False

    def index(self, chunks: List[DocumentChunk]) -> bool:
        if not chunks:
            self.is_indexed = False
            return False

        self.chunks_map = {c.chunk_id: c for c in chunks}
        if _offline_fast():
            self.is_indexed = True
            return False
        if not self._open_collection():
            self.is_indexed = True
            return False

        model = _get_embedder()
        ids = [c.chunk_id for c in chunks]
        documents = [c.text for c in chunks]
        metadatas = [dict(c.metadata) for c in chunks]

        try:
            if model is not None:
                embeddings = model.encode(documents, show_progress_bar=False).tolist()
                self.collection.upsert(ids=ids, documents=documents, embeddings=embeddings, metadatas=metadatas)
            self.is_indexed = True
            return True
        except Exception as e:
            print(f"ChromaDB indexing warning: {e}")

        self.is_indexed = True
        return False

    def search(self, query: str, top_k: int = 10) -> List[RetrievedChunk]:
        if not self.is_indexed or not self.chunks_map:
            return []

        if self.collection is not None and not _offline_fast():
            model = _get_embedder()
            if model is not None:
                try:
                    q_emb = model.encode([query], show_progress_bar=False).tolist()
                    results = self.collection.query(query_embeddings=q_emb, n_results=top_k)
                    retrieved: List[RetrievedChunk] = []
                    if results and results.get("ids") and results["ids"]:
                        res_ids = results["ids"][0]
                        distances = results["distances"][0] if results.get("distances") else [0.5] * len(res_ids)
                        for cid, dist in zip(res_ids, distances):
                            if cid in self.chunks_map:
                                c = self.chunks_map[cid]
                                score = round(1.0 / (1.0 + float(dist)), 4)
                                retrieved.append(
                                    RetrievedChunk(
                                        chunk_id=c.chunk_id,
                                        source_file=c.source_file,
                                        document_title=c.document_title,
                                        page_number=c.page_number,
                                        corpus=c.corpus,
                                        chunk_index=c.chunk_index,
                                        text=c.text,
                                        retrieval_score=score,
                                        retrieval_method="dense_chromadb",
                                        metadata=dict(c.metadata),
                                    )
                                )
                    if retrieved:
                        return retrieved
                except Exception as e:
                    print(f"ChromaDB query error: {e}")

        # Lexical cosine fallback (offline-fast mode or missing embeddings).
        q_words = set(re.findall(r"\w+", query.lower()))
        scores = []
        for cid, c in self.chunks_map.items():
            c_words = set(re.findall(r"\w+", c.text.lower()))
            overlap = len(q_words.intersection(c_words))
            if overlap > 0:
                score = overlap / math.sqrt(len(q_words) * len(c_words) + 1)
                scores.append((cid, score))
        scores.sort(key=lambda x: x[1], reverse=True)

        results = []
        for cid, score in scores[:top_k]:
            c = self.chunks_map[cid]
            results.append(
                RetrievedChunk(
                    chunk_id=c.chunk_id,
                    source_file=c.source_file,
                    document_title=c.document_title,
                    page_number=c.page_number,
                    corpus=c.corpus,
                    chunk_index=c.chunk_index,
                    text=c.text,
                    retrieval_score=round(score, 4),
                    retrieval_method="dense_fallback",
                    metadata=dict(c.metadata),
                )
            )
        return results


class HybridRetriever:
    """
    Hybrid retrieval: Dense (ChromaDB) + Sparse (BM25) -> RRF fusion ->
    cross-encoder reranking (composite fallback) -> per-intent provenance.
    """

    def __init__(self, pdf_dir: Optional[str] = None):
        self.ingest_engine = CorpusIngestingEngine(pdf_dir=pdf_dir)
        self.sparse_retriever = BM25Retriever()
        self.dense_retriever = ChromaDenseRetriever()
        self.chunks: List[DocumentChunk] = []
        self.last_timings: Dict[str, float] = {
            "dense_retrieval_latency_ms": 0.0,
            "sparse_retrieval_latency_ms": 0.0,
            "fusion_latency_ms": 0.0,
            "reranking_latency_ms": 0.0,
        }
        self.last_query_events: List[Dict[str, Any]] = []

    # -------------------------------------------------------------- lifecycle
    def is_ready(self) -> bool:
        return len(self.chunks) > 0 and self.sparse_retriever.is_indexed

    def load_or_ingest(self, force: bool = False) -> Dict[str, Any]:
        """
        Load chunks from the persisted cache when it matches the corpus
        fingerprint; otherwise run full ingestion. Re-embeds only when the
        persisted Chroma collection is out of sync with the chunk set.
        """
        result = self.ingest_engine.run_ingestion(force=force)
        all_chunks = result.get("chunks", [])

        self.chunks = all_chunks
        self.sparse_retriever.index(all_chunks)

        dense_ok = False
        if all_chunks and not force:
            dense_ok = self.dense_retriever.attach(all_chunks)
        if all_chunks and (force or not dense_ok):
            self.dense_retriever.index(all_chunks)

        result["dense_attached"] = dense_ok
        return result

    def ingest_and_index(self, force: bool = True) -> int:
        result = self.load_or_ingest(force=force)
        return len(result.get("chunks", []))

    def warm_up(self):
        """Preload the embedding + reranker models outside the request path."""
        if _offline_fast():
            return
        _get_embedder()
        if settings.ENABLE_RERANKER:
            _get_cross_encoder()

    # ---------------------------------------------------------------- search
    def search(
        self,
        query: str,
        top_k: Optional[int] = None,
        rerank: bool = True
    ) -> List[RetrievedChunk]:
        results, timing = self._search_once(query, top_k=top_k, rerank=rerank)
        self.last_timings = {
            "dense_retrieval_latency_ms": timing["dense_ms"],
            "sparse_retrieval_latency_ms": timing["sparse_ms"],
            "fusion_latency_ms": timing["fusion_ms"],
            "reranking_latency_ms": timing["rerank_ms"],
        }
        self.last_query_events = [timing]
        return results

    def _search_once(
        self,
        query: str,
        top_k: Optional[int] = None,
        rerank: bool = True,
    ) -> Tuple[List[RetrievedChunk], Dict[str, Any]]:
        final_top_k = top_k or settings.FINAL_TOP_K

        dense_start = time.time()
        dense_results = self.dense_retriever.search(query, top_k=settings.DENSE_TOP_K)
        dense_ms = (time.time() - dense_start) * 1000

        sparse_start = time.time()
        sparse_results = self.sparse_retriever.search(query, top_k=settings.SPARSE_TOP_K)
        sparse_ms = (time.time() - sparse_start) * 1000

        fusion_start = time.time()
        fused = self._reciprocal_rank_fusion(
            dense_results, sparse_results, k=settings.RRF_K, top_k=settings.RRF_TOP_K
        )
        fusion_ms = (time.time() - fusion_start) * 1000

        rerank_ms = 0.0
        if rerank and settings.ENABLE_RERANKER and fused:
            rerank_start = time.time()
            candidates = [c.model_copy(deep=True) for c in fused]
            results = self._rerank(query, candidates, top_k=final_top_k)
            rerank_ms = (time.time() - rerank_start) * 1000
        else:
            results = [c.model_copy(deep=True) for c in fused[:final_top_k]]

        for c in results:
            meta = dict(c.metadata or {})
            meta["matched_queries"] = [query]
            c.metadata = meta

        timing = {
            "query": query,
            "dense_ms": round(dense_ms, 2),
            "sparse_ms": round(sparse_ms, 2),
            "fusion_ms": round(fusion_ms, 2),
            "rerank_ms": round(rerank_ms, 2),
            "dense_count": len(dense_results),
            "sparse_count": len(sparse_results),
            "fused_count": len(fused),
            "result_count": len(results),
        }
        return results, timing

    def search_parallel(
        self,
        queries: List[str],
        top_k: Optional[int] = None,
        rerank: bool = True,
    ) -> List[RetrievedChunk]:
        """Run dense+BM25+RRF+rerank for each intent in parallel, then unique-merge."""
        if not queries:
            self.last_query_events = []
            return []
        if len(queries) == 1:
            return self.search(queries[0], top_k=top_k, rerank=rerank)

        merged: Dict[str, RetrievedChunk] = {}
        timings: List[Dict[str, Any]] = []
        workers = min(8, len(queries))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [
                pool.submit(self._search_once, query, top_k, rerank) for query in queries
            ]
            for fut in as_completed(futures):
                chunks, timing = fut.result()
                timings.append(timing)
                for chunk in chunks:
                    prev = merged.get(chunk.chunk_id)
                    if prev is None:
                        merged[chunk.chunk_id] = chunk
                    else:
                        queries_prev = set((prev.metadata or {}).get("matched_queries", []))
                        queries_new = set((chunk.metadata or {}).get("matched_queries", []))
                        prev.metadata["matched_queries"] = sorted(queries_prev | queries_new)
                        if chunk.retrieval_score > prev.retrieval_score:
                            prev.retrieval_score = chunk.retrieval_score
                            prev.retrieval_method = chunk.retrieval_method

        order = {q: i for i, q in enumerate(queries)}
        timings.sort(key=lambda t: order.get(t["query"], 999))

        self.last_query_events = timings
        self.last_timings = {
            "dense_retrieval_latency_ms": round(sum(t["dense_ms"] for t in timings), 2),
            "sparse_retrieval_latency_ms": round(sum(t["sparse_ms"] for t in timings), 2),
            "fusion_latency_ms": round(sum(t["fusion_ms"] for t in timings), 2),
            "reranking_latency_ms": round(sum(t["rerank_ms"] for t in timings), 2),
        }

        ranked = sorted(merged.values(), key=lambda c: c.retrieval_score, reverse=True)
        cap = (top_k or settings.MAX_RETRIEVAL_CHUNKS) * max(1, len(queries))
        return ranked[:cap]

    def select_balanced_evidence(
        self,
        chunks: List[RetrievedChunk],
        max_total: int,
        per_intent_max: int = 2,
    ) -> List[RetrievedChunk]:
        """Round-robin selection so every intent keeps representation."""
        by_intent: Dict[str, List[RetrievedChunk]] = {}
        for c in chunks:
            matched = (c.metadata or {}).get("matched_queries") or ["_"]
            for q in matched:
                by_intent.setdefault(q, []).append(c)

        for q in by_intent:
            by_intent[q].sort(key=lambda c: c.retrieval_score, reverse=True)

        selected: List[RetrievedChunk] = []
        seen = set()
        depth = 0
        while len(selected) < max_total and depth < per_intent_max:
            added = False
            for q in by_intent:
                lst = by_intent[q]
                if depth < len(lst):
                    c = lst[depth]
                    if c.chunk_id not in seen:
                        selected.append(c)
                        seen.add(c.chunk_id)
                    added = True
                    if len(selected) >= max_total:
                        break
            if not added:
                break
            depth += 1
        return selected

    def rerank_candidates(
        self,
        query: str,
        candidates: List[RetrievedChunk],
        top_k: Optional[int] = None,
    ) -> List[RetrievedChunk]:
        if not candidates:
            return []
        cap = max(settings.RERANK_MAX_CANDIDATES, top_k or settings.FINAL_TOP_K)
        ordered = sorted(candidates, key=lambda c: c.retrieval_score, reverse=True)[:cap]
        copies = [c.model_copy(deep=True) for c in ordered]
        return self._rerank(query, copies, top_k=top_k or settings.FINAL_TOP_K)

    @staticmethod
    def merge_unique(*result_lists: List[RetrievedChunk]) -> List[RetrievedChunk]:
        merged: Dict[str, RetrievedChunk] = {}
        for lst in result_lists:
            for chunk in lst:
                prev = merged.get(chunk.chunk_id)
                if prev is None:
                    merged[chunk.chunk_id] = chunk
                else:
                    if chunk.retrieval_score > prev.retrieval_score:
                        prev.retrieval_score = chunk.retrieval_score
                        prev.retrieval_method = chunk.retrieval_method
                    queries_prev = set((prev.metadata or {}).get("matched_queries", []))
                    queries_new = set((chunk.metadata or {}).get("matched_queries", []))
                    prev.metadata["matched_queries"] = sorted(queries_prev | queries_new)
        return sorted(merged.values(), key=lambda c: c.retrieval_score, reverse=True)

    # ---------------------------------------------------------------- fusion
    def _reciprocal_rank_fusion(
        self,
        dense_results: List[RetrievedChunk],
        sparse_results: List[RetrievedChunk],
        k: int = 60,
        top_k: int = 15
    ) -> List[RetrievedChunk]:
        rrf_scores: Dict[str, float] = {}
        chunk_map: Dict[str, RetrievedChunk] = {}

        for rank, item in enumerate(dense_results, start=1):
            cid = item.chunk_id
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (k + rank))
            chunk_map[cid] = item

        for rank, item in enumerate(sparse_results, start=1):
            cid = item.chunk_id
            rrf_scores[cid] = rrf_scores.get(cid, 0.0) + (1.0 / (k + rank))
            if cid not in chunk_map:
                chunk_map[cid] = item

        sorted_cids = sorted(rrf_scores.keys(), key=lambda cid: rrf_scores[cid], reverse=True)
        fused_chunks: List[RetrievedChunk] = []

        for cid in sorted_cids[:top_k]:
            base_item = chunk_map[cid]
            fused_chunks.append(
                RetrievedChunk(
                    chunk_id=base_item.chunk_id,
                    source_file=base_item.source_file,
                    document_title=base_item.document_title,
                    page_number=base_item.page_number,
                    corpus=base_item.corpus,
                    chunk_index=base_item.chunk_index,
                    text=base_item.text,
                    retrieval_score=round(rrf_scores[cid], 5),
                    retrieval_method="hybrid_rrf",
                    metadata=dict(base_item.metadata),
                )
            )

        return fused_chunks

    # ---------------------------------------------------------------- rerank
    def _rerank(self, query: str, candidates: List[RetrievedChunk], top_k: int) -> List[RetrievedChunk]:
        if _offline_fast():
            return self._rerank_composite(query, candidates, top_k)

        encoder = _get_cross_encoder()
        if encoder is not None:
            try:
                if len(candidates) > settings.RERANK_MAX_CANDIDATES:
                    candidates = sorted(
                        candidates, key=lambda c: c.retrieval_score, reverse=True
                    )[:settings.RERANK_MAX_CANDIDATES]
                pairs = [[query, c.text] for c in candidates]
                scores = encoder.predict(pairs)
                for idx, c in enumerate(candidates):
                    raw_score = float(scores[idx])
                    prob = 1.0 / (1.0 + math.exp(-raw_score))
                    c.retrieval_score = round(prob, 4)
                    c.retrieval_method = "reranked_cross_encoder"
                candidates.sort(key=lambda x: x.retrieval_score, reverse=True)
                return candidates[:top_k]
            except Exception:
                pass
        return self._rerank_composite(query, candidates, top_k)

    def _rerank_composite(self, query: str, candidates: List[RetrievedChunk], top_k: int) -> List[RetrievedChunk]:
        # Try Jev for chunk scoring first
        if settings.JEV_API_KEY:
            try:
                from src.jev_client import JevClient
                client = JevClient(api_key=settings.JEV_API_KEY)
                for c in candidates:
                    state_context = f"Query: {query}\nChunk: {c.text}"
                    # Score chunk relevance from 0.0 to 1.0
                    score_val, conf = client.score(state=state_context, scale_min=0.0, scale_max=1.0)
                    # Blend with retrieval score
                    composite = (c.retrieval_score * 0.4) + (score_val * 0.6)
                    c.retrieval_score = round(composite, 5)
                    c.retrieval_method = "reranked_jev"
                candidates.sort(key=lambda x: x.retrieval_score, reverse=True)
                return candidates[:top_k]
            except Exception as e:
                print(f"Jev chunk scoring fallback: {e}")

        # Original lexical composite fallback
        q_words = set(re.findall(r"\w+", query.lower()))
        for c in candidates:
            c_words = set(re.findall(r"\w+", c.text.lower()))
            keyword_ratio = len(q_words.intersection(c_words)) / (len(q_words) + 1e-6)
            composite_score = c.retrieval_score * 0.7 + keyword_ratio * 0.3
            c.retrieval_score = round(composite_score, 5)
            c.retrieval_method = "reranked_composite"
        candidates.sort(key=lambda x: x.retrieval_score, reverse=True)
        return candidates[:top_k]
