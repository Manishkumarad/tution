# Million-Scale Architecture Blueprint (Coaching + Students)

## Objective
Design a multi-tenant architecture that can support millions of coachings and millions of students with:

- strong tenant isolation
- low-latency dashboard and APIs
- durable data with no permanent loss
- predictable scale under high read/write traffic

## Current Stack Alignment
The current project stack is already a strong base:

- API: Node.js + Express
- DB: PostgreSQL (Supabase/RDS)
- Multi-tenancy key: coaching_id
- Queue-like background flows: reminders + notifications
- Containerization and Kubernetes manifests

This blueprint extends that stack safely without forcing a full rewrite.

## Reference Scale Targets

### Phase 1 (0 to 100k coachings)
- 10M to 50M students total
- p95 API latency < 250 ms for core flows
- 99.9% API availability

### Phase 2 (100k to 1M coachings)
- 50M to 500M students total
- regional deployment and read scaling
- heavy table partitioning + archive strategy

### Phase 3 (1M+ coachings)
- multi-region active-passive or active-active
- shard-aware tenant routing
- dedicated big-tenant lanes

## Architecture Layers

### 1. API Layer
- Stateless backend pods behind ALB.
- Horizontal autoscale by CPU + request rate + p95 latency.
- Add request id and tenant id in logs for every request.
- Apply idempotency keys for all money and membership operations.

### 2. Data Layer
- Keep PostgreSQL as system-of-record.
- Continue strict `coaching_id` scoping in every table and query.
- Add table partitioning for append-heavy tables:
  - payments (monthly)
  - attendance (monthly)
  - notifications/payment_logs (monthly)
- Add partial indexes for active rows and high-frequency filters.
- Introduce read replicas for dashboard/reporting reads.

### 3. Cache Layer
- Add Redis for cross-instance cache (replace in-memory-only caches for shared behavior).
- Cache dashboard summary/revenue (short TTL 15 to 60 sec).
- Use cache keys prefixed by tenant:
  - `c:<coaching_id>:dashboard:summary`

### 4. Async Layer
- Move all non-critical tasks to queue workers:
  - reminders
  - receipt generation
  - exports
  - analytics materialization
- Use durable queue (SQS/RabbitMQ/Kafka depending on scale).
- Keep webhook handlers fast: validate, persist, acknowledge, process async.

### 5. Storage Layer
- Store receipts/exports in S3, not local disk.
- DB stores metadata + signed URL only.
- Apply lifecycle policies (hot, warm, archive).

### 6. Observability Layer
- Metrics: Prometheus `/metrics` + API ops metrics.
- Logs: structured JSON with tenant context.
- Traces: OpenTelemetry (sampled at high scale).
- Alerts:
  - p95 latency breach
  - DB retries spike
  - queue lag growth
  - webhook failure rate

## Data Durability (No Permanent Loss)

### Required controls
1. Supabase/RDS PITR enabled.
2. Daily logical backups encrypted and copied offsite.
3. Monthly restore drill into staging.
4. Migration rollback scripts for every schema change.
5. Critical flows wrapped in DB transactions.
6. Webhook idempotency for payment and membership events.

### Write safety model
- Synchronous write to primary DB.
- Replication to replica(s).
- Backup + PITR for disaster recovery.
- No destructive operation without snapshot checkpoint.

## Tenant Isolation at Scale

### Isolation model
- Shared DB, tenant key (`coaching_id`) in all business tables.
- Composite foreign keys `(coaching_id, id)` for relation safety.
- Role + tenant checks in middleware and SQL.

### Big-tenant strategy
When one coaching becomes very large:
- place in dedicated DB shard or dedicated schema lane
- route by tenant map (tenant registry)
- keep same API contract

## Performance Plan For Slow Dashboard

### Immediate
- Keep summary/revenue queries index-friendly (already improved).
- Keep short TTL cache for dashboard endpoints.
- Pre-aggregate monthly revenue snapshots via background job.

### Next
- Materialized views refreshed incrementally.
- Redis cache with tenant-scoped keys.
- Replica reads for dashboard-only endpoints.

## Suggested AWS Topology

- EKS for API + workers
- RDS PostgreSQL primary + read replicas
- ElastiCache Redis
- SQS for durable async jobs
- S3 for files (receipts/exports)
- CloudWatch + Prometheus/Grafana
- Route53 + ALB + WAF + ACM

## Capacity and SLO Controls

- Pod autoscaling: CPU + memory + requests per second.
- DB max connections controlled via pool settings.
- DB retry budget to absorb transient network events.
- Rate limiting per route and per tenant tier.
- Backpressure for heavy endpoints and export jobs.

## Practical Migration Roadmap (Recommended)

1. Add Redis for dashboard cache and distributed lock support.
2. Add SQS-based worker for reminders/receipts.
3. Partition payments and attendance tables.
4. Shift dashboard reads to replicas.
5. Add materialized aggregates for top analytics widgets.
6. Introduce tenant registry for future sharding.

## Non-Negotiable Rules

1. Every query must include tenant filter.
2. Money operations must be idempotent.
3. Critical writes must be transactional.
4. Backups are useless without restore drills.
5. Performance tuning must use measured p95/p99, not guesses.
