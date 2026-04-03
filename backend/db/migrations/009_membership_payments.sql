CREATE TABLE IF NOT EXISTS membership_payments (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  plan_type VARCHAR(30) NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'INR',
  status VARCHAR(20) NOT NULL,
  gateway VARCHAR(30) NOT NULL,
  gateway_order_id VARCHAR(120) NOT NULL,
  gateway_payment_id VARCHAR(120),
  gateway_signature TEXT,
  failure_reason TEXT,
  paid_at TIMESTAMPTZ,
  created_by BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_membership_payments_coaching') THEN
    ALTER TABLE membership_payments ADD CONSTRAINT fk_membership_payments_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_membership_payments_creator') THEN
    ALTER TABLE membership_payments ADD CONSTRAINT fk_membership_payments_creator
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_membership_payments_coaching_order') THEN
    ALTER TABLE membership_payments ADD CONSTRAINT uq_membership_payments_coaching_order
      UNIQUE (coaching_id, gateway_order_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_membership_payments_coaching_created
  ON membership_payments (coaching_id, created_at DESC);
