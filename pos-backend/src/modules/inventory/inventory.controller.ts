import { Controller, Post, Body, Get, Patch, Delete, Param, Req, Headers } from '@nestjs/common';
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
  async createCategory(
    @Body() createCategoryDto: CreateCategoryDto,
    @Req() req?: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req?.user?.restaurantId || restHeader || (createCategoryDto as any)?.restaurantId || null;
    return this.inventoryService.createCategory(createCategoryDto, restaurantId);
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
  async getCategories(
    @Req() req?: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    try {
      const restaurantId = req?.user?.restaurantId || restHeader || null;
      return await this.inventoryService.findAllCategories(restaurantId);
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