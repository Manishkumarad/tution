# Deploy to AWS EKS

## 1) Build and Push Images to ECR

```bash
aws ecr create-repository --repository-name tuition-backend
aws ecr create-repository --repository-name tuition-frontend

aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <aws-account-id>.dkr.ecr.<region>.amazonaws.com

docker build -t tuition-backend:latest -f Dockerfile .
docker tag tuition-backend:latest <aws-account-id>.dkr.ecr.<region>.amazonaws.com/tuition-backend:latest
docker push <aws-account-id>.dkr.ecr.<region>.amazonaws.com/tuition-backend:latest

docker build -t tuition-frontend:latest -f frontend/Dockerfile --build-arg VITE_API_BASE_URL=https://app.example.com/api/v1 .
docker tag tuition-frontend:latest <aws-account-id>.dkr.ecr.<region>.amazonaws.com/tuition-frontend:latest
docker push <aws-account-id>.dkr.ecr.<region>.amazonaws.com/tuition-frontend:latest
```

## 2) Create EKS Cluster and Enable ALB Ingress Controller
- Create EKS cluster with at least 2 nodes across 2 AZs.
- Install AWS Load Balancer Controller.
- Attach IAM permissions for ALB controller and external DNS if used.

## 3) Configure Kubernetes Manifests
- Update these files before apply:
  - `k8s/base/backend-deployment.yaml` image URLs
  - `k8s/base/worker-deployment.yaml` image URLs
  - `k8s/base/frontend-deployment.yaml` image URLs
  - `k8s/base/ingress.yaml` host and ACM certificate ARN
  - `k8s/base/backend-configmap.yaml` CORS and receipt URL
- Copy `k8s/base/backend-secret.example.yaml` to real secret manifest and fill production values.

## 4) Deploy

```bash
kubectl apply -k k8s/base
kubectl get pods -n tuition-saas
kubectl get ingress -n tuition-saas
kubectl get hpa -n tuition-saas
```

## 5) Run DB Migration Once
Run from a secure CI step or admin pod:

```bash
npm run db:migrate
```

## 6) Verify
- Backend health: `https://app.example.com/health`
- Frontend: `https://app.example.com/`
- API: `https://app.example.com/api/v1/health` (if route added) or use core endpoints
- Worker pods: `kubectl get deploy,hpa,pdb -n tuition-saas | findstr worker`

## Production Notes
- Store secrets in AWS Secrets Manager (recommended) and sync to Kubernetes.
- Restrict CORS to your domain only.
- Rotate JWT and provider secrets periodically.
- Set real `RAZORPAY_WEBHOOK_SECRET` before enabling live payments.
