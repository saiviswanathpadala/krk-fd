-- Add indexes for employee dashboard performance
CREATE INDEX IF NOT EXISTS idx_properties_assigned_employee_id ON properties (assigned_employee_id) WHERE deleted = false;
CREATE INDEX IF NOT EXISTS idx_property_pending_changes_proposer_status ON property_pending_changes (proposer_id, status);
CREATE INDEX IF NOT EXISTS idx_banner_pending_changes_proposer_status ON banner_pending_changes (proposer_id, status);
CREATE INDEX IF NOT EXISTS idx_users_assigned_employee_id ON users (assigned_employee_id) WHERE role = 'agent' AND deleted = false;
CREATE INDEX IF NOT EXISTS idx_banners_active ON banners (is_active);