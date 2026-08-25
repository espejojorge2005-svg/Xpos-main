import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
// Ajusta esta ruta de importación para que apunte a donde tienes tu PrismaService
import { PrismaService } from '../../../prisma/prisma.service'; 

@Injectable()
export class ProductsService {
  // Inyectamos el servicio de Prisma que ya usas para tus usuarios
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: any) {
    const { modifierGroups, stationIds, ...productData } = createProductDto;

    const newProduct = await this.prisma.product.create({
      data: {
        ...productData,
        ...(stationIds?.length > 0 && {
          stations: { connect: stationIds.map(id => ({ id })) }
        }),
        modifierGroups: modifierGroups && modifierGroups.length > 0 ? {
          create: modifierGroups.map(mg => ({
            name: mg.name,
            minSelect: mg.minSelect,
            maxSelect: mg.maxSelect,
            options: {
              create: mg.options.map(opt => ({
                targetProductId: opt.targetProductId,
                priceOverride: opt.priceOverride
              }))
            }
          }))
        } : undefined
      },
      include: {
        category: true,
        stations: true,
        modifierGroups: {
          include: { options: { include: { targetProduct: true } } }
        }
      }
    });

    return {
      ...newProduct,
      category: newProduct.category?.name || 'Sin Categoría',
      categoryId: newProduct.categoryId
    };
  }

  async findAll() {
    const products = await this.prisma.product.findMany({
      orderBy: { name: 'asc' },
      include: { 
        category: true, 
        stations: true,
        modifierGroups: {
          include: { options: { include: { targetProduct: true } } }
        }
      }
    });

    return products.map(p => ({
      ...p,
      category: p.category?.name || 'Sin Categoría',
      categoryId: p.categoryId
    }));
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({ 
      where: { id },
      include: { 
        category: true, 
        stations: true,
        modifierGroups: {
          include: { options: { include: { targetProduct: true } } }
        }
      }
    });
    if (!product) throw new NotFoundException(`Producto con ID ${id} no encontrado`);
    
    return {
      ...product,
      category: product.category?.name || 'Sin Categoría',
      categoryId: product.categoryId
    };
  }

  async update(id: string, updateProductDto: UpdateProductDto) {
    await this.findOne(id);
    
    // Si viene la propiedad modifierGroups en el DTO, reescribimos los modificadores
    // Prisma permite borrar los existentes (deleteMany) y recrearlos en una sola operación.
    const { modifierGroups, stationIds, ...productData } = updateProductDto as any; // Cast avoid TS strict partial checks

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        stations: {
          set: [], // Resetea primero (quita relaciones anteriores)
          connect: stationIds?.map((id: string) => ({ id })) || []
        },
        modifierGroups: modifierGroups !== undefined ? {
          deleteMany: {},
          create: modifierGroups.map((mg: any) => ({
            name: mg.name,
            minSelect: mg.minSelect,
            maxSelect: mg.maxSelect,
            options: {
              create: mg.options.map((opt: any) => ({
                targetProductId: opt.targetProductId,
                priceOverride: opt.priceOverride
              }))
            }
          }))
        } : undefined
      },
      include: { 
        category: true, 
        stations: true,
        modifierGroups: {
          include: { options: { include: { targetProduct: true } } }
        }
      }
    });

    return {
      ...updatedProduct,
      category: updatedProduct.category?.name || 'Sin Categoría',
      categoryId: updatedProduct.categoryId
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    return await this.prisma.product.update({
      where: { id },
      data: { isActive: false }
    });
  }

  async adjustStock(id: string, delta: number, reason?: string) {
    const product = await this.findOne(id);
    const stockBefore = product.stock;
    const stockAfter = stockBefore + delta;

    const [updated] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { stock: { increment: delta } },
        select: { id: true, name: true, stock: true }
      }),
      this.prisma.stockMovement.create({
        data: {
          productId: id,
          type: 'ADJUSTMENT',
          delta,
          stockBefore,
          stockAfter,
          reason: reason || (delta > 0 ? 'Ajuste manual (entrada)' : 'Ajuste manual (salida)')
        }
      })
    ]);

    return updated;
  }

  async getStockHistory(id: string, days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const movements = await this.prisma.stockMovement.findMany({
      where: {
        productId: id,
        createdAt: { gte: since }
      },
      orderBy: { createdAt: 'desc' }
    });

    return movements;
  }

  async getKardex(days = 7) {
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    // Fetch all movements in period along with product info
    const movements = await this.prisma.stockMovement.findMany({
      where: { createdAt: { gte: since } },
      include: { product: { select: { id: true, name: true, stock: true, minStock: true, category: { select: { name: true } } } } },
      orderBy: { createdAt: 'asc' },
    });

    // Also fetch all active products to include ones with no movements
    const allProducts = await this.prisma.product.findMany({
      where: { isActive: true },
      select: { id: true, name: true, stock: true, minStock: true, category: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });

    // Build list of dates (last `days` days, oldest first)
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().slice(0, 10)); // 'YYYY-MM-DD'
    }

    // Group: productId -> dateString -> last stockAfter of that day
    const closingByProductDate: Record<string, Record<string, number>> = {};

    for (const mov of movements) {
      const dateKey = mov.createdAt.toISOString().slice(0, 10);
      const pid = mov.productId;
      if (!closingByProductDate[pid]) closingByProductDate[pid] = {};
      // Overwrite — since ordered asc, last one wins = closing of day (last shift)
      closingByProductDate[pid][dateKey] = mov.stockAfter;
    }

    // Build result: for each product, carry forward last known stock if no movement on a day
    const kardex = allProducts.map((product) => {
      const dailyClosing: Record<string, number | null> = {};
      let lastKnown: number | null = null;

      // Walk dates oldest → newest, carry stock forward
      for (const date of dates) {
        const closing = closingByProductDate[product.id]?.[date];
        if (closing !== undefined) {
          lastKnown = closing;
          dailyClosing[date] = closing;
        } else {
          // No movement today: carry forward (null if we have no data at all yet)
          dailyClosing[date] = lastKnown;
        }
      }

      return {
        productId: product.id,
        productName: product.name,
        category: product.category?.name ?? 'Sin Categoría',
        currentStock: product.stock,
        minStock: product.minStock,
        dailyClosing, // { 'YYYY-MM-DD': number | null }
      };
    });

    return { dates, kardex };
  }
}