import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { PrismaService } from '../../../prisma/prisma.service'; 
import { ClsService } from 'nestjs-cls';

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService
  ) {}

  private getTenantRestaurantId(reqUser?: any, restaurantIdParam?: string | null): string | null {
    if (restaurantIdParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantIdParam)) {
      return restaurantIdParam;
    }
    const clsId = this.cls.get('restaurantId');
    if (clsId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clsId)) {
      return clsId;
    }
    const userRestId = reqUser?.restaurantId;
    if (userRestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userRestId)) {
      return userRestId;
    }
    return null;
  }

  async create(createProductDto: any, reqUser?: any, restaurantIdParam?: string | null) {
    let restaurantId = this.getTenantRestaurantId(reqUser, restaurantIdParam) || createProductDto.restaurantId;
    if (!restaurantId) {
      const defaultRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
      if (defaultRest) restaurantId = defaultRest.id;
    }

    const { modifierGroups, stationIds, categoryId, ...productData } = createProductDto;

    let validCategoryId = categoryId;
    if (categoryId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(categoryId)) {
      const catExists = await this.prisma.category.findFirst({
        where: { id: categoryId, ...(restaurantId ? { restaurantId } : {}) }
      });
      if (!catExists) {
        validCategoryId = undefined;
      }
    } else {
      validCategoryId = undefined;
    }

    // Auto-vincular o crear categoría "General" si no se especificó una categoría válida
    if (!validCategoryId && restaurantId) {
      let defaultCat = await this.prisma.category.findFirst({
        where: { name: 'General', restaurantId }
      });
      if (!defaultCat) {
        defaultCat = await this.prisma.category.create({
          data: { name: 'General', restaurantId }
        });
      }
      validCategoryId = defaultCat.id;
    }

    const newProduct = await this.prisma.product.create({
      data: {
        ...productData,
        stock: productData.stock ?? 0,
        minStock: productData.minStock ?? 0,
        price: Number(productData.price) || 0,
        restaurantId: restaurantId || null,
        categoryId: validCategoryId,
        ...(stationIds?.length > 0 && {
          stations: { connect: stationIds.map((id: string) => ({ id })) }
        }),
        modifierGroups: modifierGroups && modifierGroups.length > 0 ? {
          create: modifierGroups.map((mg: any) => ({
            name: mg.name,
            minSelect: mg.minSelect ?? 0,
            maxSelect: mg.maxSelect ?? 1,
            options: {
              create: (mg.options || []).map((opt: any) => ({
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
      categoryId: newProduct.categoryId,
      restaurantId: newProduct.restaurantId
    };
  }

  async findAll(reqUser?: any, restaurantIdParam?: string | null) {
    let restaurantId = this.getTenantRestaurantId(reqUser, restaurantIdParam);
    if (!restaurantId && reqUser?.id) {
      const u = await this.prisma.user.findUnique({ where: { id: reqUser.id } }).catch(() => null);
      if (u?.restaurantId) restaurantId = u.restaurantId;
    }
    if (!restaurantId) {
      const defaultRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
      if (defaultRest) restaurantId = defaultRest.id;
    }

    const whereClause: any = { 
      isActive: true,
      ...(restaurantId ? {
        OR: [
          { restaurantId },
          { restaurantId: null }
        ]
      } : {})
    };

    const products = await this.prisma.product.findMany({
      where: whereClause,
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
      categoryId: p.categoryId,
      restaurantId: p.restaurantId
    }));
  }

  async findOne(id: string, reqUser?: any, restaurantIdParam?: string | null) {
    const restaurantId = this.getTenantRestaurantId(reqUser, restaurantIdParam);
    const whereClause: any = { id };
    if (restaurantId) {
      whereClause.restaurantId = restaurantId;
    }

    const product = await this.prisma.product.findFirst({ 
      where: whereClause,
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
      categoryId: product.categoryId,
      restaurantId: product.restaurantId
    };
  }


  async update(id: string, updateProductDto: UpdateProductDto, reqUser?: any, restaurantIdParam?: string | null) {
    await this.findOne(id, reqUser, restaurantIdParam);
    
    const { modifierGroups, stationIds, ...productData } = updateProductDto as any;

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: {
        ...productData,
        stations: {
          set: [],
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

  async remove(id: string, reqUser?: any, restaurantIdParam?: string | null) {
    await this.findOne(id, reqUser, restaurantIdParam);
    return await this.prisma.product.update({
      where: { id },
      data: { isActive: false }
    });
  }

  async adjustStock(id: string, delta: number, reason?: string, reqUser?: any, restaurantIdParam?: string | null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      throw new NotFoundException(`ID inválido: ${id}`);
    }

    const product = await this.findOne(id, reqUser, restaurantIdParam);
    const stockBefore = product.stock ?? 0;
    const stockAfter = Math.max(0, stockBefore + delta);

    const [updated] = await this.prisma.$transaction([
      this.prisma.product.update({
        where: { id },
        data: { stock: stockAfter },
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

  async getStockHistory(id: string, days = 7, reqUser?: any, restaurantIdParam?: string | null) {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) return [];

    await this.findOne(id, reqUser, restaurantIdParam);
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

  async getKardex(days = 7, reqUser?: any, restaurantIdParam?: string | null) {
    try {
      const restaurantId = this.getTenantRestaurantId(reqUser, restaurantIdParam);
      const since = new Date();
      since.setDate(since.getDate() - (days - 1));
      since.setHours(0, 0, 0, 0);

      const whereProductClause: any = { isActive: true };
      if (restaurantId && reqUser?.role !== 'SUPER_ADMIN') {
        whereProductClause.restaurantId = restaurantId;
      }

      const allProducts = await this.prisma.product.findMany({
        where: whereProductClause,
        select: { id: true, name: true, stock: true, minStock: true, category: { select: { name: true } } },
        orderBy: { name: 'asc' },
      });

      const productIds = allProducts.map(p => p.id);

      const movements = productIds.length > 0 ? await this.prisma.stockMovement.findMany({
        where: { 
          productId: { in: productIds },
          createdAt: { gte: since } 
        },
        select: { productId: true, createdAt: true, stockAfter: true },
        orderBy: { createdAt: 'asc' },
      }) : [];

      const dates: string[] = [];
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
      }

      const closingByProductDate: Record<string, Record<string, number>> = {};

      for (const mov of movements) {
        const dateKey = mov.createdAt.toISOString().slice(0, 10);
        const pid = mov.productId;
        if (!closingByProductDate[pid]) closingByProductDate[pid] = {};
        closingByProductDate[pid][dateKey] = mov.stockAfter;
      }

      const todayKey = new Date().toISOString().slice(0, 10);

      const kardex = allProducts.map((product) => {
        const dailyClosing: Record<string, number | null> = {};
        let lastKnown: number | null = null;

        for (const date of dates) {
          const closing = closingByProductDate[product.id]?.[date];
          if (closing !== undefined) {
            lastKnown = closing;
            dailyClosing[date] = closing;
          } else if (date === todayKey) {
            dailyClosing[date] = product.stock;
          } else {
            dailyClosing[date] = lastKnown;
          }
        }

        return {
          productId: product.id,
          productName: product.name,
          category: product.category?.name ?? 'Sin Categoría',
          currentStock: product.stock,
          minStock: product.minStock,
          dailyClosing,
        };
      });

      return { dates, kardex };
    } catch (e: any) {
      console.error('Error fetching kardex in backend:', e);
      return { dates: [], kardex: [] };
    }
  }
}