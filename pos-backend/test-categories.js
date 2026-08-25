const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getCategories() {
  const cats = await prisma.category.findMany();
  console.log(cats.map(c => c.name));
  process.exit(0);
}
getCategories();
