import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private cls: ClsService) {
    super({
      // Le decimos que busque el token en la cabecera "Authorization: Bearer <token>"
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'clave-secreta-de-desarrollo',
      passReqToCallback: true, // Allow request to be passed to validate
    });
  }

  // Si el token es válido, NestJS pone esta información en "req.user"
  async validate(req: Request, payload: any) {
    let tenantId = payload.restaurantId;
    
    if (payload.role === 'SUPER_ADMIN' && req.headers['x-restaurant-id']) {
      tenantId = req.headers['x-restaurant-id'] as string;
    }
    
    if (tenantId) {
      this.cls.set('restaurantId', tenantId);
    }
    
    return { userId: payload.sub, email: payload.email, role: payload.role, restaurantId: payload.restaurantId };
  }
}