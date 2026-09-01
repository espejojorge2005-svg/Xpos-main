import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';

@Injectable()
export class RestaurantConfigService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  async getConfig(restaurantIdParam?: string | null) {
    const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    const rawId = restaurantIdParam || this.cls.get('restaurantId');
    const validId = (rawId && isUuid(rawId)) ? rawId : null;

    let res = validId ? await this.prisma.restaurant.findUnique({ 
      where: { id: validId },
      include: { plan: true }
    }) : null;

    if (!res) {
      // Fallback: Si no tiene restaurantId o no se encuentra, obtener el primer restaurante activo
      res = await this.prisma.restaurant.findFirst({
        orderBy: { createdAt: 'asc' },
        include: { plan: true }
      });
    }

    if (!res) {
      // Crear uno por defecto en caso la base de datos esté vacía
      res = await this.prisma.restaurant.create({
        data: {
          name: 'Mi Restaurante',
          subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          isActive: true,
        },
        include: { plan: true }
      });
    }

    return res;
  }

  async updateConfig(dto: UpdateRestaurantConfigDto, restaurantIdParam?: string | null) {
    const res = await this.getConfig(restaurantIdParam);
    return this.prisma.restaurant.update({
      where: { id: res.id },
      data: dto as any,
      include: { plan: true }
    });
  }
}


