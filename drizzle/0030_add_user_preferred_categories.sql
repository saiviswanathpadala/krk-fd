ALTER TABLE "users" ADD COLUMN "preferred_categories" jsonb DEFAULT '[]'::jsonb;
