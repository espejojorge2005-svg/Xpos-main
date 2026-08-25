import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
// IMPORTANTE: Asegúrate de importar tu guardia real aquí. Puede llamarse JwtAuthGuard o similar dependiendo de cómo lo creaste.
import { AuthGuard } from '@nestjs/passport'; 

@Controller('products') // Se usa global prefix 'api/v1' en main.ts, así que la ruta final será /api/v1/products
@UseGuards(AuthGuard('jwt')) // Protegemos todas las rutas del inventario
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  create(@Body() createProductDto: CreateProductDto) {
    return this.productsService.create(createProductDto);
  }

  @Get()
  findAll() {
    return this.productsService.findAll();
  }

  @Get('kardex')
  getKardex() {
    return this.productsService.getKardex();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateProductDto: UpdateProductDto) {
    try {
      return await this.productsService.update(id, updateProductDto);
    } catch (e: any) {
      console.error(`Error updating product ${id}:`, e);
      return { error: e.message, stack: e.stack };
    }
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Patch(':id/stock')
  async adjustStock(
    @Param('id') id: string,
    @Body() body: { delta: number; reason?: string }
  ) {
    return this.productsService.adjustStock(id, body.delta, body.reason);
  }

  @Get(':id/stock-history')
  async getStockHistory(@Param('id') id: string) {
    return this.productsService.getStockHistory(id);
  }
}