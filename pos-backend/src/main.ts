import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ¡LA LLAVE MÁGICA PARA EL FRONTEND!
  app.enableCors();

  // Configuración de seguridad y validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina silenciosamente cualquier dato extra que el frontend envíe y no esté en el DTO
      forbidNonWhitelisted: true, // Lanza un error HTTP 400 si envían propiedades maliciosas o no declaradas
      transform: true, // Transforma automáticamente los payloads a las instancias de nuestras clases DTO
    }),
  );

  // Prefijo global para nuestra API (buena práctica para versionamiento futuro)
  app.setGlobalPrefix('api/v1');

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();