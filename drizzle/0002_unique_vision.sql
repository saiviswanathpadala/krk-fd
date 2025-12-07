CREATE TABLE "properties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"price" numeric NOT NULL,
	"location" varchar(255) NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb,
	"description" text,
	"type" varchar(50) DEFAULT 'Featured',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
