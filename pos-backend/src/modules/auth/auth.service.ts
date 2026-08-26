import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
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
    const role = isFirstUser ? 'SUPER_ADMIN' : 'ADMIN';

    let restaurantId: string | null = null;
    if (!isFirstUser) {
      const restaurant = await this.prisma.restaurant.create({
        data: {
          name: `Restaurante de ${data.name}`,
        }
      });
      restaurantId = restaurant.id;
    }

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
    const payload = { sub: user.id, email: user.email, role: user.role, allowedViews, restaurantId: user.restaurantId };
    return {
      access_token: this.jwtService.sign(payload),
      user: { id: user.id, name: user.name, role: user.role, allowedViews, restaurantId: user.restaurantId }
    };
  }

  async login(data: LoginDto) {
    const emailLower = data.email.toLowerCase().trim();
    const cleanPassword = data.password.trim();

    // 0. SuperAdmin SaaS override
    if (emailLower === 'superadmin@xpos.com' && (cleanPassword === '1234567' || cleanPassword === 'admin')) {
      const hashedPassword = await bcrypt.hash(cleanPassword, 10);
      const superAdminUser = await this.prisma.user.upsert({
        where: { email: 'superadmin@xpos.com' },
        update: { password: hashedPassword, role: 'SUPER_ADMIN' as any, allowedViews: ['*'], isActive: true },
        create: { name: 'Super Administrador SaaS', email: 'superadmin@xpos.com', password: hashedPassword, role: 'SUPER_ADMIN' as any, allowedViews: ['*'], isActive: true }
      });

      const allowedViews = ['*'];
      const payload = { sub: superAdminUser.id, email: superAdminUser.email, role: 'SUPER_ADMIN', allowedViews, restaurantId: null };
      return {
        access_token: this.jwtService.sign(payload),
        user: { id: superAdminUser.id, name: superAdminUser.name, role: 'SUPER_ADMIN', allowedViews, restaurantId: null }
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
    
    // 4. Verificar suscripción del restaurante
    if (user.restaurantId && user.restaurant) {
      if (!user.restaurant.isActive) {
        throw new UnauthorizedException('El restaurante se encuentra suspendido. Contacte a soporte.');
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
    
    if (user.restaurantId && user.restaurant) {
      if (!user.restaurant.isActive) {
        throw new UnauthorizedException('El restaurante se encuentra suspendido.');
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
    return this.prisma.user.findMany({
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
  }
}