-- Fix for environments where migration 012 was applied before coaching payment columns were added.
-- Safe to run multiple times.
ALTER TABLE coachings
  ADD COLUMN IF NOT EXISTS payment_upi_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS payment_qr_url TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS bank_account_number VARCHAR(40),
  ADD COLUMN IF NOT EXISTS bank_ifsc VARCHAR(20),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(120);
