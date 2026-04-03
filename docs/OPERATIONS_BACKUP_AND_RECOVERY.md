# Backup And Recovery Runbook

This runbook helps keep coaching and student data durable at scale.

## Goals

- No permanent data loss
- Fast restore path for accidental deletes or bad deployments
- Verified backups and recovery drills

## Supabase Production Baseline

1. Enable Point In Time Recovery (PITR) in Supabase project settings.
2. Use daily automated backups with at least 30 days retention.
3. Restrict database credentials and rotate secrets quarterly.
4. Keep app migrations forward-only and tracked in `schema_migrations`.

## Backup Layers

1. PITR: primary immediate rollback mechanism.
2. Daily logical dump: extra offline protection.
3. Offsite encrypted copy: protect against provider/account incidents.

## Recommended Schedule

1. Hourly: monitor API/database error rates and latency.
2. Daily: backup completion checks and storage integrity checks.
3. Weekly: restore test in staging from latest backup.
4. Monthly: PITR recovery drill to a specific timestamp.

## Restore Process (High Level)

1. Freeze writes at app level (maintenance mode).
2. Decide restore method:
   - PITR to timestamp for broad incidents
   - Targeted SQL restore for narrow incidents
3. Restore into a staging database first.
4. Run validation queries for coachings/students/payments counts.
5. Promote restored DB and switch app connection.
6. Resume writes.

## Validation Checklist After Restore

1. `SELECT COUNT(*) FROM coachings;`
2. `SELECT COUNT(*) FROM students;`
3. `SELECT COUNT(*) FROM payments WHERE status = 'success';`
4. Login, add student, record payment, scan QR smoke tests.

## Data Safety Application Rules

1. Never run destructive SQL in production without backup snapshot.
2. Use soft-delete and audit logs for sensitive entities where possible.
3. Keep webhook flows idempotent to avoid duplicate writes.
4. Use transaction blocks for multi-step money operations.

## Incident Notes Template

- Incident start/end time
- User impact
- Data scope affected
- Recovery method used
- Validation evidence
- Follow-up fixes
