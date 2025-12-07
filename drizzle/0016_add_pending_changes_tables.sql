-- Create property_pending_changes table
CREATE TABLE IF NOT EXISTS property_pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  proposer_id INTEGER REFERENCES users(id),
  proposed_payload JSONB NOT NULL,
  diff_summary JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by_admin_id INTEGER REFERENCES users(id)
);

-- Create banner_pending_changes table
CREATE TABLE IF NOT EXISTS banner_pending_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  banner_id UUID REFERENCES banners(id) ON DELETE CASCADE,
  proposer_id INTEGER REFERENCES users(id),
  proposed_payload JSONB NOT NULL,
  diff_summary JSONB,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  reviewed_at TIMESTAMP,
  reviewed_by_admin_id INTEGER REFERENCES users(id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_property_pending_changes_status ON property_pending_changes(status);
CREATE INDEX IF NOT EXISTS idx_property_pending_changes_property ON property_pending_changes(property_id);
CREATE INDEX IF NOT EXISTS idx_property_pending_changes_proposer ON property_pending_changes(proposer_id);
CREATE INDEX IF NOT EXISTS idx_banner_pending_changes_status ON banner_pending_changes(status);
CREATE INDEX IF NOT EXISTS idx_banner_pending_changes_banner ON banner_pending_changes(banner_id);
CREATE INDEX IF NOT EXISTS idx_banner_pending_changes_proposer ON banner_pending_changes(proposer_id);
