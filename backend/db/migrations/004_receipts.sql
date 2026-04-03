CREATE TABLE IF NOT EXISTS receipts (
  id BIGSERIAL PRIMARY KEY,
  coaching_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  payment_id BIGINT NOT NULL,
  receipt_number VARCHAR(80) NOT NULL,
  file_path TEXT NOT NULL,
  receipt_url TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_coaching') THEN
    ALTER TABLE receipts ADD CONSTRAINT fk_receipts_coaching
      FOREIGN KEY (coaching_id) REFERENCES coachings(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_receipts_coaching_id_id') THEN
    ALTER TABLE receipts ADD CONSTRAINT uq_receipts_coaching_id_id UNIQUE (coaching_id, id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_receipts_coaching_payment') THEN
    ALTER TABLE receipts ADD CONSTRAINT uq_receipts_coaching_payment UNIQUE (coaching_id, payment_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_receipts_number') THEN
    ALTER TABLE receipts ADD CONSTRAINT uq_receipts_number UNIQUE (receipt_number);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_student_tenant') THEN
    ALTER TABLE receipts ADD CONSTRAINT fk_receipts_student_tenant
      FOREIGN KEY (coaching_id, student_id) REFERENCES students(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_receipts_payment_tenant') THEN
    ALTER TABLE receipts ADD CONSTRAINT fk_receipts_payment_tenant
      FOREIGN KEY (coaching_id, payment_id) REFERENCES payments(coaching_id, id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_receipts ON receipts;
CREATE POLICY tenant_isolation_receipts ON receipts
  USING (coaching_id = current_setting('app.coaching_id', true)::BIGINT)
  WITH CHECK (coaching_id = current_setting('app.coaching_id', true)::BIGINT);

CREATE INDEX IF NOT EXISTS idx_receipts_coaching_created ON receipts (coaching_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_coaching_student ON receipts (coaching_id, student_id);
