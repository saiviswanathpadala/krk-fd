-- Add additional indexes for employee property management
CREATE INDEX IF NOT EXISTS idx_property_pending_changes_property_id ON property_pending_changes (property_id);
CREATE INDEX IF NOT EXISTS idx_properties_title_location ON properties USING gin(to_tsvector('english', title || ' ' || location));
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties (created_at DESC);