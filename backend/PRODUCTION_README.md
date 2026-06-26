# Production Deployment Guide — Eatsie / Organic Canada

This guide covers deploying the Eatsie Medusa backend to production.

---

## Prerequisites

| Resource | Required | Notes |
|----------|----------|-------|
| PostgreSQL 16+ | ✅ | Managed: [Neon](https://neon.tech), [AWS RDS](https://aws.amazon.com/rds/), [DigitalOcean](https://digitalocean.com) |
| Redis 7+ | ✅ | Managed: [Upstash](https://upstash.com), [Redis Cloud](https://redis.com) |
| Node.js 20+ | ✅ | Use the Docker image for consistent versions |
| Stripe account | ⚠️ | Required if accepting card payments |
| Firebase project | ⚠️ | Required if using Firebase auth |
| Domain + SSL | ✅ | Required for HTTPS and HSTS |

---

## Environment Variables

Copy `.env.template` to `.env` and fill in all values. **Never hardcode secrets.**

### Required in all environments

```bash
DATABASE_URL=postgresql://user:pass@host:5432/eatsie?sslmode=require
JWT_SECRET=<openssl rand -base64 48>
COOKIE_SECRET=<openssl rand -base64 48>
MEDUSA_BACKEND_URL=https://api.eatsie.com
STORE_CORS=https://eatsie.com,https://admin.eatsie.com
ADMIN_CORS=https://admin.eatsie.com,https://api.eatsie.com
AUTH_CORS=https://eatsie.com,https://admin.eatsie.com,https://api.eatsie.com
```

### Required in production

```bash
NODE_ENV=production
REDIS_URL=rediss://default:pass@usw1-xxx.upstash.io:6379
STRIPE_API_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
DATABASE_SSL=true
```

---

## Deployment Options

### Option 1: Docker (recommended)

```bash
# Build the image
docker build -t eatsie-backend:latest .

# Run with environment file
docker run -d \
  --name eatsie-backend \
  --restart unless-stopped \
  --env-file .env \
  -p 9000:9000 \
  eatsie-backend:latest
```

### Option 2: Docker Compose with PostgreSQL + Redis

This repo includes a production-ready `docker-compose.prod.yml` that sets up
PostgreSQL, Redis, and the backend together.

### Option 3: Platform-as-a-Service

| Platform | Guide |
|----------|-------|
| **Railway** | Deploy directly from GitHub. Set `NODE_ENV=production`, `MEDUSA_SKIP_ENV_CHECK=true`. Build command: `npm run build`. Start command: `npx medusa start`. |
| **Fly.io** | Use the included Dockerfile. Set `NODE_ENV` and secrets via `fly secrets set`. |
| **AWS ECS** | Push Docker image to ECR, configure task definition with env vars. |

---

## Database Setup

Run these commands as part of your deployment pipeline:

```bash
# Run pending migrations
npx medusa db:migrate

# Sync link tables between modules
npx medusa db:sync-links

# Seed initial data (first deployment only)
npx medusa exec ./src/scripts/seed.ts
```

**Backup strategy:**
- Enable automated daily backups on your PostgreSQL provider.
- Before running migrations, take a manual snapshot.
- Test rollback by keeping the previous migration's `down()` SQL available.

---

## Health Checks

The backend provides a health endpoint at `GET /health`:

| Query | Purpose | Example |
|-------|---------|---------|
| (none) | Basic status | `/health` → `{ status: "ok", uptime: 12345 }` |
| `?probe=true` | Load balancer ping | `/health?probe=true` → fastest response |
| `?full=true` | Full dependency check | `/health?full=true` → checks DB, Redis, Stripe config |

Configure your load balancer or orchestrator to use `/?probe=true` for health
checks with a 10s timeout and 3 failure threshold.

---

## Monitoring & Logging

### Structured Logging

All HTTP requests are logged as JSON with:
- `request_id` — unique trace ID (also returned as `X-Request-Id` header)
- `method`, `path`, `status`, `duration_ms`
- `slow: true` if response took > 2 seconds
- `rate_limit_remaining` when applicable

Errors (5xx) use `console.error`, client errors (4xx) use `console.warn`,
success uses `console.log`.

### OpenTelemetry (optional)

Uncomment and configure `instrumentation.ts` to enable distributed tracing
with OpenTelemetry. See [Medusa instrumentation docs](https://docs.medusajs.com/learn/debugging-and-testing/instrumentation).

### Recommended Tools

| Tool | Purpose | Integration |
|------|---------|-------------|
| **Sentry** | Error tracking | Use `@sentry/node` |
| **Grafana Loki** | Log aggregation | Ship JSON logs via Promtail |
| **Datadog** | APM + logs | Use `dd-trace` |
| **Better Stack** | Uptime monitoring | Hit `/health?probe=true` every 30s |

---

## Security Checklist

- [ ] `JWT_SECRET` and `COOKIE_SECRET` are at least 32 characters
- [ ] `NODE_ENV=production` (enables HSTS header)
- [ ] `DATABASE_SSL=true` for managed PostgreSQL
- [ ] Stripe webhook secret configured (verifies webhook authenticity)
- [ ] CORS origins point only to your domains (no `*` in production)
- [ ] Rate limiting active (10 req/15min auth, 60 req/min general)
- [ ] All secrets injected via environment, not committed
- [ ] Database firewall limits access to backend IPs
- [ ] Redis requires authentication (password / Access Key)
- [ ] Firebase Admin keys never exposed client-side

---

## Scaling

### Horizontal Scaling
- Run multiple Docker containers behind a load balancer.
- **Must** have `REDIS_URL` configured for shared cache + workflow state.
- Use PostgreSQL connection pooling (PgBouncer or Neon's built-in pooler).

### Vertical Scaling
- Increase container memory if workflow processing is slow.
- Tune PostgreSQL `work_mem` and `shared_buffers` for larger datasets.

---

## Troubleshooting

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Backend won't start | Missing env vars | Check `MEDUSA_SKIP_ENV_CHECK` or set all required vars |
| `Cannot find module` | Wrong import path | Run `npm run build` first; check module resolution |
| Database connection failed | SSL not configured | Set `DATABASE_SSL=true` + `DATABASE_SSL_REJECT_UNAUTHORIZED=true` |
| CORS errors in browser | Wrong CORS origins | Update `STORE_CORS`/`ADMIN_CORS` with exact browser origin |
| Webhook errors (401) | Missing Stripe secret | Set `STRIPE_WEBHOOK_SECRET` in Stripe Dashboard |
| Rate limit exceeded | Too many requests | Wait for window to expire; check `RateLimit-Reset` header |
| Slow responses (>2s) | Missing Redis | Set `REDIS_URL` for cached workflows; check DB query performance |

---

## CI/CD Pipeline (example)

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run test:unit

  deploy:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t eatsie-backend .
      - run: docker push registry.example.com/eatsie-backend:latest
      # Trigger your deployment platform to pull the new image
```
