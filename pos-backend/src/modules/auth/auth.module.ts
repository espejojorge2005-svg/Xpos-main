import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
// 1. Importa la estrategia
import { JwtStrategy } from './jwt.strategy'; 

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'clave-secreta-de-desarrollo',
      signOptions: { expiresIn: '1d' }, 
    }),
  ],
  controllers: [AuthController],
  // 2. Agrégala aquí, al lado del AuthService
  providers: [AuthService, JwtStrategy], 
})
export class AuthModule {}