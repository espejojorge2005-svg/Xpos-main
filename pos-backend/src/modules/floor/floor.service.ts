import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service'; 
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';

@Injectable()
export class FloorService {
  constructor(private prisma: PrismaService) {}

  async createZone(data: CreateZoneDto) {
    return this.prisma.zone.create({
      data: {
        name: data.name,
        isActive: data.isActive ?? true,
      },
    });
  }

  async updateZone(id: string, data: UpdateZoneDto) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zona no encontrada');

    return this.prisma.zone.update({
      where: { id },
      data,
    });
  }

  async deleteZone(id: string) {
    const zone = await this.prisma.zone.findUnique({ where: { id } });
    if (!zone) throw new NotFoundException('Zona no encontrada');

    return this.prisma.zone.delete({
      where: { id },
    });
  }

  async createTable(data: CreateTableDto) {
    return this.prisma.table.create({
      data: {
        zoneId: data.zoneId,
        number: data.number,
        capacity: data.capacity,
        posX: data.posX ?? 0,
        posY: data.posY ?? 0,
      },
    });
  }

  async updateTable(id: string, data: UpdateTableDto) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Mesa no encontrada');

    return this.prisma.table.update({
      where: { id },
      data,
    });
  }

  async deleteTable(id: string) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Mesa no encontrada');

    return this.prisma.table.delete({
      where: { id },
    });
  }

  async findAllZones() {
    return this.prisma.zone.findMany({
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
    });
  }
}
