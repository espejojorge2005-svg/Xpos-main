import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcrypt';
import { IsString, IsOptional, IsDateString, IsEnum } from 'class-validator';

export class CreateRestaurantSaaS {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slogan?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;
}

export class UpdateRestaurantSaaS {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slogan?: string;

  @IsOptional()
  @IsString()
  planId?: string;

  @IsOptional()
  @IsString()
  ownerName?: string;

  @IsOptional()
  @IsString()
  ownerPhone?: string;

  @IsOptional()
  @IsString()
  subscriptionEndDate?: string | Date;
}

export class UpdateAdminSaaS {
  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;
}

@Injectable()
export class SaasService {
  constructor(private prisma: PrismaService) {}

  async findAllRestaurants() {
    return this.prisma.restaurant.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        plan: true,
        _count: {
          select: { users: true, orders: true }
        }
      }
    });
  }

  async createRestaurant(dto: CreateRestaurantSaaS) {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 30); // 30 días de prueba / inicio

    return this.prisma.restaurant.create({
      data: {
        name: dto.name,
        slogan: dto.slogan,
        planId: dto.planId,
        ownerName: dto.ownerName,
        ownerPhone: dto.ownerPhone,
        subscriptionEndDate: endDate,
        isActive: true,
      }
    });
  }

  async renewSubscription(id: string, daysToAdd: number) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    const currentEnd = new Date(restaurant.subscriptionEndDate);
    const now = new Date();
    
    // Si ya caducó, renovamos desde hoy. Si no, acumulamos sobre lo que le quedaba.
    const baseDate = currentEnd < now ? now : currentEnd;
    baseDate.setDate(baseDate.getDate() + daysToAdd);

    return this.prisma.restaurant.update({
      where: { id },
      data: {
        subscriptionEndDate: baseDate,
        isActive: true
      }
    });
  }

  async createAdminForRestaurant(restaurantId: string, dto: { name: string; email: string; password: string }) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('El correo ya está registrado en el sistema');
    
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
       data: {
          name: dto.name,
          email: dto.email,
          password: hashedPassword,
          role: 'ADMIN',
          restaurantId: restaurantId,
          allowedViews: ['*'],
          isActive: true
       }
    });
  }

  async toggleRestaurantStatus(id: string, isActive: boolean) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    return this.prisma.restaurant.update({
      where: { id },
      data: { isActive }
    });
  }
  async updateRestaurant(id: string, dto: UpdateRestaurantSaaS) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    return this.prisma.restaurant.update({
      where: { id },
      data: {
        name: dto.name,
        slogan: dto.slogan,
        planId: dto.planId,
        ownerName: dto.ownerName,
        ownerPhone: dto.ownerPhone,
        subscriptionEndDate: dto.subscriptionEndDate ? new Date(dto.subscriptionEndDate) : undefined,
      }
    });
  }

  async getRestaurantAdmin(restaurantId: string) {
    const admin = await this.prisma.user.findFirst({
      where: { restaurantId, role: 'ADMIN' },
      orderBy: { createdAt: 'asc' }
    });
    if (!admin) throw new NotFoundException('No se encontró administrador para este restaurante');
    
    const { password, ...result } = admin;
    return result;
  }

  async updateRestaurantAdmin(restaurantId: string, dto: UpdateAdminSaaS) {
    const admin = await this.prisma.user.findFirst({
      where: { restaurantId, role: 'ADMIN' },
      orderBy: { createdAt: 'asc' }
    });
    if (!admin) throw new NotFoundException('No se encontró administrador para este restaurante');

    const data: any = {};
    if (dto.email && dto.email !== admin.email) {
      const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (exists) throw new BadRequestException('El correo ya esta en uso por otro usuario');
      data.email = dto.email;
    }

    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(data).length === 0) return { message: 'No se realizaron cambios' };

    const updated = await this.prisma.user.update({
      where: { id: admin.id },
      data
    });

    return { message: 'Credenciales de administrador actualizadas', email: updated.email };
  }
}
