import { db } from '../config/database';
import { users } from '../models/user';
import { eq } from 'drizzle-orm';

const employeeData = [
  { phone: '9876543210', name: 'Rajesh Kumar', email: 'rajesh@maruthi.com', department: 'Sales', active: true },
  { phone: '9876543211', name: 'Priya Sharma', email: 'priya@maruthi.com', department: 'Operations', active: true },
  { phone: '9876543212', name: 'Amit Patel', email: 'amit@maruthi.com', department: 'Marketing', active: false },
];

async function seedEmployees() {
  console.log('🌱 Seeding employees...');

  for (const emp of employeeData) {
    const existing = await db.select().from(users).where(eq(users.phone, emp.phone)).limit(1);
    
    if (existing.length === 0) {
      await db.insert(users).values({
        phone: emp.phone,
        name: emp.name,
        email: emp.email,
        department: emp.department,
        role: 'employee',
        active: emp.active,
        profileCompleted: true,
        approved: true,
      });
      console.log(`✅ Created employee: ${emp.name} (${emp.phone})`);
    } else {
      console.log(`⏭️  Employee already exists: ${emp.name} (${emp.phone})`);
    }
  }

  console.log('✅ Employee seeding complete!');
  process.exit(0);
}

seedEmployees().catch((error) => {
  console.error('❌ Error seeding employees:', error);
  process.exit(1);
});
