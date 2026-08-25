import { IsString, IsNumber, IsInt, Min, IsNotEmpty, IsUUID, IsOptional, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class ModifierOptionDto {
  @IsUUID()
  @IsNotEmpty()
  targetProductId: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  priceOverride?: number;
}

export class ModifierGroupDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(0)
  minSelect: number;

  @IsInt()
  @Min(1)
  maxSelect: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionDto)
  options: ModifierOptionDto[];
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsUUID()
  @IsNotEmpty()
  categoryId: string;

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  stationIds?: string[];

  @IsNumber()
  @Min(0)
  price: number;

  @IsInt()
  @Min(0)
  stock: number;

  @IsInt()
  @Min(0)
  minStock: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierGroupDto)
  modifierGroups?: ModifierGroupDto[];
}