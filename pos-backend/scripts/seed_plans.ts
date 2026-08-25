import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding subscription plans...');
  
  const basic = await prisma.subscriptionPlan.upsert({
    where: { code: 'BASIC' },
    update: {},
    create: {
      name: 'Básico',
      code: 'BASIC',
      price: 0,
      maxUsers: 3,
      features: ['Facturación Electrónica', 'Gestión de Mesas (Básico)'],
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { code: 'PRO' },
    update: {},
    create: {
      name: 'Profesional',
      code: 'PRO',
      price: 50,
      maxUsers: 10,
      features: ['Todo lo de Básico', 'Gestión de Inventario', 'Múltiples Cajas'],
    },
  });

  await prisma.subscriptionPlan.upsert({
    where: { code: 'PREMIUM' },
    update: {},
    create: {
      name: 'Premium',
      code: 'PREMIUM',
      price: 100,
      maxUsers: 9999,
      features: ['Todo lo de Pro', 'Reportes Avanzados', 'API de Integración'],
    },
  });

  // Link restaurants that don't have a plan
  const restaurants = await prisma.restaurant.findMany({ where: { planId: null } });
  for (const r of restaurants) {
    await prisma.restaurant.update({
      where: { id: r.id },
      data: { planId: basic.id }
    });
  }

  console.log('Seeding done. Updated ' + restaurants.length + ' restaurants with BASIC plan.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
