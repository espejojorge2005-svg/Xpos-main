import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class ServeOrderDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  itemIds?: string[];
}

@Controller('orders') // Ruta base: /api/v1/orders
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post() // POST /api/v1/orders
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    return this.ordersService.createOrder(createOrderDto);
  }

  @Get('kitchen')
  getKitchenOrders() {
    return this.ordersService.getKitchenOrders();
  }

  @Get('table/:tableId/active') // GET /api/v1/orders/table/:tableId/active
  async getActiveOrderForTable(@Param('tableId') tableId: string) {
    return this.ordersService.getOpenOrderForTable(tableId);
  }

  @Post(':orderId/items') // POST /api/v1/orders/:orderId/items
  async addItemsToOrder(
    @Param('orderId') orderId: string,
    @Body() data: { items: any[] }
  ) {
    return this.ordersService.addItemsToOrder(orderId, data);
  }

  @Delete(':orderId') // DELETE /api/v1/orders/:orderId
  async cancelOrder(
    @Param('orderId') orderId: string
  ) {
    return this.ordersService.cancelOrder(orderId);
  }

  @Patch(':orderId/table') // PATCH /api/v1/orders/:orderId/table
  async changeTable(
    @Param('orderId') orderId: string,
    @Body('newTableId') newTableId: string
  ) {
    return this.ordersService.changeTable(orderId, newTableId);
  }

  @Delete(':orderId/items/:itemId') // DELETE /api/v1/orders/:orderId/items/:itemId
  async removeOrderItem(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string
  ) {
    return this.ordersService.removeOrderItem(orderId, itemId);
  }

  @Patch(':orderId/items/:itemId/notes') // PATCH /api/v1/orders/:orderId/items/:itemId/notes
  async updateItemNotes(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string,
    @Body('notes') notes: string
  ) {
    const realOrderId = orderId.split('-adic-')[0]; // En caso llegue un ID de ticket sub-dividido
    return this.ordersService.updateItemNotes(realOrderId, itemId, notes);
  }

  @Patch(':orderId/items/:itemId/serve') // PATCH /api/v1/orders/:orderId/items/:itemId/serve
  async markItemAsServed(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string
  ) {
    const realOrderId = orderId.split('-adic-')[0];
    return this.ordersService.markItemAsServed(realOrderId, itemId);
  }

  @Patch(':orderId/items/:itemId/unserve') // PATCH /api/v1/orders/:orderId/items/:itemId/unserve
  async unmarkItemAsServed(
    @Param('orderId') orderId: string,
    @Param('itemId') itemId: string
  ) {
    const realOrderId = orderId.split('-adic-')[0];
    return this.ordersService.markItemAsActive(realOrderId, itemId);
  }

  @Patch(':orderId/serve') // PATCH /api/v1/orders/:orderId/serve
  async markOrderAsServed(
    @Param('orderId') orderId: string,
    @Body() data: ServeOrderDto
  ) {
    const realOrderId = orderId.split('-adic-')[0];
    return this.ordersService.markOrderAsServed(realOrderId, data?.itemIds);
  }
}