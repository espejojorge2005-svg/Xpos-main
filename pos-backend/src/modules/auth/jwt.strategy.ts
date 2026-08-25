import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private cls: ClsService) {
    super({
      // Le decimos que busque el token en la cabecera "Authorization: Bearer <token>"
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'clave-secreta-de-desarrollo',
    });
  }

  // Si el token es válido, NestJS pone esta información en "req.user"
  async validate(payload: any) {
    if (payload.restaurantId) {
      this.cls.set('restaurantId', payload.restaurantId);
    }
    return { userId: payload.sub, email: payload.email, role: payload.role, restaurantId: payload.restaurantId };
  }
}