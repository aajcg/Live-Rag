import os
import time
import json
import hashlib
from pathlib import Path
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from src.config import settings

class DocumentChunk(BaseModel):
    chunk_id: str
    source_file: str
    document_title: str
    page_number: int
    corpus: str = "Aventro Motors"
    chunk_index: int
    text: str
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

class CorpusIngestingEngine:
    """
    Ingestion engine for discovering and extracting text from Aventro Motors PDFs,
    creating structured chunks with page-level metadata preservation.
    """

    def __init__(
        self, 
        pdf_dir: Optional[str] = None, 
        chunk_size: Optional[int] = None,
        chunk_overlap: Optional[int] = None,
        index_dir: Optional[str] = None,
    ):
        self.pdf_dir = Path(pdf_dir or settings.AVENTRO_PDF_DIR)
        self.chunk_size = chunk_size or settings.CHUNK_SIZE
        self.chunk_overlap = chunk_overlap or settings.CHUNK_OVERLAP
        self.index_dir = Path(index_dir or settings.INDEX_DIR)
        self.cache_file = self.index_dir / "chunks.json"

    def discover_pdfs(self) -> List[Path]:
        if not self.pdf_dir.exists():
            # Fallback check for root data directory or corpus dir
            fallback = Path(settings.DATA_DIR) / "aventro" / "pdf"
            if fallback.exists():
                self.pdf_dir = fallback
            else:
                return []
        
        pdf_files = list(self.pdf_dir.glob("*.pdf"))
        if not pdf_files:
            # Recursive check if nested
            pdf_files = list(self.pdf_dir.rglob("*.pdf"))
        return sorted(pdf_files)

    def extract_chunks_from_pdf(self, pdf_path: Path) -> List[DocumentChunk]:
        filename = pdf_path.name
        document_title = pdf_path.stem
        all_chunks: List[DocumentChunk] = []

        pages_data = self._extract_pages_text(pdf_path)

        for page_num, raw_text in pages_data:
            page_chunks = self._chunk_page_text(
                raw_text=raw_text,
                source_file=filename,
                document_title=document_title,
                page_number=page_num
            )
            all_chunks.extend(page_chunks)

        return all_chunks

    def _extract_pages_text(self, pdf_path: Path) -> List[tuple[int, str]]:
        pages: List[tuple[int, str]] = []
        
        # 1. Try PyMuPDF
        try:
            try:
                import pymupdf as fitz
            except ImportError:
                import fitz  # type: ignore
            doc = fitz.open(pdf_path)
            for i, page in enumerate(doc, start=1):
                text = page.get_text()
                if text and text.strip():
                    pages.append((i, text.strip()))
            doc.close()
            if pages:
                return pages
        except Exception:
            pass

        # 2. Try pypdf fallback
        try:
            import pypdf
            reader = pypdf.PdfReader(pdf_path)
            for i, page in enumerate(reader.pages, start=1):
                text = page.extract_text()
                if text and text.strip():
                    pages.append((i, text.strip()))
            if pages:
                return pages
        except Exception as e:
            print(f"Failed extracting PDF {pdf_path.name}: {e}")

        return pages

    def _chunk_page_text(
        self,
        raw_text: str,
        source_file: str,
        document_title: str,
        page_number: int
    ) -> List[DocumentChunk]:
        chunks: List[DocumentChunk] = []
        words = raw_text.split()
        if not words:
            return []

        step = max(1, self.chunk_size - self.chunk_overlap)
        chunk_idx = 0

        for i in range(0, len(words), step):
            chunk_words = words[i:i + self.chunk_size]
            chunk_str = " ".join(chunk_words)
            if not chunk_str.strip():
                continue

            # Deterministic, idempotent chunk ID
            hash_input = f"{source_file}_{page_number}_{chunk_idx}_{chunk_words[0]}"
            chunk_id = f"chk_{hashlib.md5(hash_input.encode()).hexdigest()[:12]}"

            metadata = {
                "source_file": source_file,
                "document_title": document_title,
                "page_number": page_number,
                "corpus": "Aventro Motors",
                "chunk_id": chunk_id,
                "chunk_index": chunk_idx
            }

            chunks.append(
                DocumentChunk(
                    chunk_id=chunk_id,
                    source_file=source_file,
                    document_title=document_title,
                    page_number=page_number,
                    corpus="Aventro Motors",
                    chunk_index=chunk_idx,
                    text=chunk_str,
                    metadata=metadata
                )
            )
            chunk_idx += 1

        return chunks

    # ---------------------------------------------------------------- caching
    def corpus_fingerprint(self, pdf_files: List[Path]) -> str:
        parts = [f"{self.chunk_size}:{self.chunk_overlap}"]
        for p in pdf_files:
            try:
                stat = p.stat()
                parts.append(f"{p.name}:{stat.st_size}:{int(stat.st_mtime)}")
            except OSError:
                parts.append(f"{p.name}:missing")
        return hashlib.sha256("|".join(parts).encode("utf-8")).hexdigest()

    def _load_cached_chunks(self, fingerprint: str) -> Optional[List[DocumentChunk]]:
        if not settings.CACHE_CHUNKS or not self.cache_file.exists():
            return None
        try:
            with open(self.cache_file, "r", encoding="utf-8") as f:
                payload = json.load(f)
            if payload.get("fingerprint") != fingerprint:
                return None
            return [DocumentChunk(**c) for c in payload.get("chunks", [])]
        except Exception:
            return None

    def _write_cached_chunks(self, fingerprint: str, chunks: List[DocumentChunk]):
        if not settings.CACHE_CHUNKS:
            return
        try:
            self.index_dir.mkdir(parents=True, exist_ok=True)
            payload = {"fingerprint": fingerprint, "chunks": [c.model_dump() for c in chunks]}
            tmp = self.cache_file.with_suffix(".tmp")
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(payload, f)
            os.replace(tmp, self.cache_file)
        except Exception as e:
            print(f"Chunk cache write warning: {e}")

    # -------------------------------------------------------------- ingestion
    def run_ingestion(self, force: bool = False) -> Dict[str, Any]:
        start_time = time.time()
        pdf_files = self.discover_pdfs()
        fingerprint = self.corpus_fingerprint(pdf_files)

        if not force:
            cached = self._load_cached_chunks(fingerprint)
            if cached:
                return {
                    "pdfs_discovered": len(pdf_files),
                    "pages_processed": len({(c.source_file, c.page_number) for c in cached}),
                    "chunks_created": len(cached),
                    "chunks_indexed": 0,
                    "from_cache": True,
                    "duration_s": round(time.time() - start_time, 2),
                    "chunks": cached,
                }

        total_pages = 0
        all_chunks: List[DocumentChunk] = []

        for pdf_path in pdf_files:
            chunks = self.extract_chunks_from_pdf(pdf_path)
            all_chunks.extend(chunks)
            pages_in_pdf = max([c.page_number for c in chunks], default=0)
            total_pages += pages_in_pdf

        self._write_cached_chunks(fingerprint, all_chunks)
        duration = round(time.time() - start_time, 2)
        return {
            "pdfs_discovered": len(pdf_files),
            "pages_processed": total_pages,
            "chunks_created": len(all_chunks),
            "chunks_indexed": len(all_chunks),
            "from_cache": False,
            "duration_s": duration,
            "chunks": all_chunks
        }

def main():
    start_time = time.time()
    engine = CorpusIngestingEngine()
    pdf_files = engine.discover_pdfs()

    print("==================================================")
    print("AVENTRO MOTORS CORPUS INGESTION")
    print("==================================================")
    print(f"Discovered PDFs : {len(pdf_files)}")

    total_pages = 0
    total_chunks = 0

    all_chunks = []
    for pdf_path in pdf_files:
        chunks = engine.extract_chunks_from_pdf(pdf_path)
        all_chunks.extend(chunks)
        pages_in_pdf = max([c.page_number for c in chunks], default=0)
        total_pages += pages_in_pdf
        total_chunks += len(chunks)

    duration = round(time.time() - start_time, 2)

    print(f"Pages Processed : {total_pages}")
    print(f"Chunks Created  : {total_chunks}")
    print(f"Duration        : {duration}s")
    print("==================================================")

if __name__ == "__main__":
    main()
