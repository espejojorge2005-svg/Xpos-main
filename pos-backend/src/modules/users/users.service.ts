import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ClsService } from 'nestjs-cls';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

export { CreateUserDto, UpdateUserDto };

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  async findAll(reqUser?: any) {
    const restaurantId = this.cls.get('restaurantId') || reqUser?.restaurantId;
    const whereClause: any = {};
    if (restaurantId && reqUser?.role !== 'SUPER_ADMIN') {
      whereClause.restaurantId = restaurantId;
    }
    return this.prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pin: true,
        isActive: true,
        allowedViews: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        pin: true,
        isActive: true,
        allowedViews: true,
        createdAt: true,
      },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async create(dto: CreateUserDto, reqUser?: any) {
    const cleanEmail = dto.email.trim().toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email: cleanEmail } });
    if (exists) throw new BadRequestException('El correo ya está registrado en la plataforma');

    // Extraer automáticamente el restaurantId del JWT del Administrador o CLS context
    let restaurantId = reqUser?.restaurantId || this.cls.get('restaurantId');
    if (!restaurantId) {
      const firstRest = await this.prisma.restaurant.findFirst();
      if (firstRest) restaurantId = firstRest.id;
    }

    if (!restaurantId) {
      throw new BadRequestException('No se pudo determinar el restaurante asignado al usuario');
    }

    // Verificar estado, vigencia de suscripción y límite estricto de usuarios según el plan
    const restaurant = await this.prisma.restaurant.findUnique({ 
      where: { id: restaurantId },
      include: { plan: true } 
    });
    if (restaurant) {
      if (restaurant.isActive === false) {
        throw new ForbiddenException('El restaurante se encuentra suspendido. No es posible registrar nuevos usuarios.');
      }
      if (restaurant.subscriptionEndDate && new Date(restaurant.subscriptionEndDate) < new Date()) {
        throw new ForbiddenException(`La suscripción de este restaurante expiró el ${new Date(restaurant.subscriptionEndDate).toLocaleDateString()}. Renueve el plan para continuar.`);
      }
      if (restaurant.plan) {
        const activeUsers = await this.prisma.user.count({ 
          where: { restaurantId, isActive: true } 
        });
        const limit = restaurant.plan.maxUsers;
        if (activeUsers >= limit) {
          throw new ForbiddenException(`Límite estricto de usuarios (${limit}) alcanzado para el plan ${restaurant.plan.name}. Mejore su plan en SuperAdmin para añadir más personal.`);
        }
      }
    }

    // ENCRIPTACIÓN CRÍTICA CON BCRYPT ANTES DE PRISMA.USER.CREATE()
    const rawPassword = dto.password ? dto.password.trim() : '123456';
    const hashedPassword = await bcrypt.hash(rawPassword, 10);
    const cleanPin = dto.pin ? dto.pin.trim().replace(/\D/g, '') : null;

    const role = dto.role ?? 'CASHIER';
    let defaultViews: string[] = ['pos', 'cocina', 'caja'];
    if (role === 'ADMIN') defaultViews = ['*'];
    else if (role === 'WAITER') defaultViews = ['pos', 'cocina'];
    else if (role === 'COOK') defaultViews = ['cocina'];

    const allowedViews = dto.allowedViews && dto.allowedViews.length > 0 ? dto.allowedViews : defaultViews;

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: cleanEmail,
        password: hashedPassword,
        pin: cleanPin,
        role: role as any,
        allowedViews,
        restaurantId,
        isActive: true,
      },
    });
    const { password, ...result } = user;
    return result;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const data: any = { ...dto };
    if (dto.name) data.name = dto.name.trim();
    if (dto.email) data.email = dto.email.trim().toLowerCase();

    if (dto.password && dto.password.trim().length > 0) {
      data.password = await bcrypt.hash(dto.password.trim(), 10);
    } else {
      delete data.password;
    }

    if (dto.pin !== undefined) {
      data.pin = dto.pin ? dto.pin.trim().replace(/\D/g, '') : null;
    }

    const updated = await this.prisma.user.update({ where: { id }, data });
    const { password, ...result } = updated;
    return result;
  }

  /** Soft delete — just deactivates the account */
  async deactivate(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { message: 'Usuario desactivado' };
  }

  async updateProfile(id: string, dto: { email?: string; password?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const data: any = {};
    if (dto.email && dto.email !== user.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (exists) throw new BadRequestException('El correo ya está en uso');
      data.email = dto.email;
    }
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(data).length === 0) return { message: 'No se enviaron cambios' };

    const updated = await this.prisma.user.update({ where: { id }, data });
    return { message: 'Perfil actualizado exitosamente', email: updated.email };
  }
}
