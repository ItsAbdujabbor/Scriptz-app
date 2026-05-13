---
name: Clixa-Api live deploy is manual EC2, not GitHub Actions
description: Despite .github/workflows/deploy.yml existing, the actual prod API deploys via scripts/deploy.sh against single EC2 — the GHA pipeline has been failing on AWS_DEPLOY_ROLE_ARN since at least early May 2026
type: project
---

The production Clixa-Api runs on a single EC2 in account 195874016451 / us-east-1 (the "lite" stack — see `infra/lite/README.md`). The live deploy is `bash scripts/deploy.sh` from a developer laptop: it builds a Docker image, pushes to ECR, scp's `.env.production` to the EC2, and restarts the docker-compose stack via SSH (`infra/lite/clixa-deploy.pem`).

`.github/workflows/deploy.yml` _also_ exists and targets ECS (`scriptz-cluster` / `scriptz-api` service), but as of 2026-05-11 it fails at the "Configure AWS credentials (OIDC)" step with "Credentials could not be loaded" — `AWS_DEPLOY_ROLE_ARN` secret is missing/misconfigured. The ECS path is effectively dead and pushes to main don't deploy anything.

**Why:** The lite stack came first; the ECS workflow was added speculatively but never wired up to a real OIDC role. The owner hasn't deleted the workflow because it's harmless when it fails.

**How to apply:** When asked to "deploy", do NOT assume pushing to main is enough. Real deploys require local AWS credentials + the EC2 SSH key + running `scripts/deploy.sh`. Pushing to main is fine for getting code into the repo but it will NOT update the running API. Stop and ask before running the deploy script — it touches production. Bucket `clixa-thumbnails-195874016451`, CloudFront `https://d3emdplt2fy66u.cloudfront.net`.
