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
    endDate.setDate(endDate.getDate() + 30); // 30 días iniciales de suscripción

    let validPlanId: string | null = null;
    if (dto.planId) {
      const planExists = await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } });
      if (planExists) {
        validPlanId = dto.planId;
      }
    }

    return this.prisma.restaurant.create({
      data: {
        name: dto.name,
        slogan: dto.slogan || null,
        planId: validPlanId,
        ownerName: dto.ownerName || null,
        ownerPhone: dto.ownerPhone || null,
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
    
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    
    if (exists) {
      return this.prisma.user.update({
        where: { email: dto.email },
        data: {
          name: dto.name,
          password: hashedPassword,
          role: 'ADMIN',
          restaurantId: restaurantId,
          allowedViews: ['*'],
          isActive: true
        }
      });
    }
    
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

  async getRestaurantAdmin(restaurantId: string) {
    const admin = await this.prisma.user.findFirst({
      where: {
        restaurantId,
        role: 'ADMIN',
      },
      select: {
        id: true,
        name: true,
        email: true,
      }
    });

    if (!admin) throw new NotFoundException('El restaurante no tiene administrador asignado');
    return admin;
  }

  async updateRestaurantAdmin(restaurantId: string, dto: UpdateAdminSaaS) {
    const admin = await this.prisma.user.findFirst({
      where: { restaurantId, role: 'ADMIN' }
    });

    if (!admin) throw new NotFoundException('No existe administrador asignado para este restaurante');

    const updateData: any = {};
    if (dto.email && dto.email !== admin.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (emailExists) throw new BadRequestException('El correo ya está en uso por otro usuario');
      updateData.email = dto.email;
    }

    if (dto.password) {
      updateData.password = await bcrypt.hash(dto.password, 10);
    }

    if (Object.keys(updateData).length === 0) return { message: 'No hay cambios' };

    return this.prisma.user.update({
      where: { id: admin.id },
      data: updateData
    });
  }

  async updateRestaurant(id: string, dto: UpdateRestaurantSaaS) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    const updateData: any = {};
    if (dto.name) updateData.name = dto.name;
    if (dto.slogan !== undefined) updateData.slogan = dto.slogan;
    if (dto.ownerName !== undefined) updateData.ownerName = dto.ownerName;
    if (dto.ownerPhone !== undefined) updateData.ownerPhone = dto.ownerPhone;
    
    if (dto.planId !== undefined) {
      if (dto.planId) {
        const planExists = await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } });
        updateData.planId = planExists ? dto.planId : null;
      } else {
        updateData.planId = null;
      }
    }

    if (dto.subscriptionEndDate) {
      updateData.subscriptionEndDate = new Date(dto.subscriptionEndDate);
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: updateData
    });
  }

  async deleteRestaurant(id: string) {
    try {
      await this.prisma.user.deleteMany({ where: { restaurantId: id } });
      await this.prisma.restaurant.delete({ where: { id } });
    } catch {
      // Soft delete if cascade delete has foreign keys
      await this.prisma.restaurant.update({ where: { id }, data: { isActive: false } }).catch(() => {});
    }
    return { message: 'Restaurante eliminado correctamente' };
  }
}
