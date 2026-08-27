import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
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
  create(@Req() req: any, @Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto, req.user);
  }

  @Get()
  findAll(@Req() req: any) {
    return this.productsService.findAll(req.user);
  }

  @Get('kardex')
  getKardex(@Req() req: any) {
    return this.productsService.getKardex(7, req.user);
  }

  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.productsService.findOne(id, req.user);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    try {
      return await this.productsService.update(id, updateProductDto, req.user);
    } catch (e: any) {
      console.error(`Error updating product ${id}:`, e);
      return { error: e.message, stack: e.stack };
    }
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.productsService.remove(id, req.user);
  }

  @Patch(':id/stock')
  async adjustStock(
    @Req() req: any,
    @Param('id') id: string,
    @Body() adjustStockDto: AdjustStockDto
  ) {
    return this.productsService.adjustStock(id, adjustStockDto.delta, adjustStockDto.reason, req.user);
  }

  @Get(':id/stock-history')
  async getStockHistory(@Req() req: any, @Param('id') id: string) {
    return this.productsService.getStockHistory(id, 7, req.user);
  }
}