-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  context JSONB,
  last_message_at TIMESTAMP DEFAULT NOW(),
  deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai')),
  content TEXT NOT NULL,
  status TEXT DEFAULT 'sent' CHECK (status IN ('pending', 'sent', 'failed', 'delivered')),
  meta JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  received_at TIMESTAMP,
  external_id TEXT
);

-- Create indexes
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at DESC);
CREATE INDEX idx_conversations_user_last_message ON conversations(user_id, last_message_at DESC);
CREATE INDEX idx_conversations_deleted ON conversations(user_id, deleted, last_message_at DESC);
