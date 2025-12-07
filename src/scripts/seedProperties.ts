import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function seedProperties() {
  const seedFile = path.join(__dirname, '../../drizzle/0008_seed_properties.sql');
  const seedSQL = fs.readFileSync(seedFile, 'utf-8');
  
  await pool.query(seedSQL);
  console.log('✓ Properties seeded successfully!');
  await pool.end();
}

seedProperties().catch(console.error);
