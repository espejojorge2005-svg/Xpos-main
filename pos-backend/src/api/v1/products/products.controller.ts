import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Headers } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { JwtAuthGuard } from '../../../modules/auth/jwt-auth.guard'; 

@Controller('products')
@UseGuards(JwtAuthGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() createProductDto: CreateProductDto,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.create(createProductDto, req.user, restaurantId);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.findAll(req.user, restaurantId);
  }

  @Get('kardex')
  getKardex(
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.getKardex(7, req.user, restaurantId);
  }

  @Get(':id')
  findOne(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.findOne(id, req.user, restaurantId);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    try {
      const restaurantId = req.user?.restaurantId || restHeader || null;
      return await this.productsService.update(id, updateProductDto, req.user, restaurantId);
    } catch (e: any) {
      console.error(`Error updating product ${id}:`, e);
      return { error: e.message, stack: e.stack };
    }
  }

  @Delete(':id')
  remove(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.remove(id, req.user, restaurantId);
  }

  @Patch(':id/stock')
  async adjustStock(
    @Req() req: any,
    @Param('id') id: string,
    @Body() adjustStockDto: AdjustStockDto,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.adjustStock(id, adjustStockDto.delta, adjustStockDto.reason, req.user, restaurantId);
  }

  @Get(':id/stock-history')
  async getStockHistory(
    @Req() req: any,
    @Param('id') id: string,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.productsService.getStockHistory(id, 7, req.user, restaurantId);
  }
}