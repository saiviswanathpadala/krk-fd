import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const runMigration = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  console.log('🔄 Running migration 0028_employee_profile_fields.sql...\n');
  
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const migrationPath = path.join(__dirname, '../../drizzle/0028_employee_profile_fields.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    const statements = migrationSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 80)}...`);
      await sql`${sql.unsafe(statement)}`;
    }
    
    console.log('\n✅ Migration 0028 completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

runMigration();
