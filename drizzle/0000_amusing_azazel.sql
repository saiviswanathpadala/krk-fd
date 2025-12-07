CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"phone" varchar(15) NOT NULL,
	"name" varchar(100),
	"email" varchar(100),
	"city" varchar(50),
	"profile_img_url" varchar(500),
	"profile_completed" boolean DEFAULT false,
	"role" varchar(20) DEFAULT 'user',
	"created_at" timestamp DEFAULT now(),
	"last_login" timestamp DEFAULT now(),
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
