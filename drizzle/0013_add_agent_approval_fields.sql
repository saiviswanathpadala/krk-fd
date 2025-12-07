-- Add agent approval workflow fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP;
ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Create indexes for agent queries
CREATE INDEX IF NOT EXISTS idx_users_role_approved ON users(role, approved) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_users_assigned_employee ON users(assigned_employee_id) WHERE assigned_employee_id IS NOT NULL;
