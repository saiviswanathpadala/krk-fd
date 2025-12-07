-- Create junction tables for many-to-many relationships

-- Property-Employee assignments (1 property can have multiple employees)
CREATE TABLE IF NOT EXISTS property_employee_assignments (
  id SERIAL PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by_admin_id INTEGER REFERENCES users(id),
  UNIQUE(property_id, employee_id)
);

-- Property-Agent assignments (1 property can have multiple agents)
CREATE TABLE IF NOT EXISTS property_agent_assignments (
  id SERIAL PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  assigned_by_employee_id INTEGER REFERENCES users(id),
  UNIQUE(property_id, agent_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_property_employee_assignments_property ON property_employee_assignments(property_id);
CREATE INDEX IF NOT EXISTS idx_property_employee_assignments_employee ON property_employee_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_property_agent_assignments_property ON property_agent_assignments(property_id);
CREATE INDEX IF NOT EXISTS idx_property_agent_assignments_agent ON property_agent_assignments(agent_id);

-- Note: Keep existing assigned_employee_id and assigned_agent_id columns for backward compatibility
-- They can represent the "primary" assignee while junction tables handle additional assignees
