import os
from pydantic import ConfigDict
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    model_config = ConfigDict(env_file=".env", extra="ignore")

    PROJECT_NAME: str = "Streaming Live RAG Engine"
    VERSION: str = "1.0.0"
    
    # LLM & Embedding Settings
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    LLM_MODEL: str = os.getenv("LLM_MODEL", "gpt-4o-mini")
    EMBEDDING_PROVIDER: str = os.getenv("EMBEDDING_PROVIDER", "local")
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "text-embedding-3-small")
    LOCAL_EMBEDDING_MODEL: str = os.getenv("LOCAL_EMBEDDING_MODEL", "sentence-transformers/all-MiniLM-L6-v2")
    
    # Reranker Settings
    ENABLE_RERANKER: bool = os.getenv("ENABLE_RERANKER", "true").lower() in ("true", "1", "yes")
    RERANKER_MODEL: str = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
    RERANK_MAX_LENGTH: int = int(os.getenv("RERANK_MAX_LENGTH", "256"))
    
    # Paths
    DATA_DIR: str = os.getenv("DATA_DIR", "data")
    AVENTRO_PDF_DIR: str = os.getenv("AVENTRO_PDF_DIR", "data/aventro/pdf")
    CORPUS_DIR: str = os.getenv("CORPUS_DIR", "data/aventro/pdf")
    CHROMA_DIR: str = os.getenv("CHROMA_DIR", "data/chroma")
    INDEX_DIR: str = os.getenv("INDEX_DIR", "data/index")
    LOG_DIR: str = os.getenv("LOG_DIR", "logs")
    CACHE_CHUNKS: bool = os.getenv("CACHE_CHUNKS", "true").lower() in ("true", "1", "yes")
    
    # Retrieval & Chunking Parameters
    CHUNK_SIZE: int = int(os.getenv("CHUNK_SIZE", "600"))
    CHUNK_OVERLAP: int = int(os.getenv("CHUNK_OVERLAP", "100"))
    DENSE_TOP_K: int = int(os.getenv("DENSE_TOP_K", "10"))
    SPARSE_TOP_K: int = int(os.getenv("SPARSE_TOP_K", "10"))
    RRF_TOP_K: int = int(os.getenv("RRF_TOP_K", "12"))
    RERANK_MAX_CANDIDATES: int = int(os.getenv("RERANK_MAX_CANDIDATES", "12"))
    FINAL_TOP_K: int = int(os.getenv("FINAL_TOP_K", "5"))
    MAX_RETRIEVAL_CHUNKS: int = int(os.getenv("MAX_RETRIEVAL_CHUNKS", "5"))
    RRF_K: int = int(os.getenv("RRF_K", "60"))
    STABILITY_CONFIDENCE_THRESHOLD: float = float(os.getenv("STABILITY_CONFIDENCE_THRESHOLD", "0.75"))

settings = Settings()