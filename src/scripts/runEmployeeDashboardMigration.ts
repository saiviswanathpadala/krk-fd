import { db } from '../config/database';
import { sql } from 'drizzle-orm';

async function runEmployeeDashboardMigration() {
  try {
    console.log('🔄 Running employee dashboard indexes migration...');

    // Add indexes for employee dashboard performance
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_properties_assigned_employee_id ON properties (assigned_employee_id) WHERE deleted = false`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_property_pending_changes_proposer_status ON property_pending_changes (proposer_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banner_pending_changes_proposer_status ON banner_pending_changes (proposer_id, status)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_users_assigned_employee_id ON users (assigned_employee_id) WHERE role = 'agent' AND deleted = false`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_banners_active ON banners (is_active)`);

    console.log('✅ Employee dashboard indexes migration completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runEmployeeDashboardMigration();