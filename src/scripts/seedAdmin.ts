import { db } from '../config/database';
import { users } from '../models/user';
import { eq } from 'drizzle-orm';

const ADMIN_PHONES = process.env.ADMIN_PHONES?.split(',') || [];

async function seedAdmins() {
  if (ADMIN_PHONES.length === 0) {
    console.log('⚠️  No admin phones configured in ADMIN_PHONES env variable');
    return;
  }

  for (const phone of ADMIN_PHONES) {
    const cleanPhone = phone.trim();
    
    const existing = await db.select().from(users).where(eq(users.phone, cleanPhone)).limit(1);
    
    if (existing.length > 0) {
      await db.update(users)
        .set({ role: 'admin', approved: true, profileCompleted: true })
        .where(eq(users.phone, cleanPhone));
      console.log(`✅ Updated existing user ${cleanPhone} to admin`);
    } else {
      await db.insert(users).values({
        phone: cleanPhone,
        role: 'admin',
        approved: true,
        profileCompleted: true,
      });
      console.log(`✅ Created admin user ${cleanPhone}`);
    }
  }
}

seedAdmins()
  .then(() => {
    console.log('✅ Admin seed completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Admin seed failed:', error);
    process.exit(1);
  });
