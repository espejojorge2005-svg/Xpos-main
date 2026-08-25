import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
// IMPORTANTE: Si tu PrismaService está en un módulo exportado (ej. PrismaModule), impórtalo aquí en 'imports' si es necesario.

@Module({
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}