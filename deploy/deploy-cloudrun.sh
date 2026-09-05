#!/usr/bin/env bash
set -euo pipefail

# Ensure gcloud and docker-credential-gcloud are on PATH
export PATH="/home/zeph/Downloads/google-cloud-sdk/bin:$HOME/google-cloud-sdk/bin:$PATH"

PROJECT_ID="${GCP_PROJECT:-deployguard-507111}"
REGION="${GCP_REGION:-us-central1}"
REPO="cloud-run-source-deploy"
REGISTRY="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}"

echo "=========================================================="
echo " Project Nexus: Cloud Run Deployment Automation"
echo " Project: ${PROJECT_ID} | Region: ${REGION}"
echo "=========================================================="

# Load local .env for defaults
if [ -f .env ]; then
  # export variables from .env ignoring comments
  export $(grep -v '^#' .env | grep -v '^\s*$' | xargs)
fi

DATABASE_URL="${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/nexus}"
DATABASE_APP_URL="${DATABASE_APP_URL:-$DATABASE_URL}"
GOOGLE_API_KEY="${GOOGLE_API_KEY:-}"
ENCRYPTION_KEY="${ENCRYPTION_KEY:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
NEXUS_RAZORPAY_MOCK="${NEXUS_RAZORPAY_MOCK:-false}"
RAZORPAY_KEY_ID="${RAZORPAY_KEY_ID:-}"
RAZORPAY_KEY_SECRET="${RAZORPAY_KEY_SECRET:-}"
RAZORPAY_WEBHOOK_SECRET="${RAZORPAY_WEBHOOK_SECRET:-whsec_nexus_test_secret}"

echo "Configuring Docker credential helper..."
gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet

# ----------------------------------------------------
# 1. Deploy nexus-trust-graph
# ----------------------------------------------------
echo ""
echo ">>> [1/3] Building & Deploying Trust Graph Microservice..."
docker tag nexus-trust-graph:local "${REGISTRY}/nexus-trust-graph:latest"
docker push "${REGISTRY}/nexus-trust-graph:latest"

gcloud run deploy nexus-trust-graph \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${REGISTRY}/nexus-trust-graph:latest" \
  --platform=managed \
  --allow-unauthenticated \
  --min-instances=1 \
  --max-instances=5 \
  --port=8080 \
  --set-env-vars "DATABASE_URL=${DATABASE_URL}" \
  --quiet

TRUST_GRAPH_URL=$(gcloud run services describe nexus-trust-graph \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo "✔ Trust Graph Service live at: ${TRUST_GRAPH_URL}"

# ----------------------------------------------------
# 2. Deploy nexus-agent
# ----------------------------------------------------
echo ""
echo ">>> [2/3] Building & Deploying Nexus ADK Agent Orchestrator..."
docker tag nexus-agent:local "${REGISTRY}/nexus-agent:latest"
docker push "${REGISTRY}/nexus-agent:latest"

gcloud run deploy nexus-agent \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${REGISTRY}/nexus-agent:latest" \
  --platform=managed \
  --allow-unauthenticated \
  --max-instances=10 \
  --port=8080 \
  --set-env-vars "DATABASE_URL=${DATABASE_URL},TRUST_GRAPH_URL=${TRUST_GRAPH_URL},GOOGLE_API_KEY=${GOOGLE_API_KEY},ENCRYPTION_KEY=${ENCRYPTION_KEY},NEXUS_RAZORPAY_MOCK=${NEXUS_RAZORPAY_MOCK}" \
  --quiet

ADK_AGENT_URL=$(gcloud run services describe nexus-agent \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')

echo "✔ Nexus Agent Service live at: ${ADK_AGENT_URL}"

# ----------------------------------------------------
# 3. Deploy nexus-frontend
# ----------------------------------------------------
echo ""
echo ">>> [3/3] Building & Deploying Next.js Frontend & MaaS Gateway..."
docker tag nexus-frontend:local "${REGISTRY}/nexus-frontend:latest"
docker push "${REGISTRY}/nexus-frontend:latest"

gcloud run deploy nexus-frontend \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --image="${REGISTRY}/nexus-frontend:latest" \
  --platform=managed \
  --allow-unauthenticated \
  --max-instances=10 \
  --port=8080 \
  --set-env-vars "DATABASE_URL=${DATABASE_URL},DATABASE_APP_URL=${DATABASE_APP_URL},ADK_AGENT_URL=${ADK_AGENT_URL},TRUST_GRAPH_URL=${TRUST_GRAPH_URL},ENCRYPTION_KEY=${ENCRYPTION_KEY},RAZORPAY_KEY_ID=${RAZORPAY_KEY_ID},RAZORPAY_KEY_SECRET=${RAZORPAY_KEY_SECRET},RAZORPAY_WEBHOOK_SECRET=${RAZORPAY_WEBHOOK_SECRET}" \
  --quiet

FRONTEND_URL=$(gcloud run services describe nexus-frontend \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')

# Update NEXT_PUBLIC_APP_URL to the actual Cloud Run domain
gcloud run services update nexus-frontend \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --update-env-vars "NEXT_PUBLIC_APP_URL=${FRONTEND_URL}" \
  --quiet

echo ""
echo "=========================================================="
echo " Project Nexus Cloud Run Deployment Complete!"
echo " Frontend UI & MaaS API: ${FRONTEND_URL}"
echo " Nexus Agent:            ${ADK_AGENT_URL}"
echo " Trust Graph Engine:     ${TRUST_GRAPH_URL}"
echo "=========================================================="

