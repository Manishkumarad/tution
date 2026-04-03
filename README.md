# Tuition SaaS Platform

Production-ready multi-tenant tuition management platform with React frontend, Node.js/Express backend, PostgreSQL, Docker workflows, and Kubernetes deployment manifests.

## Overview

This repository contains:

- Frontend web app for faculty/admin, student pass, and parent portal
- Backend API with tenant-aware auth, RBAC, payments, reminders, and receipts
- SQL schema + ordered migrations
- Docker setup for local production-like runs
- Kubernetes manifests and overlays for backend/frontend split deployment

## Repository Structure

- `frontend/` - Vite + React application
- `backend/src/` - Express API, services, scripts, middleware
- `backend/db/` - schema, migrations, tenant-safe SQL query pack
- `backend/storage/` - receipt file storage
- `k8s/base/` - base Kubernetes resources
- `k8s/overlays/backend/` - backend-only deployment overlay
- `k8s/overlays/frontend/` - frontend-only deployment overlay
- `docs/` - architecture and operations documents

## Core Features

- Multi-tenant data isolation (`coaching_id` scoped across domain tables)
- JWT auth + refresh flow
- Role-based access control (admin, faculty, receptionist)
- Students, fee plans, fee accounts, and payment tracking
- Razorpay integration with webhook idempotency handling
- Parent portal endpoints and student pass mode
- Receipt PDF generation and serving
- Reminder scheduling + optional SQS worker mode
- Operational metrics and health endpoints

## Tech Stack

- Frontend: React, Vite, React Router, Axios, Recharts
- Backend: Node.js, Express, PostgreSQL (`pg`), Zod, JWT
- Integrations: Razorpay, Twilio, Nodemailer, AWS SQS
- Ops: Docker, Docker Compose, Kubernetes, Kustomize

## Quick Start (Local)

### 1) Prerequisites

- Node.js 20+
- Docker Desktop (recommended for easiest setup)

### 2) Install dependencies

```bash
npm install
npm --prefix frontend install
```

### 3) Configure environment

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

### 4) Run database migrations

```bash
npm run db:migrate
```

### 5) Start apps

Backend:

```bash
npm run dev
```

Frontend:

```bash
npm --prefix frontend run dev -- --host --port 3000
```

## Docker Workflows

### Build and run both services

```bash
docker compose up --build -d
```

### Check status and logs

```bash
docker compose ps
docker compose logs -f
```

### Stop stack

```bash
docker compose down
```

### Team pull-only mode (no local build)

```bash
docker compose -f docker-compose.team.yml pull
docker compose -f docker-compose.team.yml up -d
```

## Kubernetes Workflows

### Backend only

```bash
npm run k8s:apply:backend
```

### Frontend only

```bash
npm run k8s:apply:frontend
```

### Full base apply

```bash
npm run k8s:apply
```

### Verify rollout

```bash
kubectl get pods -n tuition-saas
kubectl get svc -n tuition-saas
kubectl get ingress -n tuition-saas
```

Detailed backend-only guide: `k8s/DEPLOY_BACKEND_ONLY.md`

## API / Runtime Endpoints

- Backend health: `GET /health`
- API base: `GET /api/v1`
- Prometheus metrics: `GET /metrics`
- Receipts static path: `/receipts/<file-name>`

## Environment Notes

Key env values include:

- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `CORS_ORIGIN`
- `RECEIPT_BASE_URL`
- `RAZORPAY_*` and communication provider credentials

Use `.env.example` as baseline and keep real secrets out of git.

## Team Onboarding

Use: `ONBOARDING_TEAM.md`

This includes copy-paste commands for:

- clone + first run
- Docker image pull/run
- release tagging and redeploy flow

## Deployment Strategy (Recommended)

- Frontend: Vercel (or containerized frontend on Kubernetes)
- Backend + worker: Kubernetes/ECS/VM container runtime
- PostgreSQL: managed service
- Object storage for durable receipt files in production

## Security and Operations

- Do not commit secret keys
- Rotate exposed credentials immediately
- Use versioned Docker tags for every release (`1.0.1`, `1.0.2`, ...)
- Run migrations in controlled CI/CD stage before production rollout

## License

For internal/team usage unless a separate license file is added.
