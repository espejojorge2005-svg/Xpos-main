import { Controller, Post, Body, Get, Patch, Delete, Param } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import { CreateRecipeItemDto } from './dto/create-recipe-item.dto';

@Controller('inventory') // Ruta base: /api/v1/inventory
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post('category') // POST /api/v1/inventory/category
  async createCategory(@Body() createCategoryDto: CreateCategoryDto) {
    return this.inventoryService.createCategory(createCategoryDto);
  }

  @Post('product') // Ruta final: POST /api/v1/inventory/product
  async createProduct(@Body() createProductDto: CreateProductDto) {
    return this.inventoryService.createProduct(createProductDto);
  }

  @Post('stock') // POST /api/v1/inventory/stock
  async createInventoryItem(@Body() createInventoryItemDto: CreateInventoryItemDto) {
    return this.inventoryService.createInventoryItem(createInventoryItemDto);
  }

  @Post('recipe') // POST /api/v1/inventory/recipe
  async addRecipeItem(@Body() createRecipeItemDto: CreateRecipeItemDto) {
    return this.inventoryService.addRecipeItem(createRecipeItemDto);
  }

  @Get('categories') // GET /api/v1/inventory/categories
  async getCategories() {
    try {
      return await this.inventoryService.findAllCategories();
    } catch (e: any) {
      console.error('Error fetching categories:', e);
      return { error: e.message || 'Unknown error', stack: e.stack };
    }
  }

  @Patch('category/:id') // PATCH /api/v1/inventory/category/:id
  async updateCategory(@Param('id') id: string, @Body() updateCategoryDto: UpdateCategoryDto) {
    try {
      return await this.inventoryService.updateCategory(id, updateCategoryDto);
    } catch (e: any) {
      console.error('Error updating category:', e);
      return { error: e.message || 'Unknown error' };
    }
  }

  @Delete('category/:id') // DELETE /api/v1/inventory/category/:id
  async deleteCategory(@Param('id') id: string) {
    return this.inventoryService.deleteCategory(id);
  }
}