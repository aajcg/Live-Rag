import pytest
from pathlib import Path
from src.ingestion import CorpusIngestingEngine
from src.config import settings

def test_aventro_corpus_discovery():
    engine = CorpusIngestingEngine()
    pdfs = engine.discover_pdfs()
    assert len(pdfs) > 0, "No Aventro PDFs discovered in data/aventro/pdf"
    assert len(pdfs) == 50, f"Expected 50 Aventro PDFs, found {len(pdfs)}"

def test_aventro_pdf_text_extraction():
    engine = CorpusIngestingEngine()
    pdfs = engine.discover_pdfs()
    assert len(pdfs) > 0

    sample_pdf = pdfs[0]
    chunks = engine.extract_chunks_from_pdf(sample_pdf)
    assert len(chunks) > 0
    
    first_chunk = chunks[0]
    assert first_chunk.source_file == sample_pdf.name
    assert first_chunk.document_title == sample_pdf.stem
    assert first_chunk.page_number >= 1
    assert first_chunk.corpus == "Aventro Motors"
    assert first_chunk.chunk_id.startswith("chk_")

def test_aventro_full_ingestion_pipeline():
    engine = CorpusIngestingEngine()
    result = engine.run_ingestion()
    assert result["pdfs_discovered"] == 50
    assert result["pages_processed"] > 0
    assert result["chunks_created"] > 0
    assert len(result["chunks"]) > 0


def test_chunk_cache_roundtrip_is_consistent():
    engine = CorpusIngestingEngine()
    first = engine.run_ingestion()
    second = engine.run_ingestion()
    assert second["chunks_created"] == first["chunks_created"]
    assert second.get("from_cache") is True
    assert [c.chunk_id for c in second["chunks"]] == [c.chunk_id for c in first["chunks"]]
