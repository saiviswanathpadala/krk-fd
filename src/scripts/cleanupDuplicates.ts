import { db } from '../config/database';
import { sql } from 'drizzle-orm';

async function cleanupDuplicates() {
  try {
    console.log('Cleaning up duplicate property-employee assignments...');
    
    // Remove duplicates, keeping only the most recent one
    await db.execute(sql`
      DELETE FROM property_employee_assignments
      WHERE id NOT IN (
        SELECT MAX(id)
        FROM property_employee_assignments
        GROUP BY property_id, employee_id
      )
    `);
    
    console.log('✓ Duplicates removed');
    
    // Ensure UNIQUE constraint exists
    await db.execute(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'property_employee_assignments_property_id_employee_id_unique'
        ) THEN
          ALTER TABLE property_employee_assignments 
          ADD CONSTRAINT property_employee_assignments_property_id_employee_id_unique 
          UNIQUE (property_id, employee_id);
        END IF;
      END $$
    `);
    
    console.log('✓ UNIQUE constraint verified');
    console.log('✓ Cleanup completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error during cleanup:', error);
    process.exit(1);
  }
}

cleanupDuplicates();
