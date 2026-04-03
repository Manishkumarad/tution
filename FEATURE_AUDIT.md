# Feature Audit (Backend)

## Fully Implemented in Code

- Multi-tenant shared database architecture with coaching_id isolation
- JWT authentication with coaching_id in token
- Role-based access control (admin, faculty, receptionist)
- Coaching signup and login
- Student CRUD with pagination and search
- Fee plans (full, half, monthly)
- Payment logs and payment status flow
- Dashboard analytics summary and revenue trend
- QR pass generation and QR attendance scan endpoint
- Duplicate attendance prevention same day
- Reminder scheduler (due_minus_3, due_today, overdue)
- Razorpay order creation and verification endpoint
- Razorpay webhook signature verification and idempotency
- Migration-safe schema split with up/down and migration tracking
- Receipt PDF generation and receipt retrieval endpoint
- Parent portal APIs for fee status and attendance history

## Implemented But Requires Live Configuration for Production Verification

- Email sending via SMTP
- SMS sending via provider URL/token
- WhatsApp sending via provider URL/token
- Razorpay live key and webhook secret validation in real environment
- Receipt public URL correctness (depends on deployed host/domain)

## Not Implemented In This Backend Repo

- Frontend web/mobile screens and UX flows
- Mobile QR scanner app integration
- Offline mode + sync engine
- Hindi/English localization UX
- Full parent self-login authentication flow
- End-to-end load test suite for 150k students under production infra

## Production Verification Blockers

- DATABASE_URL not fully configured in local environment (migration run failed auth)
- Missing provider credentials for SMTP/SMS/WhatsApp
- No deployed environment URL for webhook and receipt URL validation

## Immediate Next Steps to Reach Production Verification

1. Configure valid PostgreSQL credentials and run migrations.
2. Configure SMTP, SMS, and WhatsApp provider credentials.
3. Deploy backend and set RECEIPT_BASE_URL to public domain.
4. Run webhook setup and replay scripts against deployed webhook endpoint.
5. Execute load/perf tests with seeded multi-tenant dataset.
