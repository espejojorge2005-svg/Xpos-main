import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service'; 
import { ClsService } from 'nestjs-cls';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

const isValidUuid = (val: any): boolean =>
  typeof val === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

@Injectable()
export class FloorService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  private async resolveRestaurantId(reqUser?: any): Promise<string> {
    const rawId = reqUser?.restaurantId || this.cls.get('restaurantId');
    if (isValidUuid(rawId)) {
      const rest = await this.prisma.restaurant.findUnique({ where: { id: rawId } });
      if (rest) return rest.id;
    }

    // Si el usuario en req tiene userId válido, verificar si tiene restaurantId asignado en BD
    if (reqUser?.userId && isValidUuid(reqUser.userId)) {
      const user = await this.prisma.user.findUnique({
        where: { id: reqUser.userId },
        select: { restaurantId: true }
      });
      if (user?.restaurantId && isValidUuid(user.restaurantId)) {
        return user.restaurantId;
      }
    }

    // Fallback: primer restaurante disponible en la base de datos
    const first = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
    if (first) return first.id;

    // Si no existe ningún restaurante en la base de datos, crear uno por defecto
    const created = await this.prisma.restaurant.create({
      data: {
        name: 'Restaurante Principal',
        subscriptionEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        isActive: true,
      },
    });
    return created.id;
  }

  async createZone(data: CreateZoneDto, reqUser?: any) {
    const restaurantId = await this.resolveRestaurantId(reqUser);
    return this.prisma.zone.create({
      data: {
        name: data.name.trim(),
        isActive: data.isActive ?? true,
        restaurantId,
      },
    });
  }

  async updateZone(id: string, data: UpdateZoneDto, reqUser?: any) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zona no encontrada');

    return this.prisma.zone.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  }

  async deleteZone(id: string, reqUser?: any) {
    const zone = await this.prisma.zone.findUnique({
      where: { id },
      include: { tables: true }
    });
    if (!zone) throw new NotFoundException('Zona no encontrada');

    // Eliminar primero las mesas asociadas para evitar restricción de integridad referencial
    if (zone.tables && zone.tables.length > 0) {
      await this.prisma.table.deleteMany({
        where: { zoneId: id },
      });
    }

    return this.prisma.zone.delete({
      where: { id },
    });
  }

  async createTable(data: CreateTableDto, reqUser?: any) {
    const zone = await this.prisma.zone.findUnique({ where: { id: data.zoneId } });
    if (!zone) throw new NotFoundException('La zona especificada no existe');

    return this.prisma.table.create({
      data: {
        zoneId: data.zoneId,
        number: String(data.number).trim(),
        capacity: Number(data.capacity),
        posX: data.posX ?? 0,
        posY: data.posY ?? 0,
      },
    });
  }

  async updateTable(id: string, data: UpdateTableDto, reqUser?: any) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Mesa no encontrada');

    const updateData: any = {};
    if (data.number !== undefined) updateData.number = String(data.number).trim();
    if (data.capacity !== undefined) updateData.capacity = Number(data.capacity);
    const anyData = data as any;
    if (anyData.status !== undefined) updateData.status = anyData.status;
    if (data.posX !== undefined) updateData.posX = data.posX;
    if (data.posY !== undefined) updateData.posY = data.posY;
    if (data.zoneId !== undefined) {
      const zone = await this.prisma.zone.findUnique({ where: { id: data.zoneId } });
      if (!zone) throw new NotFoundException('La nueva zona no existe');
      updateData.zoneId = data.zoneId;
    }

    return this.prisma.table.update({
      where: { id },
      data: updateData,
    });
  }

  async deleteTable(id: string, reqUser?: any) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Mesa no encontrada');

    return this.prisma.table.delete({
      where: { id },
    });
  }

  async findAllZones(reqUser?: any) {
    const restaurantId = await this.resolveRestaurantId(reqUser);
    return this.prisma.zone.findMany({
      where: { restaurantId },
      include: {
        tables: {
          include: {
            orders: {
              where: { status: 'OPEN' },
              select: { createdAt: true },
              orderBy: { createdAt: 'desc' },
              take: 1,
            }
          }
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}

