ALTER TABLE students
  DROP COLUMN IF EXISTS email;

ALTER TABLE coachings
  DROP COLUMN IF EXISTS bank_name,
  DROP COLUMN IF EXISTS bank_ifsc,
  DROP COLUMN IF EXISTS bank_account_number,
  DROP COLUMN IF EXISTS bank_account_name,
  DROP COLUMN IF EXISTS payment_qr_url,
  DROP COLUMN IF EXISTS payment_upi_id;
