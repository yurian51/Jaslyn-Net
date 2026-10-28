-- Allow signing in with a mobile number. Stored in E.164 (e.g. +255712345678).
-- Emails are unique per tenant only, so a phone used for sign-in must be unique across the platform
-- or a number could resolve to more than one account.
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone text;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_phone_e164_check') THEN
    ALTER TABLE users ADD CONSTRAINT users_phone_e164_check CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS users_phone_uq ON users (phone) WHERE phone IS NOT NULL;
COMMIT;
