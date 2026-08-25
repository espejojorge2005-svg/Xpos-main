import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  @Min(0)
  stockQuantity: number;

  @IsString()
  @IsNotEmpty()
  unitOfMeasure: string; // Ej: 'KG', 'LTS', 'UND'
}