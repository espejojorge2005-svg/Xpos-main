import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IsString, IsNumber, IsArray, IsOptional, IsBoolean } from 'class-validator';

export class CreatePlanDto {
  @IsString()
  name: string;

  @IsString()
  code: string;

  @IsNumber()
  price: number;

  @IsNumber()
  maxUsers: number;

  @IsArray()
  @IsString({ each: true })
  features: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePlanDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  maxUsers?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

@Injectable()
export class PlansService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.subscriptionPlan.findMany({
      orderBy: { price: 'asc' }
    });
  }

  async findOne(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return plan;
  }

  async create(dto: CreatePlanDto) {
    const exists = await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.code } });
    if (exists) throw new BadRequestException('Ya existe un plan con este código');

    return this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        code: dto.code,
        price: dto.price,
        maxUsers: dto.maxUsers,
        features: dto.features,
        isActive: dto.isActive ?? true
      }
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');

    if (dto.code && dto.code !== plan.code) {
        const exists = await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.code } });
        if (exists) throw new BadRequestException('Ya existe un plan con este código');
    }

    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.maxUsers !== undefined && { maxUsers: dto.maxUsers }),
        ...(dto.features !== undefined && { features: dto.features }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      }
    });
  }

  async toggleStatus(id: string, isActive: boolean) {
    const plan = await this.prisma.subscriptionPlan.findUnique({ where: { id } });
    if (!plan) throw new NotFoundException('Plan no encontrado');
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { isActive }
    });
  }
}
