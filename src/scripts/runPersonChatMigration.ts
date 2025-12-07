import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const runPersonChatMigration = async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not defined');
  }

  console.log('🔄 Running person chat migration (0035)...');
  
  const sql = neon(process.env.DATABASE_URL);
  
  try {
    console.log('\n📦 Running 0035_add_person_chat.sql...');
    const migrationPath = path.join(__dirname, '../../drizzle/0035_add_person_chat.sql');
    let migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    // Remove comments
    migrationSQL = migrationSQL.replace(/--[^\n]*/g, '');
    
    // Extract CREATE TABLE statements (they end with );)
    const createTableRegex = /CREATE TABLE[\s\S]*?\);/gi;
    const createTableMatches = migrationSQL.match(createTableRegex) || [];
    
    // Remove CREATE TABLE statements from SQL to get remaining statements
    let remainingSQL = migrationSQL;
    createTableMatches.forEach(match => {
      remainingSQL = remainingSQL.replace(match, '');
    });
    
    // Split remaining statements
    const otherStatements = remainingSQL
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    // Sort CREATE TABLE to ensure person_conversations comes before person_messages
    const createTableStatements = createTableMatches.sort((a, b) => {
      const aIsConversations = a.includes('"person_conversations"');
      const bIsConversations = b.includes('"person_conversations"');
      if (aIsConversations && !bIsConversations) return -1;
      if (!aIsConversations && bIsConversations) return 1;
      return 0;
    });
    
    console.log('Table creation order:', createTableStatements.map(s => s.match(/CREATE TABLE[^"]*"([^"]+)"/)?.[1]));
    
    // Execute CREATE TABLE statements first
    // Execute CREATE TABLE statements first
    console.log('\n📋 Creating tables...');
    console.log(`Found ${createTableStatements.length} CREATE TABLE statements`);
    for (let i = 0; i < createTableStatements.length; i++) {
      const statement = createTableStatements[i];
      const tableName = statement.match(/CREATE TABLE[^"]*"([^"]+)"/)?.[1] || 'unknown';
      console.log(`[${i + 1}/${createTableStatements.length}] Creating table: ${tableName}`);
      await sql`${sql.unsafe(statement)}`;
      console.log(`✓ Table ${tableName} created successfully`);
    }
    
    // Then execute indexes and constraints
    console.log('\n📊 Creating indexes and constraints...');
    console.log(`Found ${otherStatements.length} index/constraint statements`);
    for (const statement of otherStatements) {
      const indexName = statement.match(/"([^"]+_idx)"/)?.[1] || 'unknown';
      console.log(`Creating: ${indexName}`);
      await sql`${sql.unsafe(statement)}`;
      console.log(`✓ ${indexName} created`);
    }
    
    console.log('✅ Person chat migration completed!');
    console.log('\n🎉 Tables created:');
    console.log('  - person_conversations');
    console.log('  - person_messages');
    console.log('\n📊 Indexes created:');
    console.log('  - person_conversations_admin_person_idx');
    console.log('  - person_conversations_participants_idx');
    console.log('  - person_messages_conversation_created_idx');
    console.log('  - person_messages_recipient_idx');
    console.log('  - person_conversations_unique_pair_idx (unique)');
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
};

runPersonChatMigration();
