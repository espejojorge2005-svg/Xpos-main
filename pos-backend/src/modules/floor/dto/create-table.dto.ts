import { IsInt, IsNotEmpty, IsNumber, IsOptional, IsUUID, Min, IsString } from 'class-validator';

export class CreateTableDto {
  @IsUUID('all', { message: 'El ID de la zona debe ser un UUID válido' })
  @IsNotEmpty()
  zoneId: string;

  // Cambiado de Int a String para permitir mesas "A1", "T1", etc.
  @IsString()
  @IsNotEmpty()
  number: string;

  @IsInt()
  @Min(1, { message: 'La capacidad debe ser de al menos 1 persona' })
  capacity: number;

  @IsNumber()
  @IsOptional()
  posX?: number;

  @IsNumber()
  @IsOptional()
  posY?: number;
}