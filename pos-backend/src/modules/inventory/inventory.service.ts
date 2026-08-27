import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateRecipeItemDto } from './dto/create-recipe-item.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async createCategory(data: CreateCategoryDto, restaurantId?: string | null) {
    const isUuid = restaurantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId);
    return this.prisma.category.create({
      data: {
        name: data.name,
        ...(isUuid ? { restaurantId } : {}),
      },
    });
  }

  async findAllCategories(restaurantId?: string | null) {
    const isUuid = restaurantId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(restaurantId);
    if (!isUuid) {
      return []; // Si es un negocio nuevo o mock local, empieza completamente vacío sin categorías de otros
    }
    return this.prisma.category.findMany({
      where: {
        restaurantId,
      },
      include: {
        products: true,
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