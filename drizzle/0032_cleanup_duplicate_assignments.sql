-- Remove duplicate property-employee assignments, keeping only the most recent one
DELETE FROM property_employee_assignments
WHERE id NOT IN (
  SELECT MAX(id)
  FROM property_employee_assignments
  GROUP BY property_id, employee_id
);

-- Verify the UNIQUE constraint exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'property_employee_assignments_property_id_employee_id_unique'
  ) THEN
    ALTER TABLE property_employee_assignments 
    ADD CONSTRAINT property_employee_assignments_property_id_employee_id_unique 
    UNIQUE (property_id, employee_id);
  END IF;
END $$;
