import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@xpos.com';
  const password = '1234567';

  console.log(`Creando/actualizando usuario Admin: ${email}...`);
  const hashedPassword = await bcrypt.hash(password, 10);

  let restaurant = await prisma.restaurant.findFirst();
  if (!restaurant) {
    restaurant = await prisma.restaurant.create({
      data: { name: 'Mi Restaurante Xpos' }
    });
  }

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: Role.ADMIN,
      restaurantId: restaurant.id,
      allowedViews: ['*'],
      isActive: true,
    },
    create: {
      name: 'Administrador Xpos',
      email: email,
      password: hashedPassword,
      role: Role.ADMIN,
      restaurantId: restaurant.id,
      allowedViews: ['*'],
      isActive: true,
    },
  });

  console.log('\n=======================================');
  console.log('✅ USUARIO ADMIN CONFIGURADO CON ÉXITO');
  console.log('=======================================');
  console.log(`📧 Email:    ${adminUser.email}`);
  console.log(`🔐 Password: ${password}`);
  console.log('=======================================\n');
}

main()
  .catch((e) => {
    console.error('Error creando admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
