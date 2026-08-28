import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { json, urlencoded } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Aumentar el límite de tamaño de payload para soportar imágenes en base64
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));

  // ¡LA LLAVE MÁGICA PARA EL FRONTEND!
  app.enableCors();

  // Configuración de seguridad y validación global
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Elimina silenciosamente cualquier dato extra que el frontend envíe y no esté en el DTO
      forbidNonWhitelisted: false, // NO lanzar error 400 por campos extra
      transform: true, // Transforma automáticamente los payloads a las instancias de nuestras clases DTO
    }),
  );


  // Prefijo global para nuestra API (buena práctica para versionamiento futuro)
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 POS Backend iniciado exitosamente en http://localhost:${port}/api/v1`);
}
bootstrap();