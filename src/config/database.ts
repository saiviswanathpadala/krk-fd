import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import { drizzle as drizzleWs } from 'drizzle-orm/neon-serverless';
import { neon, Pool, neonConfig } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

// Configure WebSocket for Neon
neonConfig.webSocketConstructor = ws;

// HTTP client for regular queries (faster)
const sql = neon(process.env.DATABASE_URL!);
export const db = drizzleHttp(sql);

// WebSocket client for transactions
const pool = new Pool({ connectionString: process.env.DATABASE_URL! });
export const dbTx = drizzleWs(pool);

// Note: To migrate to another DB provider (e.g., Supabase, Railway):
// 1. Replace imports with: import { drizzle } from 'drizzle-orm/node-postgres';
// 2. Replace with: import { Pool } from 'pg';
// 3. Use: const pool = new Pool({ connectionString: process.env.DATABASE_URL });
// 4. Use: export const db = drizzle(pool); export const dbTx = db;