/**
 * SCRIPT PARA ELIMINAR LOS 3 NEGOCIOS DE PRUEBA DE PRODUCCIÓN
 * Limpia con seguridad en cascada todas las órdenes, productos, mesas,
 * movimientos de stock, cierres de caja y usuarios asociados a:
 * 1. Cevichería El Puerto Azul
 * 2. Trattoria Bella Italia
 * 3. Café & Bistro Central
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const testRestaurantNames = [
  'Cevichería El Puerto Azul',
  'Trattoria Bella Italia',
  'Café & Bistro Central'
];

async function main() {
  console.log('====================================================');
  console.log('  LIMPIEZA DE NEGOCIOS DE PRUEBA EN PRODUCCIÓN     ');
  console.log('====================================================\n');

  const restaurants = await prisma.restaurant.findMany({
    where: { name: { in: testRestaurantNames } }
  });

  if (restaurants.length === 0) {
    console.log('ℹ No se encontraron negocios de prueba para eliminar.');
    return;
  }

  const restaurantIds = restaurants.map(r => r.id);
  console.log(`Encontrados ${restaurants.length} negocios para eliminar:`);
  restaurants.forEach(r => console.log(` - ${r.name} (ID: ${r.id})`));
  console.log('');

  // 1. Movimientos de stock
  const deletedStockMovs = await prisma.stockMovement.deleteMany({
    where: { product: { restaurantId: { in: restaurantIds } } }
  });
  console.log(`✓ Movimientos de stock eliminados: ${deletedStockMovs.count}`);

  // 2. Pagos de órdenes
  const deletedPayments = await prisma.payment.deleteMany({
    where: { order: { restaurantId: { in: restaurantIds } } }
  });
  console.log(`✓ Pagos eliminados: ${deletedPayments.count}`);

  // 3. Ítems de órdenes
  const deletedOrderItems = await prisma.orderItem.deleteMany({
    where: { order: { restaurantId: { in: restaurantIds } } }
  });
  console.log(`✓ Ítems de órdenes eliminados: ${deletedOrderItems.count}`);

  // 4. Órdenes
  const deletedOrders = await prisma.order.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Órdenes eliminadas: ${deletedOrders.count}`);

  // 5. Gastos de caja
  const deletedExpenses = await prisma.cashExpense.deleteMany({
    where: { shift: { restaurantId: { in: restaurantIds } } }
  });
  console.log(`✓ Gastos de caja eliminados: ${deletedExpenses.count}`);

  // 6. Turnos de caja
  const deletedShifts = await prisma.cashShift.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Turnos de caja eliminados: ${deletedShifts.count}`);

  // 7. Mesas
  const deletedTables = await prisma.table.deleteMany({
    where: { zone: { restaurantId: { in: restaurantIds } } }
  });
  console.log(`✓ Mesas eliminadas: ${deletedTables.count}`);

  // 8. Zonas
  const deletedZones = await prisma.zone.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Zonas eliminadas: ${deletedZones.count}`);

  // 9. Productos
  const deletedProducts = await prisma.product.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Productos eliminados: ${deletedProducts.count}`);

  // 10. Categorías
  const deletedCategories = await prisma.category.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Categorías eliminadas: ${deletedCategories.count}`);

  // 11. Estaciones de cocina KDS
  const deletedStations = await prisma.kitchenStation.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Estaciones KDS eliminadas: ${deletedStations.count}`);

  // 12. Usuarios asociados a los restaurantes de prueba
  const deletedUsers = await prisma.user.deleteMany({
    where: { restaurantId: { in: restaurantIds } }
  });
  console.log(`✓ Usuarios de prueba eliminados: ${deletedUsers.count}`);

  // 13. Restaurantes
  const deletedRestaurants = await prisma.restaurant.deleteMany({
    where: { id: { in: restaurantIds } }
  });
  console.log(`✓ Restaurantes eliminados: ${deletedRestaurants.count}`);

  console.log('\n====================================================');
  console.log('✅ BASE DE DATOS LIMPIA Y OPTIMIZADA EXITOSAMENTE');
  console.log('====================================================\n');
}

main()
  .catch((e) => {
    console.error('Error durante la eliminación:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
