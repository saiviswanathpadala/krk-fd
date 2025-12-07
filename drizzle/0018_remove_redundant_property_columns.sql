-- Remove redundant columns from properties table
-- These fields are already stored in features JSONB column

ALTER TABLE properties DROP COLUMN IF EXISTS apartment_type;
ALTER TABLE properties DROP COLUMN IF EXISTS property_status;
ALTER TABLE properties DROP COLUMN IF EXISTS plot_size;
ALTER TABLE properties DROP COLUMN IF EXISTS latitude;
ALTER TABLE properties DROP COLUMN IF EXISTS longitude;
