import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';

export interface UpdateRestaurantConfigDto {
  name?: string;
  slogan?: string;
  address?: string;
  phone?: string;
  ruc?: string;
  logoUrl?: string;
}

@Injectable()
export class RestaurantConfigService {
  constructor(private prisma: PrismaService, private cls: ClsService) {}

  async getConfig() {
    const restaurantId = this.cls.get('restaurantId');
    const res = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!res) throw new NotFoundException('Configuración no disponible');
    return res;
  }

  async updateConfig(dto: UpdateRestaurantConfigDto) {
    const res = await this.getConfig();
    return this.prisma.restaurant.update({
      where: { id: res.id },
      data: dto as any,
    });
  }
}
