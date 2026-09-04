import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { IsString, IsOptional, IsDateString, IsEnum, IsNumber } from 'class-validator';

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

  @IsOptional()
  @IsString()
  adminName?: string;

  @IsOptional()
  @IsString()
  adminEmail?: string;

  @IsOptional()
  @IsString()
  adminPassword?: string;
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

export class RenewSubscriptionDto {
  @IsNumber()
  days: number;
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
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.planId);
      const planExists = isUuid
        ? await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } })
        : await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.planId.toUpperCase() } });
      if (planExists) {
        validPlanId = planExists.id;
      }
    }

    let cleanEmail: string | null = null;
    let hashedPassword: string | null = null;

    if (dto.adminEmail && dto.adminPassword) {
      cleanEmail = dto.adminEmail.trim().toLowerCase();
      hashedPassword = await bcrypt.hash(dto.adminPassword.trim(), 10);
    }

    return this.prisma.$transaction(async (tx) => {
      const restaurant = await tx.restaurant.create({
        data: {
          name: dto.name,
          slogan: dto.slogan || null,
          planId: validPlanId,
          ownerName: dto.ownerName || null,
          ownerPhone: dto.ownerPhone || null,
          subscriptionEndDate: endDate,
          isActive: true,
        },
        include: {
          plan: true,
        }
      });

      let adminUser: any = null;
      if (cleanEmail && hashedPassword) {
        const existingUser = await tx.user.findUnique({ where: { email: cleanEmail } });
        if (existingUser) {
          adminUser = await tx.user.update({
            where: { email: cleanEmail },
            data: {
              name: dto.adminName || dto.ownerName || existingUser.name,
              password: hashedPassword,
              role: 'ADMIN',
              restaurantId: restaurant.id,
              allowedViews: ['*'],
              isActive: true,
            }
          });
        } else {
          adminUser = await tx.user.create({
            data: {
              name: dto.adminName || dto.ownerName || 'Administrador',
              email: cleanEmail,
              password: hashedPassword,
              role: 'ADMIN',
              restaurantId: restaurant.id,
              allowedViews: ['*'],
              isActive: true,
            }
          });
        }
      }

      return {
        ...restaurant,
        adminUser: adminUser ? { id: adminUser.id, name: adminUser.name, email: adminUser.email } : null,
        _count: { users: 1, orders: 0 }
      };
    }, { maxWait: 15000, timeout: 30000 });
  }


  async createAdminForRestaurant(restaurantId: string, dto: { name: string; email: string; password: string }) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id: restaurantId } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');
    
    const cleanEmail = dto.email.trim().toLowerCase();
    const cleanPassword = dto.password.trim();
    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const exists = await this.prisma.user.findUnique({ where: { email: cleanEmail } });
    
    if (exists) {
      return this.prisma.user.update({
        where: { email: cleanEmail },
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
          email: cleanEmail,
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

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: { isActive }
    });

    // Actualizar también a todos los usuarios del restaurante para suspender/activar acceso
    await this.prisma.user.updateMany({
      where: { restaurantId: id, role: { not: 'SUPER_ADMIN' } },
      data: { isActive }
    });

    return updated;
  }

  async renewSubscription(id: string, days: number) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    const now = new Date();
    let baseDate = restaurant.subscriptionEndDate && new Date(restaurant.subscriptionEndDate) > now 
      ? new Date(restaurant.subscriptionEndDate) 
      : now;

    baseDate.setDate(baseDate.getDate() + Number(days));

    const updated = await this.prisma.restaurant.update({
      where: { id },
      data: {
        subscriptionEndDate: baseDate,
        isActive: true,
      }
    });

    // Reactivar usuarios al renovar la suscripción
    await this.prisma.user.updateMany({
      where: { restaurantId: id, role: { not: 'SUPER_ADMIN' } },
      data: { isActive: true }
    });

    return updated;
  }

  async getRestaurantAdmin(restaurantId: string) {
    let admin = await this.prisma.user.findFirst({
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

    if (!admin) {
      admin = await this.prisma.user.findFirst({
        where: { restaurantId },
        select: { id: true, name: true, email: true }
      });
    }

    if (!admin) {
      const rest = await this.prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { ownerName: true }
      });
      return {
        id: null,
        name: rest?.ownerName || 'Administrador',
        email: '',
      };
    }

    return admin;
  }

  async updateRestaurantAdmin(restaurantId: string, dto: UpdateAdminSaaS) {
    let admin = await this.prisma.user.findFirst({
      where: { restaurantId, role: 'ADMIN' }
    });

    if (!admin) {
      admin = await this.prisma.user.findFirst({
        where: { restaurantId }
      });
    }

    const cleanEmail = dto.email ? dto.email.trim().toLowerCase() : null;

    if (!admin) {
      if (!cleanEmail) throw new BadRequestException('Debe ingresar un correo electrónico para el administrador');
      const plainPassword = dto.password?.trim() || '123456';
      const hashedPassword = await bcrypt.hash(plainPassword, 10);
      
      const newAdmin = await this.prisma.user.create({
        data: {
          name: 'Administrador Restaurante',
          email: cleanEmail,
          password: hashedPassword,
          role: 'ADMIN',
          restaurantId,
          allowedViews: ['*'],
          isActive: true,
        },
        select: { id: true, name: true, email: true, role: true }
      });
      return { message: 'Administrador creado y credenciales asignadas exitosamente', user: newAdmin };
    }

    const updateData: any = {};
    if (cleanEmail && cleanEmail !== admin.email) {
      const emailExists = await this.prisma.user.findUnique({ where: { email: cleanEmail } });
      if (emailExists && emailExists.id !== admin.id) {
        throw new BadRequestException('El correo ya está en uso por otro usuario del sistema');
      }
      updateData.email = cleanEmail;
    }

    if (dto.password && dto.password.trim().length > 0) {
      updateData.password = await bcrypt.hash(dto.password.trim(), 10);
    }

    if (Object.keys(updateData).length === 0) {
      return { message: 'No hay cambios para actualizar', user: admin };
    }

    updateData.role = 'ADMIN';
    updateData.isActive = true;
    updateData.allowedViews = ['*'];

    const updated = await this.prisma.user.update({
      where: { id: admin.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true }
    });

    return { message: 'Credenciales del dueño actualizadas exitosamente', user: updated };
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
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dto.planId);
        const planExists = isUuid
          ? await this.prisma.subscriptionPlan.findUnique({ where: { id: dto.planId } })
          : await this.prisma.subscriptionPlan.findUnique({ where: { code: dto.planId.toUpperCase() } });
        updateData.planId = planExists ? planExists.id : null;
      } else {
        updateData.planId = null;
      }
    }

    if (dto.subscriptionEndDate) {
      updateData.subscriptionEndDate = new Date(dto.subscriptionEndDate);
    }

    return this.prisma.restaurant.update({
      where: { id },
      data: updateData,
      include: {
        plan: true,
      }
    });
  }

  async deleteRestaurant(id: string) {
    const restaurant = await this.prisma.restaurant.findUnique({ where: { id } });
    if (!restaurant) throw new NotFoundException('Restaurante no encontrado');

    return this.prisma.$transaction(async (tx) => {
      // 0. Desvincular mesas de órdenes para evitar errores de clave foránea
      await tx.order.updateMany({
        where: { restaurantId: id },
        data: { tableId: null },
      });

      // 1. Pagos asociados a órdenes del restaurante
      await tx.payment.deleteMany({
        where: { order: { restaurantId: id } },
      });

      // 2. Desvincular items hijos (parentItemId) para evitar auto-referencia en cascada
      await tx.orderItem.updateMany({
        where: { order: { restaurantId: id } },
        data: { parentItemId: null },
      });

      // 3. Items de órdenes asociadas al restaurante
      await tx.orderItem.deleteMany({
        where: { order: { restaurantId: id } },
      });

      // 4. Órdenes del restaurante
      await tx.order.deleteMany({
        where: { restaurantId: id },
      });

      // 5. Gastos de caja y turnos de caja
      await tx.cashExpense.deleteMany({
        where: { shift: { restaurantId: id } },
      });
      await tx.cashShift.deleteMany({
        where: { restaurantId: id },
      });

      // 6. Movimientos de stock
      await tx.stockMovement.deleteMany({
        where: { product: { restaurantId: id } },
      });

      // 7. Opciones y grupos de modificadores (tanto por grupo como por producto objetivo)
      const products = await tx.product.findMany({ where: { restaurantId: id }, select: { id: true } });
      const productIds = products.map((p) => p.id);

      if (productIds.length > 0) {
        await tx.modifierOption.deleteMany({
          where: {
            OR: [
              { group: { productId: { in: productIds } } },
              { targetProductId: { in: productIds } },
            ],
          },
        });
        await tx.modifierGroup.deleteMany({
          where: { productId: { in: productIds } },
        });
      }

      // 8. Recetas asociadas a productos o insumos del restaurante
      const inventoryItems = await tx.inventoryItem.findMany({ where: { restaurantId: id }, select: { id: true } });
      const invItemIds = inventoryItems.map((i) => i.id);

      await tx.recipeItem.deleteMany({
        where: {
          OR: [
            ...(productIds.length > 0 ? [{ productId: { in: productIds } }] : []),
            ...(invItemIds.length > 0 ? [{ inventoryItemId: { in: invItemIds } }] : []),
          ],
        },
      });

      // 9. Productos
      await tx.product.deleteMany({
        where: { restaurantId: id },
      });

      // 10. Categorías
      await tx.category.deleteMany({
        where: { restaurantId: id },
      });

      // 11. Insumos de inventario
      await tx.inventoryItem.deleteMany({
        where: { restaurantId: id },
      });

      // 12. Estaciones de cocina
      await tx.kitchenStation.deleteMany({
        where: { restaurantId: id },
      });

      // 13. Mesas de zonas del restaurante
      await tx.table.deleteMany({
        where: { zone: { restaurantId: id } },
      });

      // 14. Zonas
      await tx.zone.deleteMany({
        where: { restaurantId: id },
      });

      // 15. Usuarios del restaurante
      await tx.user.deleteMany({
        where: { restaurantId: id },
      });

      // 16. Restaurante
      await tx.restaurant.delete({
        where: { id },
      });

      return { message: 'Restaurante y todos sus datos asociados eliminados permanentemente' };
    }, {
      maxWait: 20000,
      timeout: 45000,
    });
  }
}
