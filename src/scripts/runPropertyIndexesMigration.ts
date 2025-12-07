import { db } from '../config/database';
import { sql } from 'drizzle-orm';

async function runPropertyIndexesMigration() {
  try {
    console.log('🔄 Running property indexes migration...');

    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_property_pending_changes_property_id ON property_pending_changes (property_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_properties_title_location ON properties USING gin(to_tsvector('english', title || ' ' || location))`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_properties_created_at ON properties (created_at DESC)`);

    console.log('✅ Property indexes migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runPropertyIndexesMigration();