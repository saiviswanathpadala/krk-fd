CREATE TABLE IF NOT EXISTS "banners" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image_url" text NOT NULL,
	"title" text NOT NULL,
	"subtitle" text NOT NULL,
	"target_role" text DEFAULT 'All' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Seed initial banners
INSERT INTO "banners" ("image_url", "title", "subtitle", "target_role", "display_order") VALUES
('https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800', 'Find Your Dream Home', 'Discover perfect properties', 'Customer', 1),
('https://images.unsplash.com/photo-1582407947304-fd86f028f716?w=800', 'Premium Listings', 'Explore exclusive properties', 'All', 2),
('https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800', 'Trusted Service', 'Your real estate partner', 'All', 3),
('https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800', 'Manage Your Properties', 'List and manage properties', 'Agent', 1);
