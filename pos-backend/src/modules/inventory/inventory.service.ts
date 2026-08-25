import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateRecipeItemDto } from './dto/create-recipe-item.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  async createCategory(data: CreateCategoryDto) {
    return this.prisma.category.create({
      data: {
        name: data.name,
      },
    });
  }

  async findAllCategories() {
    return this.prisma.category.findMany({
      include: {
        products: true, // Para que cuando pidamos las categorías, nos traiga sus platos
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