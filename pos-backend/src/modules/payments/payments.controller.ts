import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Controller('payments') // Ruta base: /api/v1/payments
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.processPayment(createPaymentDto);
  }

  // NUEVO ENDPOINT PARA EL CIERRE DE CAJA
  @Get('closure')
  async getDailyClosure(@Query('date') date?: string) {
    // Se puede llamar como: GET /api/v1/payments/closure?date=2026-03-18
    return this.paymentsService.getDailyClosure(date);
  }

  @Patch(':id')
  updatePayment(
    @Param('id') id: string,
    @Body() body: { amount: number; tipAmount: number; paymentMethod: any }
  ) {
    return this.paymentsService.updatePayment(id, body);
  }

  @Delete(':id')
  deletePayment(@Param('id') id: string) {
    return this.paymentsService.deletePayment(id);
  }
}