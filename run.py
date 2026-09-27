#!/usr/bin/env python
"""
Single-command runner for the Streaming Live RAG engine (Samsung Theme 4).

Usage:
    python run.py ingest [--force]     # build/refresh the corpus index
    python run.py serve [--port 8000]  # start the FastAPI + SSE server
    python run.py demo [--fast]        # scripted live streaming demonstration
    python run.py benchmark            # run the G2-G6 benchmark harness
    python run.py test                 # run the automated test suite
"""
import argparse
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
os.chdir(ROOT)


def cmd_ingest(args) -> int:
    from src.pipeline import RAGPipeline
    pipeline = RAGPipeline(auto_ingest=False)
    result = pipeline.retriever.load_or_ingest(force=args.force)
    print(
        f"Ingestion complete: {len(result.get('chunks', []))} chunks "
        f"(from_cache={result.get('from_cache')}, dense_attached={result.get('dense_attached')}, "
        f"{result.get('duration_s')}s)"
    )
    return 0


def cmd_serve(args) -> int:
    import uvicorn
    uvicorn.run("src.main:app", host=args.host, port=args.port, reload=args.reload)
    return 0


def cmd_demo(args) -> int:
    if args.fast:
        os.environ["TEST_OFFLINE_FAST"] = "1"
    from scripts.demo import run_demo
    return run_demo(fast=args.fast)


def cmd_benchmark(args) -> int:
    from benchmark.run_benchmark import main as benchmark_main
    return benchmark_main()


def cmd_test(args) -> int:
    cmd = [sys.executable, "-m", "pytest", "-q"]
    if args.verbose:
        cmd = [sys.executable, "-m", "pytest", "-v"]
    return subprocess.call(cmd, cwd=str(ROOT))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="run.py", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    p_ingest = sub.add_parser("ingest", help="build/refresh the corpus index")
    p_ingest.add_argument("--force", action="store_true", help="force full re-extraction and re-embedding")
    p_ingest.set_defaults(func=cmd_ingest)

    p_serve = sub.add_parser("serve", help="start the API server")
    p_serve.add_argument("--host", default="0.0.0.0")
    p_serve.add_argument("--port", type=int, default=8000)
    p_serve.add_argument("--reload", action="store_true")
    p_serve.set_defaults(func=cmd_serve)

    p_demo = sub.add_parser("demo", help="scripted streaming demo")
    p_demo.add_argument("--fast", action="store_true", help="offline-fast mode (no model downloads)")
    p_demo.set_defaults(func=cmd_demo)

    p_bench = sub.add_parser("benchmark", help="run G2-G6 benchmark harness")
    p_bench.set_defaults(func=cmd_benchmark)

    p_test = sub.add_parser("test", help="run the test suite")
    p_test.add_argument("--verbose", action="store_true")
    p_test.set_defaults(func=cmd_test)
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
