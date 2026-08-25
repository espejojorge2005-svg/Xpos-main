import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsUUID, Min } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

export class CreatePaymentDto {
  @IsUUID('all')
  @IsNotEmpty()
  orderId: string;

  @IsNumber()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  tipAmount?: number;
  @IsOptional()
  itemIds?: string[];

  @IsEnum(PaymentMethod, { message: 'Método no válido. Usa CASH, CARD o TRANSFER' })
  paymentMethod: PaymentMethod;
}