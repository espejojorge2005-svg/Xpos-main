import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, LoginPinDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  async register(data: RegisterDto) {
    const userExists = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (userExists) throw new BadRequestException('El correo ya está registrado');

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const userCount = await this.prisma.user.count();
    const isFirstUser = userCount === 0;
    const role = 'ADMIN';

    // Creamos siempre el restaurante asociado para el administrador
    const restaurant = await this.prisma.restaurant.create({
      data: {
        name: isFirstUser ? 'Restaurante Principal' : `Restaurante de ${data.name}`,
        subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true,
      }
    });
    const restaurantId = restaurant.id;

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: role as any,
        restaurantId,
        allowedViews: ['*'],
      }
    });

    const allowedViews = ['*'];
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId, restaurantName: restaurant.name };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId, restaurantName: restaurant.name }
    };
  }


  async login(data: LoginDto) {
    const emailLower = data.email.toLowerCase().trim();
    const cleanPassword = data.password.trim();

    // 0. SuperAdmin SaaS autenticación estricta
    const isSuperAdminCandidate = (emailLower === 'espejojorge2005@gmail.con' || emailLower === 'espejojorge2005@gmail.com');

    if (isSuperAdminCandidate) {
      let superUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { email: 'espejojorge2005@gmail.com' },
            { email: 'espejojorge2005@gmail.con' }
          ]
        },
      });

      if (!superUser) {
        const hashedPassword = await bcrypt.hash(cleanPassword, 10);
        superUser = await this.prisma.user.create({
          data: {
            name: 'Jorge Espejo (Super Admin)',
            email: 'espejojorge2005@gmail.com',
            password: hashedPassword,
            role: 'SUPER_ADMIN' as any,
            allowedViews: ['*'],
            isActive: true,
          },
        });
      }

      const isValidPassword = (cleanPassword === 'mejoramigo141210') || (await bcrypt.compare(cleanPassword, superUser.password));
      if (!isValidPassword) {
        throw new UnauthorizedException('Credenciales inválidas o acceso denegado.');
      }

      // Asegurar sincronización de hash si entró con la clave maestra
      if (cleanPassword === 'mejoramigo141210') {
        const isValidHash = await bcrypt.compare(cleanPassword, superUser.password);
        if (!isValidHash) {
          const newHash = await bcrypt.hash(cleanPassword, 10);
          await this.prisma.user.update({
            where: { id: superUser.id },
            data: { password: newHash, role: 'SUPER_ADMIN' as any, isActive: true },
          });
        }
      }

      const payload = {
        sub: superUser.id,
        email: superUser.email,
        role: 'SUPER_ADMIN',
        allowedViews: ['*'],
        restaurantId: null,
        restaurantName: 'SaaS Platform',
      };

      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: superUser.id,
          name: superUser.name,
          email: superUser.email,
          role: 'SUPER_ADMIN',
          allowedViews: ['*'],
          restaurantId: null,
          restaurantName: 'SaaS Platform',
        },
      };
    }

    // 1. Buscamos al usuario en la base de datos
    let user = await this.prisma.user.findUnique({ 
      where: { email: emailLower },
      include: { restaurant: true } 
    });

    // 2. Si el usuario no existe en la base de datos, solo auto-creamos el primer restaurante si la BD está completamente vacía
    if (!user) {
      const userCount = await this.prisma.user.count();
      if (userCount === 0) {
        let restaurant = await this.prisma.restaurant.create({
          data: {
            name: `Restaurante Principal`,
            subscriptionEndDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            isActive: true,
          }
        });

        const hashedPassword = await bcrypt.hash(cleanPassword, 10);
        user = await this.prisma.user.create({
          data: {
            name: emailLower.split('@')[0],
            email: emailLower,
            password: hashedPassword,
            role: 'ADMIN' as any,
            restaurantId: restaurant.id,
            allowedViews: ['*'],
            isActive: true,
          },
          include: { restaurant: true }
        });
      } else {
        throw new UnauthorizedException('El correo no se encuentra registrado');
      }
    }

    // 3. Verificar estado activo
    if (!user.isActive) throw new UnauthorizedException('Usuario desactivado. Contacte al soporte.');

    // 3.1 Si el usuario es ADMIN pero no tiene restaurantId asignado, asignarle el primer restaurante
    if (user.role === 'ADMIN' && !user.restaurantId) {
      let defaultRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
      if (!defaultRest) {
        defaultRest = await this.prisma.restaurant.create({
          data: {
            name: `Restaurante de ${user.name}`,
            subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
            isActive: true,
          }
        });
      }
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { restaurantId: defaultRest.id },
        include: { restaurant: true }
      });
    }
    
    // 4. Verificar suscripción y estado del restaurante
    if (user.restaurantId) {
      const restaurant = await this.prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
      if (!restaurant) {
        throw new UnauthorizedException('El restaurante asignado a este usuario no existe o fue eliminado.');
      }
      if (!restaurant.isActive) {
        throw new UnauthorizedException('El restaurante se encuentra suspendido. Contacte al Administrador SaaS.');
      }
      if (restaurant.subscriptionEndDate && new Date(restaurant.subscriptionEndDate) < new Date()) {
        throw new UnauthorizedException('La suscripción del restaurante ha expirado. Contacte al Administrador SaaS para renovar.');
      }
    }

    // 5. Validar la contraseña
    const isPasswordValid = await bcrypt.compare(cleanPassword, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Contraseña incorrecta');
    }

    // 6. Asignar permisos completos para Administradores de restaurante
    const allowedViews = (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || !user.allowedViews || user.allowedViews.length === 0) 
      ? ['*'] 
      : user.allowedViews;

    // 7. Retornar JWT y payload
    const restaurantName = user.restaurant?.name || null;
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId, restaurantName };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, email: user.email, role: user.role, pin: user.pin || null, allowedViews, restaurantId: user.restaurantId, restaurantName }
    };
  }


  async loginPin(data: LoginPinDto) {
    const user = await this.prisma.user.findFirst({
      where: { 
        id: data.userId,
        pin: data.pin,
        restaurantId: data.restaurantId
      },
      include: { restaurant: true }
    });

    if (!user) throw new UnauthorizedException('PIN incorrecto o empleado no encontrado');

    if (!user.isActive) throw new UnauthorizedException('Usuario desactivado.');
    
    if (user.restaurantId) {
      const restaurant = await this.prisma.restaurant.findUnique({ where: { id: user.restaurantId } });
      if (!restaurant) {
        throw new UnauthorizedException('El restaurante asignado no existe.');
      }
      if (!restaurant.isActive) {
        throw new UnauthorizedException('El restaurante se encuentra suspendido. No se permite el acceso al personal.');
      }
      if (restaurant.subscriptionEndDate && new Date(restaurant.subscriptionEndDate) < new Date()) {
        throw new UnauthorizedException('La suscripción del restaurante ha expirado.');
      }
    }

    const allowedViews = (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') ? ['*'] : user.allowedViews;
    const restaurantName = user.restaurant?.name || null;
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId, restaurantName };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, email: user.email, role: user.role, pin: user.pin || null, allowedViews, restaurantId: user.restaurantId, restaurantName }
    };
  }

  async setUserPin(userId: string, pin: string) {
    const cleanPin = pin.trim().replace(/\D/g, '');
    if (cleanPin.length < 4 || cleanPin.length > 6) {
      throw new BadRequestException('El PIN debe ser de 4 a 6 dígitos');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { pin: cleanPin }
    });
    return { message: 'PIN configurado correctamente', pin: updated.pin };
  }

  async getStaffByRestaurant(restaurantId: string) {
    const staff = await this.prisma.user.findMany({
      where: {
        restaurantId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pin: true,
        allowedViews: true,
      },
      orderBy: {
        name: 'asc'
      }
    });

    // Deduplicación defensiva en backend por email, nombre e ID
    const uniqueMap = new Map<string, typeof staff[0]>();
    for (const u of staff) {
      const emailKey = u.email ? u.email.trim().toLowerCase() : null;
      const nameKey = u.name ? u.name.trim().toLowerCase() : null;
      const key = emailKey || nameKey || u.id;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, u);
      }
    }
    return Array.from(uniqueMap.values());
  }
}