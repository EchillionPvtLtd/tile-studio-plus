import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Removing built-in demo tiles while preserving showroom uploads...');

  const removed = await prisma.tile.deleteMany({ where: { isBuiltIn: true } });
  console.log(`✅ Removed ${removed.count} built-in demo tiles. Custom showroom tiles were preserved.`);
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
