import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Iniciando backfill de Restaurant ID...');

  // 1. Crear el restaurante por defecto si no existe
  let restaurant = await prisma.restaurant.findFirst();
  
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: {
        name: 'Restaurante #1 (Migrado)',
        slug: 'restaurante-1',
        isActive: true,
      },
    });
    console.log(`✅ Restaurante creado: ${restaurant.id}`);
  } else {
    console.log(`✅ Restaurante existente encontrado: ${restaurant.id}`);
  }

  const restaurantId = restaurant.id;

  // 2. Actualizar todas las entidades que tienen restaurantId nulo
  const runUpdates = async () => {
    const updates = [
      prisma.user.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.zone.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.category.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.product.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.inventoryItem.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.kitchenStation.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.order.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
      prisma.cashShift.updateMany({ where: { restaurantId: null }, data: { restaurantId } }),
    ];

    await Promise.all(updates);
  };

  await runUpdates();
  console.log('✅ Todas las entidades fueron asignadas al restaurante por defecto.');
}

main()
  .catch((e) => {
    console.error('❌ Error en el backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
