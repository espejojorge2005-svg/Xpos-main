import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global() // Hacemos el módulo global para no tener que importarlo en cada dominio
@Module({
  providers: [PrismaService],
  exports: [PrismaService], // Lo exportamos para que otros módulos lo utilicen
})
export class PrismaModule {}