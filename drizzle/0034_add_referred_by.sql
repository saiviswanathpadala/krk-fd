-- Add referred_by_agent_id column to users table
ALTER TABLE users ADD COLUMN referred_by_agent_id INTEGER REFERENCES users(id);