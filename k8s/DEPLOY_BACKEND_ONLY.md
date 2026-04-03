# Backend-Only Kubernetes Deploy

Use this when frontend is hosted separately (for example on Vercel) and backend runs on Kubernetes.

## Folder Split

- Base manifests: `k8s/base`
- Backend-only overlay: `k8s/overlays/backend`
- Frontend-only overlay: `k8s/overlays/frontend`

## What Backend Overlay Deploys

- Namespace
- Backend ConfigMap
- Backend Deployment + Service + HPA + PDB
- Worker Deployment + HPA + PDB
- Backend ingress (`api.example.com`)

## 1) Update Required Files

- `k8s/base/backend-deployment.yaml` image
- `k8s/base/worker-deployment.yaml` image
- `k8s/base/backend-configmap.yaml` CORS and receipt base URL
- `k8s/overlays/backend/ingress-backend.yaml` host + certificate ARN

## 2) Create Secret

Create a real `backend-secret` from template:

- `k8s/base/backend-secret.example.yaml`

## 3) Apply Backend Only

```bash
npm run k8s:apply:backend
```

or

```bash
kubectl apply -k k8s/overlays/backend
```

## 4) Verify

```bash
kubectl get pods -n tuition-saas
kubectl get svc -n tuition-saas
kubectl get ingress -n tuition-saas
kubectl get hpa -n tuition-saas
```

## 5) Frontend on Vercel

Set frontend env:

- `VITE_API_BASE_URL=https://api.example.com/api/v1`

Set backend CORS in ConfigMap to your Vercel domain.
