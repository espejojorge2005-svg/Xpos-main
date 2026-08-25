import { IsNotEmpty, IsNumber, IsUUID, Min } from 'class-validator';

export class CreateRecipeItemDto {
  @IsUUID('all')
  @IsNotEmpty()
  productId: string;

  @IsUUID('all')
  @IsNotEmpty()
  inventoryItemId: string;

  @IsNumber()
  @Min(0.001)
  quantityRequired: number; // Cuánto se gasta de este ingrediente por cada plato
}