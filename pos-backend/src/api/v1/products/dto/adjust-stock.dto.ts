import { IsNumber, IsOptional, IsString } from 'class-validator';

export class AdjustStockDto {
  @IsNumber()
  delta: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
