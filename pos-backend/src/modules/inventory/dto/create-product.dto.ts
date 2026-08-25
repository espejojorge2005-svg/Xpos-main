import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @IsUUID('all', { message: 'El ID de la categoría debe ser un UUID válido' })
  @IsNotEmpty()
  categoryId: string;

  @IsString({ message: 'El nombre del producto debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre es obligatorio' })
  name: string;

  @IsNumber({}, { message: 'El precio debe ser un número' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  price: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString({ each: true })
  @IsOptional()
  stationIds?: string[];
}