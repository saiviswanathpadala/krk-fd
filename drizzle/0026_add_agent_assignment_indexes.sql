-- Add indexes for agent assignment queries
CREATE INDEX IF NOT EXISTS idx_properties_assigned_agent_id ON properties (assigned_agent_id) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_users_assigned_employee_agent ON users (assigned_employee_id, role) WHERE deleted = false AND approved = true;
CREATE INDEX IF NOT EXISTS idx_users_role_approved_deleted ON users (role, approved, deleted);
