CREATE TABLE IF NOT EXISTS auth_recovery_otps (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  purpose VARCHAR(30) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  target VARCHAR(120) NOT NULL,
  otp_hash VARCHAR(128) NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_auth_recovery_otps_coaching') THEN
    ALTER TABLE auth_recovery_otps ADD CONSTRAINT fk_auth_recovery_otps_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_auth_recovery_otps_user') THEN
    ALTER TABLE auth_recovery_otps ADD CONSTRAINT fk_auth_recovery_otps_user
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_auth_recovery_otps_purpose') THEN
    ALTER TABLE auth_recovery_otps ADD CONSTRAINT ck_auth_recovery_otps_purpose
      CHECK (purpose IN ('login_otp', 'password_reset'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_auth_recovery_otps_channel') THEN
    ALTER TABLE auth_recovery_otps ADD CONSTRAINT ck_auth_recovery_otps_channel
      CHECK (channel IN ('sms', 'email'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auth_recovery_otps_lookup
  ON auth_recovery_otps (coaching_id, user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_recovery_otps_expiry
  ON auth_recovery_otps (expires_at);
