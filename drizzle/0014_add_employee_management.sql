-- Add employee_id to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS employee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

-- Add department field to users table for employees
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_properties_employee_id ON properties(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_assigned_employee_id ON users(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_users_role_deleted ON users(role, deleted);
