import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClsService } from 'nestjs-cls';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateRecipeItemDto } from './dto/create-recipe-item.dto';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private cls: ClsService,
  ) {}

  private async resolveTenantId(restaurantId?: string | null): Promise<string | null> {
    const candidate = restaurantId || this.cls.get('restaurantId') || null;
    if (candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate)) {
      return candidate;
    }
    // Si no es un UUID válido (ej. 'main' o undefined), resolver el restaurante por defecto
    const defaultRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } }).catch(() => null);
    return defaultRest ? defaultRest.id : null;
  }

  async createCategory(data: CreateCategoryDto, restaurantId?: string | null) {
    let targetRestId = await this.resolveTenantId(restaurantId || data.restaurantId);
    if (!targetRestId) {
      throw new BadRequestException('El ID del restaurante es obligatorio para crear una categoría');
    }

    return this.prisma.category.create({
      data: {
        name: data.name.trim(),
        restaurantId: targetRestId,
      },
    });
  }


  async findAllCategories(restaurantId?: string | null) {
    const targetRestId = await this.resolveTenantId(restaurantId);

    if (!targetRestId) {
      return [];
    }

    return this.prisma.category.findMany({
      where: {
        OR: [
          { restaurantId: targetRestId },
          { restaurantId: null }
        ]
      },
      include: {
        products: true,
      },
      orderBy: {
        name: 'asc',
      },
    });
  }



  async updateCategory(id: string, data: Partial<CreateCategoryDto>) {
    return this.prisma.category.update({
      where: { id },
      data: {
        name: data.name,
      },
    });
  }

  async deleteCategory(id: string) {
    const productsCount = await this.prisma.product.count({
      where: { categoryId: id }
    });

    if (productsCount > 0) {
      throw new Error('No se puede eliminar la categoría porque tiene productos asignados. Mueve o elimina los productos primero.');
    }

    return this.prisma.category.delete({
      where: { id },
    });
  }

  async createProduct(data: CreateProductDto) {
    const stationIds = data.stationIds || [];
    return this.prisma.product.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        price: data.price,
        isActive: data.isActive ?? true,
        ...(stationIds.length > 0 && {
          stations: {
            connect: stationIds.map(id => ({ id })),
          },
        }),
      },
      include: {
        stations: true,
      }
    });
  }

  // 1. Ingresar materia prima al almacén
  async createInventoryItem(data: CreateInventoryItemDto) {
    return this.prisma.inventoryItem.create({
      data: {
        name: data.name,
        stockQuantity: data.stockQuantity,
        unitOfMeasure: data.unitOfMeasure,
      },
    });
  }

  // 2. Vincular el ingrediente al plato (Crear la receta)
  async addRecipeItem(data: CreateRecipeItemDto) {
    return this.prisma.recipeItem.create({
      data: {
        productId: data.productId,
        inventoryItemId: data.inventoryItemId,
        quantityRequired: data.quantityRequired,
      },
    });
  }
}