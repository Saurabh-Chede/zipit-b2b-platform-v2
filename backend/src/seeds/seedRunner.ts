import { connectDatabase, disconnectDatabase } from '../config/database.ts';
import { seedDatabase } from './seedData.ts';

async function main() {
  const reset = process.argv.includes('--reset');
  await connectDatabase();
  const result = await seedDatabase(reset);
  console.log(
    result.seeded
      ? 'ZIPIT B2B Transport database seeded successfully.'
      : 'Database already contains data. Run with --reset to re-seed.'
  );
  await disconnectDatabase();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
