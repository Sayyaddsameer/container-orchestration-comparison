# Stage 1: Build dependencies
FROM python:3.11-alpine AS builder

WORKDIR /usr/src/app

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

COPY . .

# Stage 2: Production
FROM python:3.11-alpine

WORKDIR /usr/src/app

COPY --from=builder /install /usr/local
COPY --from=builder /usr/src/app .

ENV API_PORT=3000
EXPOSE 3000

CMD ["gunicorn", "--bind", "0.0.0.0:3000", "--workers", "2", "--timeout", "120", "app:app"]
