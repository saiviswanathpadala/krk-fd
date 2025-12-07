-- Add new columns for property details
ALTER TABLE "properties" ADD COLUMN "features" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "properties" ADD COLUMN "amenities" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "properties" ADD COLUMN "latitude" numeric;
ALTER TABLE "properties" ADD COLUMN "longitude" numeric;

-- Update existing properties with sample data
UPDATE "properties" SET 
  "features" = '["Single-Family Home", "3,200 sqft", "4 Bedrooms", "3 Bathrooms", "Built in 2021"]'::jsonb,
  "amenities" = '["Pool", "Garden", "Gym", "Parking"]'::jsonb,
  "latitude" = 17.4126,
  "longitude" = 78.4502,
  "description" = COALESCE("description", 'Experience unparalleled luxury in this stunning modern property. Featuring an open-concept living space, gourmet kitchen, and breathtaking views, this property is an oasis of comfort and style.')
WHERE "features" IS NULL OR "amenities" IS NULL;