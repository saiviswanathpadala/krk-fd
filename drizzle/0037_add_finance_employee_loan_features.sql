-- Add finance employee features to loan_requests
ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'normal';
ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS sla_due_at TIMESTAMP;
ALTER TABLE loan_requests ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMP DEFAULT now();

-- Create loan_request_comments table
CREATE TABLE IF NOT EXISTS loan_request_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id uuid NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create loan_request_assignments table
CREATE TABLE IF NOT EXISTS loan_request_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id uuid NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  assigned_by_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assignee_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create loan_request_audit_logs table
CREATE TABLE IF NOT EXISTS loan_request_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_request_id uuid NOT NULL REFERENCES loan_requests(id) ON DELETE CASCADE,
  actor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL,
  old_value TEXT,
  new_value TEXT,
  comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_loan_requests_assignee_id ON loan_requests(assignee_id);
CREATE INDEX IF NOT EXISTS idx_loan_requests_sla_due_at ON loan_requests(sla_due_at);
CREATE INDEX IF NOT EXISTS idx_loan_requests_last_activity_at ON loan_requests(last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_loan_request_comments_loan_request_id ON loan_request_comments(loan_request_id);
CREATE INDEX IF NOT EXISTS idx_loan_request_assignments_loan_request_id ON loan_request_assignments(loan_request_id);
CREATE INDEX IF NOT EXISTS idx_loan_request_audit_logs_loan_request_id ON loan_request_audit_logs(loan_request_id);

-- Set SLA for existing records (24 hours from creation)
UPDATE loan_requests 
SET sla_due_at = created_at + INTERVAL '24 hours'
WHERE sla_due_at IS NULL;
