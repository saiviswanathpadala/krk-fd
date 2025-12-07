-- Ensure users table has all necessary fields for employee profile
ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_img_url VARCHAR(500);
ALTER TABLE users ADD COLUMN IF NOT EXISTS department VARCHAR(100);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW();

-- Create index for faster profile queries
CREATE INDEX IF NOT EXISTS idx_users_id_role ON users(id, role);
