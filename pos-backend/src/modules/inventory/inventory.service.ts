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
    let targetRestId = restaurantId || data.restaurantId || null;
    const isUuid = targetRestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetRestId);
    
    // Si no viene un UUID válido, asociar con el primer restaurante de la base de datos
    if (!isUuid) {
      const firstRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
      if (firstRest) targetRestId = firstRest.id;
    }

    return this.prisma.category.create({
      data: {
        name: data.name.trim(),
        ...(targetRestId ? { restaurantId: targetRestId } : {}),
      },
    });
  }

  async findAllCategories(restaurantId?: string | null) {
    let targetRestId = restaurantId;
    const isUuid = targetRestId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetRestId);
    
    // Fallback al primer restaurante si no se proveyó un UUID válido en cabeceras
    if (!isUuid) {
      const firstRest = await this.prisma.restaurant.findFirst({ orderBy: { createdAt: 'asc' } });
      if (firstRest) targetRestId = firstRest.id;
    }

    if (!targetRestId) {
      return [];
    }

    return this.prisma.category.findMany({
      where: {
        OR: [
          { restaurantId: targetRestId },
          { restaurantId: null }, // Categorías globales o creadas antes de la asignación de ID
        ],
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