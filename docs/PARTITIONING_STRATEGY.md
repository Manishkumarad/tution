# Partitioning Strategy For Million-Scale Growth

This strategy is for scaling to millions of coachings/students and high write volumes.

## Partition First Targets

1. `payments` (high write + analytics reads)
2. `attendance` (daily growth)
3. `notifications` and `payment_logs` (append-heavy)

## Partition Model

1. Time-based partitions (monthly) for `payments` and `attendance`.
2. Optional tenant-hash subpartitioning for very large tenants.
3. Keep indexes local to partitions for faster maintenance.

## Rollout Plan

1. Create new partitioned parent tables.
2. Create next 6-12 monthly child partitions in advance.
3. Route new writes to partitioned tables.
4. Backfill old rows in controlled batches.
5. Swap reads to new tables using views or route-level toggles.

## Operational Rules

1. Create partitions ahead of month boundary.
2. Archive/drop old partitions by retention policy.
3. Monitor partition size skew and query plans.
4. Keep dashboard queries bounded by date ranges.

## Example Performance Gains

- Smaller index working sets
- Faster range scans on month dashboards
- Lower VACUUM pressure per partition

## Prerequisites

1. Strong migration discipline and rollback scripts.
2. Staging load test before production cutover.
3. Query plan verification (`EXPLAIN ANALYZE`) for dashboard endpoints.
