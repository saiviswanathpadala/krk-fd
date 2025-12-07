import dotenv from 'dotenv';
import { seedProperties } from '../utils/seedData';

dotenv.config();

async function main() {
  try {
    await seedProperties();
    console.log('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

main();