"""
Optional Python extractor sidecar for @diggy/crawler.

This service is **not** a Node build dependency: the crawler only talks to it
over HTTP when `PYTHON_EXTRACTOR_URL` is set. It exposes one endpoint that the
`python-sidecar` provider uses.

    POST /extract  { "url": "...", "engine": "trafilatura" | "newspaper" }
        -> { "title": str, "markdown": str, "engine": str }

`trafilatura` is the default (light, high quality). `newspaper3k` and, if
installed, `crawl4ai` are selectable. Install only what you need.
"""
from __future__ import annotations

import os
from typing import Optional

import httpx
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title="diggy-python-extractor", version="2.0.0")

DEFAULT_ENGINE = os.environ.get("PYTHON_EXTRACTOR_ENGINE", "trafilatura")
USER_AGENT = "Mozilla/5.0 (compatible; DiggyBot/0.1)"


class ExtractRequest(BaseModel):
    url: str
    engine: Optional[str] = None


class ExtractResponse(BaseModel):
    title: str
    markdown: str
    engine: str


def _fetch(url: str) -> str:
    with httpx.Client(follow_redirects=True, timeout=25.0, headers={"user-agent": USER_AGENT}) as client:
        response = client.get(url)
        response.raise_for_status()
        return response.text


def _trafilatura(html: str, url: str) -> tuple[str, str]:
    import trafilatura

    markdown = trafilatura.extract(
        html, url=url, output_format="markdown", include_links=True, with_metadata=True
    )
    metadata = trafilatura.extract_metadata(html)
    title = (getattr(metadata, "title", None) or "").strip()
    return title, (markdown or "").strip()


def _newspaper(html: str, url: str) -> tuple[str, str]:
    from newspaper import Article

    article = Article(url)
    article.download(input_html=html)
    article.parse()
    return (article.title or "").strip(), (article.text or "").strip()


ENGINES = {"trafilatura": _trafilatura, "newspaper": _newspaper}


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "engine": DEFAULT_ENGINE, "available": sorted(ENGINES)}


@app.post("/extract", response_model=ExtractResponse)
def extract(request: ExtractRequest) -> ExtractResponse:
    engine = (request.engine or DEFAULT_ENGINE).strip().lower()
    extractor = ENGINES.get(engine)
    if extractor is None:
        raise ValueError(f"unknown engine: {engine}. available: {sorted(ENGINES)}")

    html = _fetch(request.url)
    title, markdown = extractor(html, request.url)
    return ExtractResponse(title=title or request.url, markdown=markdown, engine=engine)
