-- Person-to-person chat tables for Admin <-> Employee/Agent conversations
-- Table 1: Conversations
CREATE TABLE IF NOT EXISTS "person_conversations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "type" text NOT NULL DEFAULT 'admin-person',
  "participants" jsonb NOT NULL,
  "admin_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "person_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "person_role" text NOT NULL,
  "meta" jsonb,
  "last_message_at" timestamp DEFAULT now(),
  "created_at" timestamp DEFAULT now(),
  "created_by" integer REFERENCES "users"("id")
);

-- Table 2: Messages
CREATE TABLE IF NOT EXISTS "person_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" uuid NOT NULL REFERENCES "person_conversations"("id") ON DELETE CASCADE,
  "sender_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "recipient_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "content" text NOT NULL,
  "attachments" jsonb,
  "status" text NOT NULL DEFAULT 'sent',
  "meta" jsonb,
  "created_at" timestamp DEFAULT now(),
  "delivered_at" timestamp,
  "read_at" timestamp
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "person_conversations_admin_person_idx" ON "person_conversations"("admin_id", "person_id");
CREATE INDEX IF NOT EXISTS "person_conversations_participants_idx" ON "person_conversations" USING gin("participants");
CREATE INDEX IF NOT EXISTS "person_messages_conversation_created_idx" ON "person_messages"("conversation_id", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "person_messages_recipient_idx" ON "person_messages"("recipient_id", "created_at" DESC);

-- Unique constraint to prevent duplicate conversations
CREATE UNIQUE INDEX IF NOT EXISTS "person_conversations_unique_pair_idx" ON "person_conversations"("admin_id", "person_id");
