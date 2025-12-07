-- Create uploads table for tracking file uploads
CREATE TABLE IF NOT EXISTS uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(500) NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(50) NOT NULL,
  client_upload_id UUID,
  status VARCHAR(20) DEFAULT 'created',
  size BIGINT,
  content_type VARCHAR(100),
  referenced_by_change_id UUID REFERENCES property_pending_changes(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create idempotency table for preventing duplicate submissions
CREATE TABLE IF NOT EXISTS property_pending_changes_idempotency (
  idempotency_key UUID PRIMARY KEY,
  change_id UUID NOT NULL REFERENCES property_pending_changes(id) ON DELETE CASCADE,
  status VARCHAR(20) DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add uploaded_assets column to property_pending_changes if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'property_pending_changes' AND column_name = 'uploaded_assets'
  ) THEN
    ALTER TABLE property_pending_changes ADD COLUMN uploaded_assets JSONB DEFAULT '[]';
  END IF;
END $$;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_uploads_owner_status ON uploads(owner_id, status);
CREATE INDEX IF NOT EXISTS idx_uploads_client_id ON uploads(client_upload_id);
CREATE INDEX IF NOT EXISTS idx_idempotency_change ON property_pending_changes_idempotency(change_id);
