import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Hardhat account #0
  const devUser = await prisma.user.upsert({
    where: { email: 'dev@signchain.local' },
    update: {},
    create: {
      id: 'dev-user-id',
      email: 'dev@signchain.local',
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
      anchorCount: 0,
    },
  });
  console.log('Seeded dev user:', devUser.id);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
