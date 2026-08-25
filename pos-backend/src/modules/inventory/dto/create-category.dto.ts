import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCategoryDto {
  @IsString({ message: 'El nombre debe ser un texto' })
  @IsNotEmpty({ message: 'El nombre de la categoría es obligatorio' })
  name: string;
}