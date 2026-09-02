const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const plans = await prisma.subscriptionPlan.findMany();
  console.log("=== PLANES SAAS EN PRODUCCION ===");
  console.log(JSON.stringify(plans.map(p => ({ id: p.id, name: p.name, code: p.code, maxUsers: p.maxUsers, price: p.price })), null, 2));

  const restaurants = await prisma.restaurant.findMany({
    include: {
      plan: true,
      _count: { select: { users: true, orders: true, products: true, zones: true } }
    }
  });
  console.log("\n=== RESTAURANTES EN PRODUCCION ===");
  console.log(JSON.stringify(restaurants.map(r => ({
    id: r.id,
    name: r.name,
    plan: r.plan?.name,
    counts: r._count
  })), null, 2));

  const superAdmins = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN' },
    select: { id: true, name: true, email: true, role: true }
  });
  console.log("\n=== SUPER ADMINS ===");
  console.log(JSON.stringify(superAdmins, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
