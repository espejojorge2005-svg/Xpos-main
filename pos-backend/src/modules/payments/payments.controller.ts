import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Query, Req, Headers } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('payments') // Ruta base: /api/v1/payments
@UseGuards(JwtAuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post()
  async createPayment(@Body() createPaymentDto: CreatePaymentDto) {
    return this.paymentsService.processPayment(createPaymentDto);
  }

  // ENDPOINTS PARA CONTROL DE CAJA Y TURNOS
  @Get('shift/current')
  async getCurrentShift(
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    return this.paymentsService.getCurrentShift(req.user, restHeader);
  }

  @Post('shift/open')
  async openShift(
    @Body() body: { openingAmount: number },
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    return this.paymentsService.openShift(body, req.user, restHeader);
  }

  @Post('shift/expense')
  async addExpense(
    @Body() body: { amount: number; description: string },
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    return this.paymentsService.addExpense(body, req.user, restHeader);
  }

  @Post('shift/close')
  async closeShift(
    @Body() body: { closureNote?: string },
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    return this.paymentsService.closeShift(body, req.user, restHeader);
  }

  // ENDPOINT PARA EL CIERRE DE CAJA
  @Get('closure')
  async getDailyClosure(
    @Query('date') date?: string,
    @Req() req?: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    // Se puede llamar como: GET /api/v1/payments/closure?date=2026-03-18
    return this.paymentsService.getDailyClosure(date, req?.user, restHeader);
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