import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested } from 'class-validator';

export class CreateOrderItemDto {
  @IsUUID('all')
  @IsNotEmpty()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsNumber()
  @Min(0)
  unitPrice: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  subItems?: CreateOrderItemDto[];
}

export class CreateOrderDto {
  @IsOptional()
  @IsUUID('all')
  tableId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto) // Esto le dice a NestJS que valide cada objeto del arreglo con la clase de arriba
  items: CreateOrderItemDto[];
}