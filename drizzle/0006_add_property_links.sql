-- Add new columns for property links and gallery
ALTER TABLE "properties" ADD COLUMN "gallery" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "properties" ADD COLUMN "brochure" varchar(500);
ALTER TABLE "properties" ADD COLUMN "map" varchar(500);
ALTER TABLE "properties" ADD COLUMN "website" varchar(500);
