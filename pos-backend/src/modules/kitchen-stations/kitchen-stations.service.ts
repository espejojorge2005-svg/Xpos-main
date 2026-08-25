import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';

@Injectable()
export class KitchenStationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: CreateKitchenStationDto) {
    return this.prisma.kitchenStation.create({ data });
  }

  async findAll() {
    return this.prisma.kitchenStation.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async update(id: string, data: UpdateKitchenStationDto) {
    const station = await this.prisma.kitchenStation.findUnique({ where: { id } });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    return this.prisma.kitchenStation.update({
      where: { id },
      data
    });
  }

  async remove(id: string) {
    const station = await this.prisma.kitchenStation.findUnique({ where: { id } });
    if (!station) throw new NotFoundException(`Station ${id} not found`);

    return this.prisma.kitchenStation.delete({ where: { id } });
  }
}
