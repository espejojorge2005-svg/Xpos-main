import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function seedDefaultUsers(prisma: PrismaService) {
  try {
    const defaultPassword = await bcrypt.hash('1234567', 10);

    // 1. Asegurar Restaurante Demo
    let restaurant = await prisma.restaurant.findFirst();
    if (!restaurant) {
      restaurant = await prisma.restaurant.create({
        data: {
          name: 'Mi Restaurante Xpos',
          slogan: 'El mejor sabor',
          subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 año
        }
      });
    }

    // 2. Administrador del Restaurante (Password: 1234567)
    await prisma.user.upsert({
      where: { email: 'admin@xpos.com' },
      update: {
        password: defaultPassword,
        role: 'ADMIN' as any,
        restaurantId: restaurant.id,
        allowedViews: ['*'],
        isActive: true,
      },
      create: {
        name: 'Administrador Xpos',
        email: 'admin@xpos.com',
        password: defaultPassword,
        role: 'ADMIN' as any,
        restaurantId: restaurant.id,
        allowedViews: ['*'],
        isActive: true,
      }
    });

    // 2b. Alias Administrador alternativo (admin@restaurante.com - Password: 1234567)
    await prisma.user.upsert({
      where: { email: 'admin@restaurante.com' },
      update: {
        password: defaultPassword,
        role: 'ADMIN' as any,
        restaurantId: restaurant.id,
        allowedViews: ['*'],
        isActive: true,
      },
      create: {
        name: 'Admin Restaurante',
        email: 'admin@restaurante.com',
        password: defaultPassword,
        role: 'ADMIN' as any,
        restaurantId: restaurant.id,
        allowedViews: ['*'],
        isActive: true,
      }
    });

    // 3. SuperAdmin Global (Password: 1234567)
    await prisma.user.upsert({
      where: { email: 'superadmin@xpos.com' },
      update: {
        password: defaultPassword,
        role: 'SUPER_ADMIN' as any,
        allowedViews: ['*'],
        isActive: true,
      },
      create: {
        name: 'Super Administrador',
        email: 'superadmin@xpos.com',
        password: defaultPassword,
        role: 'SUPER_ADMIN' as any,
        allowedViews: ['*'],
        isActive: true,
      }
    });

    // 4. Cajero con PIN 1234
    const cashierExists = await prisma.user.findFirst({ where: { email: 'cajero@xpos.com' } });
    if (!cashierExists) {
      await prisma.user.create({
        data: {
          name: 'Carlos Cajero',
          email: 'cajero@xpos.com',
          password: defaultPassword,
          pin: '1234',
          role: 'CASHIER' as any,
          restaurantId: restaurant.id,
          allowedViews: ['pos', 'cocina', 'caja'],
          isActive: true,
        }
      });
    }

    // 5. Mesero con PIN 5678
    const waiterExists = await prisma.user.findFirst({ where: { email: 'mesero@xpos.com' } });
    if (!waiterExists) {
      await prisma.user.create({
        data: {
          name: 'Maria Mesera',
          email: 'mesero@xpos.com',
          password: defaultPassword,
          pin: '5678',
          role: 'WAITER' as any,
          restaurantId: restaurant.id,
          allowedViews: ['pos', 'cocina'],
          isActive: true,
        }
      });
    }

    console.log('✅ Usuarios por defecto sembrados correctamente (Password: 1234567)');
  } catch (err) {
    console.warn('Advertencia en sembrado inicial:', err);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.setGlobalPrefix('api/v1');

  // Sembrado automático de usuarios
  const prismaService = app.get(PrismaService);
  await seedDefaultUsers(prismaService);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();