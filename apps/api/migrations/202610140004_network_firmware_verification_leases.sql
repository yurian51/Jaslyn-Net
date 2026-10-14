ALTER TABLE network_firmware_upgrade_jobs
  ADD COLUMN IF NOT EXISTS verification_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS network_firmware_upgrade_verification_lease_idx
  ON network_firmware_upgrade_jobs (verification_claimed_at, updated_at)
  WHERE status = 'VERIFYING';
