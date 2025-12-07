-- Create loan_requests table
CREATE TABLE "loan_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "user_name" varchar(100) NOT NULL,
  "user_email" varchar(100) NOT NULL,
  "user_phone" varchar(15) NOT NULL,
  "user_location" varchar(100),
  "user_preferred_categories" jsonb,
  "loan_type" varchar(50) NOT NULL,
  "property_category" varchar(50) NOT NULL,
  "property_value" bigint NOT NULL CHECK (property_value > 0),
  "loan_amount_needed" bigint NOT NULL CHECK (loan_amount_needed > 0),
  "employment_type" varchar(50) NOT NULL,
  "monthly_income" bigint NOT NULL CHECK (monthly_income > 0),
  "preferred_tenure" varchar(20) NOT NULL,
  "existing_loans" boolean NOT NULL,
  "existing_loan_details" text,
  "preferred_contact_time" varchar(50) NOT NULL,
  "additional_notes" text,
  "status" varchar(20) NOT NULL DEFAULT 'received',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  "deleted_at" timestamp,
  CONSTRAINT loan_amount_check CHECK (loan_amount_needed <= property_value)
);

-- Create indexes
CREATE INDEX idx_loan_requests_user_id ON loan_requests(user_id);
CREATE INDEX idx_loan_requests_status ON loan_requests(status);
CREATE INDEX idx_loan_requests_created_at ON loan_requests(created_at DESC);
CREATE INDEX idx_loan_requests_user_preferred_categories ON loan_requests USING GIN (user_preferred_categories);
