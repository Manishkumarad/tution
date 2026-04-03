# Team Onboarding (Docker + Kubernetes)

This guide helps a new team member run the project locally and follow the same deploy flow.

## 1) Prerequisites

- Docker Desktop (required)
- Git (required)
- kubectl (only if working with Kubernetes)

No Node.js/npm install is required for normal local run with Docker images.

## 2) Clone Project

```bash
git clone <your-repo-url>
cd tution
```

## 3) Create Environment File

Copy env template and fill values:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

At minimum, make sure `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `JWT_REFRESH_SECRET` are set.

## 4) Run Locally With Prebuilt Images (No local build)

Use the team compose file:

```bash
docker compose -f docker-compose.team.yml pull
docker compose -f docker-compose.team.yml up -d
```

Verify:

```bash
docker compose -f docker-compose.team.yml ps
```

Open:

- Frontend: http://localhost:3000
- Backend health: http://localhost:4000/health

Stop:

```bash
docker compose -f docker-compose.team.yml down
```

## 5) Daily Developer Workflow

1. Create branch: `feature/<name>`
2. Make changes
3. Run local stack and test
4. Commit + push
5. Open PR

## 6) Release New Docker Images

Maintainer runs:

```bash
docker login
docker build -t manii7070/tuition-backend:<version> -f Dockerfile .
docker build -t manii7070/tuition-frontend:<version> -f frontend/Dockerfile --build-arg VITE_API_BASE_URL=http://localhost:4000/api/v1 .
docker push manii7070/tuition-backend:<version>
docker push manii7070/tuition-frontend:<version>
```

Example versions: `1.0.1`, `1.0.2`.

## 7) Redeploy On Kubernetes

Update image tags in:

- `k8s/overlays/backend/backend-deployment.yaml`
- `k8s/overlays/backend/worker-deployment.yaml`
- `k8s/overlays/frontend/frontend-deployment.yaml`

Apply:

```bash
kubectl apply -k k8s/overlays/backend
kubectl apply -k k8s/overlays/frontend
```

Verify rollout:

```bash
kubectl rollout status deployment/tuition-backend -n tuition-saas
kubectl rollout status deployment/tuition-frontend -n tuition-saas
kubectl get pods -n tuition-saas
```

## 8) Important Rules

- Do not reuse old production tags for new code.
- Keep secrets out of git.
- For local Kubernetes, worker can stay scaled to 0 unless SQS is configured.
