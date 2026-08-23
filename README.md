# Container Orchestration Comparison — Docker Swarm vs Kubernetes (k3s)

So I wanted to actually understand the real differences between Docker Swarm and Kubernetes — not just the blog post version, but what it actually feels like to deploy, manage, and debug the same app on both platforms. This project is the result of that exploration.

I built a simple three-tier app (frontend → API → database), deployed it to both Swarm and k3s, and ran a bunch of benchmarks to see how they compare on things that actually matter in production: startup time, resource usage, rolling updates, failure recovery, and scaling.

## What's in here

```
├── api/                        # Python/Flask API service
│   ├── app.py                  # Three endpoints: /health, /data, /stress
│   ├── Dockerfile              # Multi-stage build, python:3.11-alpine
│   └── requirements.txt
├── frontend/                   # Nginx-based frontend
│   ├── index.html              # Dashboard UI with API interaction
│   ├── nginx.conf              # Reverse proxy config for /api/
│   └── Dockerfile
├── k8s/                        # Kubernetes manifests (11 files)
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── pvc.yaml
│   ├── db-deployment.yaml
│   ├── db-service.yaml
│   ├── api-deployment.yaml     # 2 replicas, rolling update, resource limits
│   ├── api-service.yaml
│   ├── frontend-deployment.yaml
│   ├── frontend-service.yaml
│   └── hpa.yaml                # Autoscaler: 2-6 pods, 50% CPU target
├── k6/                         # Load testing
│   └── load-test.js
├── docker-compose.yml          # Local dev / evaluation setup
├── docker-compose.swarm.yml    # Swarm stack definition
├── submission.json             # Benchmark results (raw numbers)
├── report.md                   # Full analysis and decision framework
└── .env.example                # All required environment variables
```

## The application

Pretty straightforward three-tier setup:

- **Frontend** — Nginx serving a static dashboard that proxies API calls through `/api/`
- **API** — Python Flask app with three endpoints:
  - `GET /health` — basic health check, returns status and version
  - `GET /data` — queries PostgreSQL for the current timestamp
  - `GET /stress` — runs 10,000 SHA-256 hash iterations (for load testing)
- **Database** — PostgreSQL 15, nothing fancy

All configuration is pulled from environment variables. No credentials are hardcoded anywhere — the API reads from env vars, Swarm uses `${VAR:-default}` syntax, and Kubernetes uses ConfigMaps and Secrets.

## Getting started

### Prerequisites

- Docker and Docker Compose
- For Kubernetes testing: k3d or minikube
- For load testing: k6 (optional)

### Quick local run

```bash
cp .env.example .env
docker-compose up -d --build
```

That'll spin up all three services with health checks. Give it a minute, then hit:
- Frontend: http://localhost:8080
- API directly: http://localhost:3000/health

### Docker Swarm

```bash
# Build the API image first
docker build -t myapp-api:v1 ./api

# Init swarm and deploy
docker swarm init
docker stack deploy -c docker-compose.swarm.yml myapp

# Check status
docker service ls
docker service ps myapp_api
```

### Kubernetes (k3s)

```bash
# Create a local k3s cluster
k3d cluster create mycluster

# Build and import the images
docker build -t myapp-api:v1 ./api
docker build -t myapp-frontend:latest ./frontend
k3d image import myapp-api:v1 myapp-frontend:latest -c mycluster

# Deploy everything
kubectl apply -f k8s/

# Watch it come up
kubectl get all -n myapp
```

## The benchmarks

I tested six things on both platforms. Here's the quick version:

| What I tested | Swarm | k3s |
|---|---|---|
| Bootstrap time | 12.4s | 38.7s |
| Idle CPU overhead | 15m | 85m |
| Idle memory overhead | 78 MB | 312 MB |
| Rolling update (zero-downtime) | 22.6s, 0 errors | 35.2s, 0 errors |
| Failure recovery | 4.8s | 8.5s |
| Config lines needed | 66 | 255 |

Kubernetes also gets autoscaling (Swarm doesn't have it) — the HPA scaled from 2 to 6 pods in about 45 seconds under load, and scaled back down in ~5 minutes.

The full analysis with methodology and a decision framework for choosing between them is in [report.md](report.md).

## The short version

**Swarm** is faster, lighter, and way simpler to set up. If you've got a small team and a handful of services, it just works.

**Kubernetes** eats more resources and takes longer to configure, but you get autoscaling, a massive ecosystem, and the kind of fine-grained control you'll eventually need if your app grows beyond a few services.

Neither is universally "better" — it depends on what you're building and who's maintaining it. The report goes into a lot more detail on when to pick which.

## Environment variables

Copy `.env.example` to `.env` and adjust as needed:

| Variable | Description | Default |
|---|---|---|
| `POSTGRES_USER` | Database username | `appuser` |
| `POSTGRES_PASSWORD` | Database password | `changeme` |
| `POSTGRES_DB` | Database name | `appdb` |
| `POSTGRES_HOST` | Database hostname | `db` |
| `POSTGRES_PORT` | Database port | `5432` |
| `API_PORT` | API server port | `3000` |
| `APP_VERSION` | Version reported by /health | `v1.0.0` |
| `STRESS_ITERATIONS` | Hash iterations for /stress | `10000` |

## Load testing

There's a k6 script in `k6/load-test.js` that hits all three endpoints:

```bash
k6 run --env BASE_URL=http://localhost:3000 k6/load-test.js
```

It runs health checks and data queries at constant load, then ramps up stress test traffic to trigger autoscaling on Kubernetes.
