import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import * as bcrypt from 'bcrypt';

async function seedSuperAdmin(prisma: PrismaService) {
  try {
    const hashedPassword = await bcrypt.hash('1234567', 10);
    await prisma.user.upsert({
      where: { email: 'superadmin@xpos.com' },
      update: {
        password: hashedPassword,
        role: 'SUPER_ADMIN' as any,
        allowedViews: ['*'],
        isActive: true,
      },
      create: {
        name: 'Super Administrador SaaS',
        email: 'superadmin@xpos.com',
        password: hashedPassword,
        role: 'SUPER_ADMIN' as any,
        allowedViews: ['*'],
        isActive: true,
      }
    });
    console.log('✅ SuperAdmin SaaS configurado (superadmin@xpos.com / 1234567)');
  } catch (err) {
    console.warn('Advertencia en sembrado SuperAdmin:', err);
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

  // Sembrar únicamente la cuenta SuperAdmin del SaaS
  const prismaService = app.get(PrismaService);
  await seedSuperAdmin(prismaService);

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();