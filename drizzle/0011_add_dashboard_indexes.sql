-- Add indexes for efficient dashboard aggregation queries
CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON users(role, created_at);
CREATE INDEX IF NOT EXISTS idx_users_role_approved ON users(role, approved);
CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login);
