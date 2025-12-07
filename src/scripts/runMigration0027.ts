import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const runMigration = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  console.log('🔄 Running migration 0027...');
  
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    const migrationPath = path.join(__dirname, '../../drizzle/0027_add_property_assignments_junction.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Extract CREATE TABLE statements first
    const createTableMatches = migrationSQL.match(/CREATE TABLE[\s\S]*?\);/g) || [];
    const remainingSQL = migrationSQL.replace(/CREATE TABLE[\s\S]*?\);/g, '');
    
    const indexStatements = remainingSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    const statements = [...createTableMatches, ...indexStatements];
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`Executing: ${statement.substring(0, 80)}...`);
        await sql`${sql.unsafe(statement)}`;
      }
    }
    
    console.log('✅ Migration 0027 completed!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

runMigration();
