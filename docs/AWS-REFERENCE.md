# Scriptz — AWS reference

Single place for **resource names, ARNs, and deploy hints** used by this project.  
**Last verified:** 2026-03-26. Update this file when infrastructure changes.

The **canonical copy** is kept in **Scriptz-Api** (`docs/AWS-REFERENCE.md` on `develop`); keep this file in sync when you change AWS resources.

Secrets (database URLs, API keys, Supabase keys, etc.) belong in the API repo’s `infra/terraform/terraform.tfvars` (gitignored) or AWS Secrets Manager — **do not** paste them here.

---

## Account and region

| Item                       | Value                                                               |
| -------------------------- | ------------------------------------------------------------------- |
| **AWS account ID**         | `509399611678`                                                      |
| **Default region**         | `us-east-1`                                                         |
| **CLI identity** (example) | IAM user `ABDUJABBOR` — `arn:aws:iam::509399611678:user/ABDUJABBOR` |

Run `aws sts get-caller-identity` to confirm the active profile.

---

## Frontend (React static site)

### S3

| Bucket                 | Notes                                                                  |
| ---------------------- | ---------------------------------------------------------------------- |
| `scriptz-app-frontend` | Primary bucket; CloudFront origin for the public site                  |
| `scriptz-frontend`     | Second bucket in account — confirm purpose before changing or deleting |

### CloudFront

| Field                         | Value                                             |
| ----------------------------- | ------------------------------------------------- |
| **Distribution ID**           | `E3JZROJ6M5S5NX`                                  |
| **Default CloudFront domain** | `d8us304yonjiw.cloudfront.net`                    |
| **Custom domain (alias)**     | `scriptz.app`                                     |
| **Origin (S3)**               | `scriptz-app-frontend.s3.us-east-1.amazonaws.com` |

**Typical flow:** `npm run build` in this repo → `aws s3 sync dist/ s3://scriptz-app-frontend/ --delete` → invalidate CloudFront (see [Commands](#useful-cli-commands)).

---

## API (Docker on ECS)

### Amazon ECR

| Item                    | Value                                                             |
| ----------------------- | ----------------------------------------------------------------- |
| **Repository name**     | `scriptz-api`                                                     |
| **Image URI (pattern)** | `509399611678.dkr.ecr.us-east-1.amazonaws.com/scriptz-api:latest` |

### Amazon ECS

| Item                       | Value                                                         |
| -------------------------- | ------------------------------------------------------------- |
| **Cluster**                | `scriptz-cluster`                                             |
| **Service**                | `scriptz-api`                                                 |
| **Task definition family** | `scriptz-api` (revision increments on deploy, e.g. `:3`)      |
| **Desired count**          | `2` (as of last check; Terraform may set `ecs_desired_count`) |

**Public API URL:** `https://api.scriptz.app`

### Application Load Balancer

| Item                   | Value                                                                    |
| ---------------------- | ------------------------------------------------------------------------ |
| **DNS name** (example) | `scrip-2026032515372149160000000d-478771906.us-east-1.elb.amazonaws.com` |

Exact name may change if the load balancer is recreated; use **Load Balancers** in the EC2 console or `aws elbv2 describe-load-balancers` for the current DNS.

---

## TLS (ACM)

Unified certificate used for the app and API (verify in **ACM** in `us-east-1`):

`arn:aws:acm:us-east-1:509399611678:certificate/5d0b8458-2353-4810-aa3e-ec544e84cb9b`

Subject alternative names should include `scriptz.app` and `api.scriptz.app` (confirm in console).

---

## Terraform (Scriptz-Api repo, `infra/terraform/`)

Non-secret values are mirrored from `terraform.tfvars` / `terraform.tfvars.example`:

| Variable                                              | Example / note                                 |
| ----------------------------------------------------- | ---------------------------------------------- |
| `aws_region`                                          | `us-east-1`                                    |
| `project_prefix`                                      | `scriptz`                                      |
| `domain_name`                                         | `https://api.scriptz.app`                      |
| `certificate_arn`                                     | See [TLS](#tls-acm)                            |
| `cors_origins`                                        | `https://scriptz.app`                          |
| `frontend_base_url`                                   | `https://scriptz.app`                          |
| `google_redirect_uri`                                 | `https://api.scriptz.app/api/youtube/callback` |
| `ecs_desired_count` / `min_capacity` / `max_capacity` | See `terraform.tfvars`                         |
| `image_tag`                                           | e.g. `latest`                                  |
| `additional_environment`                              | e.g. `EXPOSE_OPENAPI`                          |

**`secret_env_vars`** holds production secrets and must stay **out of git**.

---

## Useful CLI commands

```bash
# Active account / user
aws sts get-caller-identity

# Push a new frontend build (run from this repo after `npm run build`)
aws s3 sync dist/ s3://scriptz-app-frontend/ --delete

# Clear CloudFront cache after S3 upload
aws cloudfront create-invalidation --distribution-id E3JZROJ6M5S5NX --paths "/*"

# ECR login (us-east-1) before docker push (API image)
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 509399611678.dkr.ecr.us-east-1.amazonaws.com

# Rolling restart of API tasks (same image tag)
aws ecs update-service --cluster scriptz-cluster --service scriptz-api --force-new-deployment
```

---

## Related repositories

- **Frontend:** this repo — Vite React app deployed to `scriptz-app-frontend` + CloudFront.
- **Backend:** **Scriptz-Api** — FastAPI image in `scriptz-api` ECR, run by ECS service `scriptz-api`.
