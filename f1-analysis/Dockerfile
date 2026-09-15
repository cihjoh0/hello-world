FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Most PaaS hosts (Railway, Render, Fly.io, Cloud Run) inject $PORT and
# expect the process to bind to it rather than a fixed port.
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
