import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const runLatestMigration = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  console.log('🔄 Running migrations 0015 and 0016...');
  
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    // Run migration 0015
    console.log('\n📦 Running 0015_add_property_admin_fields.sql...');
    const migration15Path = path.join(__dirname, '../../drizzle/0015_add_property_admin_fields.sql');
    const migration15SQL = fs.readFileSync(migration15Path, 'utf-8');
    
    // Extract DO block separately
    const doBlockMatch = migration15SQL.match(/DO \$\$[\s\S]*?END \$\$;/g);
    const sqlWithoutDo = migration15SQL.replace(/DO \$\$[\s\S]*?END \$\$;/g, '');
    
    const statements15 = sqlWithoutDo
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements15) {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      await sql`${sql.unsafe(statement)}`;
    }
    
    if (doBlockMatch) {
      for (const doBlock of doBlockMatch) {
        console.log('Executing DO block...');
        await sql`${sql.unsafe(doBlock)}`;
      }
    }
    
    console.log('✅ Migration 0015 completed!');
    
    // Run migration 0016
    console.log('\n📦 Running 0016_add_pending_changes_tables.sql...');
    const migration16Path = path.join(__dirname, '../../drizzle/0016_add_pending_changes_tables.sql');
    const migration16SQL = fs.readFileSync(migration16Path, 'utf-8');
    
    // Split statements but keep CREATE TABLE blocks together
    const createTableMatches = migration16SQL.match(/CREATE TABLE[\s\S]*?\);/g) || [];
    const sqlWithoutCreateTable = migration16SQL.replace(/CREATE TABLE[\s\S]*?\);/g, '');
    
    // Execute CREATE TABLE statements first
    for (const createTable of createTableMatches) {
      console.log(`Executing: ${createTable.substring(0, 60)}...`);
      await sql`${sql.unsafe(createTable)}`;
    }
    
    // Execute remaining statements (indexes)
    const statements16 = sqlWithoutCreateTable
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (const statement of statements16) {
      console.log(`Executing: ${statement.substring(0, 60)}...`);
      await sql`${sql.unsafe(statement)}`;
    }
    
    console.log('✅ Migration 0016 completed!');
    console.log('\n🎉 All migrations completed successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
};

runLatestMigration();
