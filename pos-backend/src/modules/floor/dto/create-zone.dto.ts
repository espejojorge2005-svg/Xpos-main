import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateZoneDto {
  @IsString({ message: 'El nombre de la zona debe ser un texto válido' })
  @IsNotEmpty({ message: 'El nombre de la zona es obligatorio' })
  name: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}