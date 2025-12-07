-- Add admin fields to properties table
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_status TEXT DEFAULT 'published';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS apartment_type JSONB DEFAULT '[]'::jsonb;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS plot_size TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS brochure_url TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS latitude NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS longitude NUMERIC;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS assigned_employee_id INTEGER REFERENCES users(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS assigned_agent_id INTEGER REFERENCES users(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS created_by_admin_id INTEGER REFERENCES users(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS created_by_employee_id INTEGER REFERENCES users(id);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted BOOLEAN DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS deleted_by_admin_id INTEGER REFERENCES users(id);

-- Rename brochure to brochure_url if exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='properties' AND column_name='brochure') THEN
    ALTER TABLE properties RENAME COLUMN brochure TO brochure_url_old;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_properties_assigned_employee ON properties(assigned_employee_id);
CREATE INDEX IF NOT EXISTS idx_properties_assigned_agent ON properties(assigned_agent_id);
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(property_status);
CREATE INDEX IF NOT EXISTS idx_properties_deleted ON properties(deleted);
CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties(created_at);
