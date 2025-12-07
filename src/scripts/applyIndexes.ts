import { db } from '../config/database';
import { sql } from 'drizzle-orm';

async function applyIndexes() {
  try {
    console.log('Creating indexes for dashboard queries...');
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role_created_at ON users(role, created_at)`);
    console.log('✅ Created idx_users_role_created_at');
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_role_approved ON users(role, approved)`);
    console.log('✅ Created idx_users_role_approved');
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_last_login ON users(last_login)`);
    console.log('✅ Created idx_users_last_login');
    
    console.log('✅ All indexes created successfully');
  } catch (error) {
    console.error('❌ Error creating indexes:', error);
  }
  process.exit(0);
}

applyIndexes();
