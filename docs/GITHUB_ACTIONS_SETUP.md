# GitHub Actions Setup (ECR + EKS)

## 1) Required GitHub Repository Variables
Set these under Settings -> Secrets and variables -> Actions -> Variables.

- `AWS_REGION` (example: `ap-south-1`)
- `AWS_ACCOUNT_ID` (12-digit AWS account id)
- `EKS_CLUSTER_NAME` (your EKS cluster name)
- `VITE_API_BASE_URL` (example: `https://app.example.com/api/v1`)

## 2) Required GitHub Repository Secrets
Set these under Settings -> Secrets and variables -> Actions -> Secrets.

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET`
- `SMTP_HOST`
- `SMTP_USER`
- `SMTP_PASS`
- `OWNER_ALERT_EMAIL`
- `SMS_PROVIDER_URL`
- `SMS_PROVIDER_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `TWILIO_MESSAGING_SERVICE_SID`
- `WHATSAPP_PROVIDER_URL`
- `WHATSAPP_PROVIDER_TOKEN`
- `WHATSAPP_SENDER`

## 3) ECR Repositories
Create two repositories in ECR:

- `tuition-backend`
- `tuition-frontend`

## 4) Update Kubernetes Placeholders
Before first deployment, update:

- `k8s/base/ingress.yaml` host and certificate ARN
- `k8s/base/backend-configmap.yaml` CORS and receipt base URL

## 5) Pipeline Behavior
- `CI` workflow runs on PR and push to `main`.
- `Deploy To EKS` workflow runs on push to `main` and manual trigger.
- Image tagging strategy: short git SHA (first 8 chars), immutable per commit.

## 6) First Deployment
1. Push code to `main`.
2. Watch `Deploy To EKS` workflow in Actions tab.
3. Validate with:
   - `kubectl get pods -n tuition-saas`
   - `kubectl get ingress -n tuition-saas`
