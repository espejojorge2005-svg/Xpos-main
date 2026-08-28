import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';

@Injectable()
export class KitchenStationsService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  private resolveTenantId(restaurantId?: string | null, reqUser?: any): string | null {
    return restaurantId || this.cls.get('restaurantId') || reqUser?.restaurantId || null;
  }

  async create(data: CreateKitchenStationDto, restaurantId?: string | null, reqUser?: any) {
    const targetRestId = this.resolveTenantId(restaurantId || data.restaurantId, reqUser);
    if (!targetRestId) {
      throw new BadRequestException('El ID del restaurante es obligatorio para crear un área de preparación');
    }
    return this.prisma.kitchenStation.create({
      data: {
        name: data.name.trim(),
        colorHex: data.colorHex,
        printerName: data.printerName || null,
        restaurantId: targetRestId,
      }
    });
  }


  async findAll(restaurantId?: string | null, reqUser?: any) {
    const targetRestId = this.resolveTenantId(restaurantId, reqUser);
    if (!targetRestId) {
      return [];
    }
    return this.prisma.kitchenStation.findMany({
      where: { restaurantId: targetRestId },
      orderBy: { name: 'asc' }
    });
  }


  async update(id: string, data: UpdateKitchenStationDto, restaurantId?: string | null, reqUser?: any) {
    const targetRestId = this.resolveTenantId(restaurantId, reqUser);
    const station = await this.prisma.kitchenStation.findFirst({
      where: {
        id,
        ...(targetRestId ? { restaurantId: targetRestId } : {})
      }
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    return this.prisma.kitchenStation.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.colorHex !== undefined ? { colorHex: data.colorHex } : {}),
        ...(data.printerName !== undefined ? { printerName: data.printerName } : {}),
      }
    });
  }

  async remove(id: string, restaurantId?: string | null, reqUser?: any) {
    const targetRestId = this.resolveTenantId(restaurantId, reqUser);
    const station = await this.prisma.kitchenStation.findFirst({
      where: {
        id,
        ...(targetRestId ? { restaurantId: targetRestId } : {})
      }
    });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    return this.prisma.kitchenStation.delete({ where: { id } });
  }
}

