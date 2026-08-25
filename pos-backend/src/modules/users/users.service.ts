import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { ClsService } from 'nestjs-cls';

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  pin?: string;
  role?: 'ADMIN' | 'CASHIER' | 'WAITER';
  allowedViews?: string[];
}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  password?: string;
  pin?: string;
  role?: 'ADMIN' | 'CASHIER' | 'WAITER';
  allowedViews?: string[];
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  async findAll() {
    return this.prisma.user.findMany({
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

  async create(dto: CreateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('El correo ya está registrado');

    const restaurantId = this.cls.get('restaurantId');
    const restaurant = await this.prisma.restaurant.findUnique({ 
      where: { id: restaurantId },
      include: { plan: true } 
    });
    if (restaurant && restaurant.plan) {
      const activeUsers = await this.prisma.user.count({ where: { isActive: true } });
      const limit = restaurant.plan.maxUsers;
      if (activeUsers >= limit) {
        throw new ForbiddenException(`Límite de usuarios (${limit}) alcanzado para el plan ${restaurant.plan.name}. Mejore su plan para añadir más.`);
      }
    }

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        password: hashedPassword,
        pin: dto.pin || null,
        role: dto.role ?? 'CASHIER',
        allowedViews: dto.allowedViews ?? [],
      },
    });
    const { password, ...result } = user;
    return result;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const data: any = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    } else {
      delete data.password;
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
