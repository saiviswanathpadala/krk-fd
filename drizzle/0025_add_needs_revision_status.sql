-- Update property_pending_changes status constraint to include 'needs_revision' and 'draft'
ALTER TABLE property_pending_changes DROP CONSTRAINT IF EXISTS property_pending_changes_status_check;
ALTER TABLE property_pending_changes ADD CONSTRAINT property_pending_changes_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision', 'draft'));

-- Update banner_pending_changes status constraint to include 'needs_revision' and 'draft'
ALTER TABLE banner_pending_changes DROP CONSTRAINT IF EXISTS banner_pending_changes_status_check;
ALTER TABLE banner_pending_changes ADD CONSTRAINT banner_pending_changes_status_check 
  CHECK (status IN ('pending', 'approved', 'rejected', 'needs_revision', 'draft'));
