-- Add soft delete columns to users table
ALTER TABLE users ADD COLUMN deleted BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMP;
ALTER TABLE users ADD COLUMN deleted_by_admin_id INTEGER REFERENCES users(id);

-- Add indexes for customer management
CREATE INDEX idx_users_role_created_at ON users(role, created_at);
CREATE INDEX idx_users_role_deleted ON users(role, deleted);
CREATE INDEX idx_users_search_name ON users(LOWER(name));
CREATE INDEX idx_users_search_email ON users(LOWER(email));
CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_city ON users(LOWER(city));