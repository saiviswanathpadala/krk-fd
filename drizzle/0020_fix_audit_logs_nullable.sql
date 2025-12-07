-- Allow null admin_id for system/employee actions
ALTER TABLE admin_audit_logs ALTER COLUMN admin_id DROP NOT NULL;
