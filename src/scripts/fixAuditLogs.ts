import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fix() {
  await pool.query('ALTER TABLE admin_audit_logs ALTER COLUMN admin_id DROP NOT NULL');
  console.log('✅ Fixed');
  process.exit(0);
}

fix().catch(console.error);
