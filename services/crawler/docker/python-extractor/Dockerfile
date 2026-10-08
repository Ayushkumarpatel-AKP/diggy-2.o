# Optional Python extractor sidecar for @diggy/crawler.
#
# Not a Node build dependency. Build and run it only if you want the Python
# extraction tier:
#
#   docker build -t diggy-python-extractor services/crawler/docker/python-extractor
#   docker run --rm -p 127.0.0.1:17323:17323 diggy-python-extractor
#   # then, for the crawler:
#   $env:PYTHON_EXTRACTOR_URL = "http://127.0.0.1:17323"
#
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libxml2 libxslt1.1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY extractor.py ./

EXPOSE 17323

# Bind loopback inside the container; publish only to 127.0.0.1 on the host.
CMD ["uvicorn", "extractor:app", "--host", "127.0.0.1", "--port", "17323"]
