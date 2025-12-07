-- Add active field to users table for employee activation control
ALTER TABLE users ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Create index for performance on role and active queries
CREATE INDEX IF NOT EXISTS idx_users_role_active ON users(role, active) WHERE deleted = false;
