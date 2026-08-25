import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Configuración de credenciales del SuperAdmin
  const email = 'superadmin@xpos.com';
  const password = 'admin'; // Contraseña inicial

  console.log(`Intentando crear/actualizar el usuario: ${email}...`);

  const hashedPassword = await bcrypt.hash(password, 10);

  const superAdmin = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      restaurantId: null, // Global!
      allowedViews: ['*'],
      isActive: true,
    },
    create: {
      name: 'Super Administrador',
      email: email,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      restaurantId: null,
      allowedViews: ['*'],
      isActive: true,
    },
  });

  console.log('\n=======================================');
  console.log('✅ SÚPER ADMIN CONFIGURADO CON ÉXITO');
  console.log('=======================================');
  console.log('Puedes usar las siguientes credenciales para gestionar todo el SaaS:');
  console.log(`📧 Email:    ${superAdmin.email}`);
  console.log(`🔐 Password: ${password}`);
  console.log('👉 Entra a http://localhost:3001/login usando estas credenciales y serás dirigido a /superadmin');
  console.log('=======================================\n');
}

main()
  .catch((e) => {
    console.error('Error creando superadmin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
