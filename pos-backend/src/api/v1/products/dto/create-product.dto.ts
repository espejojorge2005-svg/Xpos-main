import { IsString, IsNumber, Min, IsNotEmpty, IsOptional, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class ModifierOptionDto {
  @IsString()
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

  @IsOptional()
  @IsNumber()
  @Min(0)
  minSelect?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxSelect?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierOptionDto)
  options?: ModifierOptionDto[];
}

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsArray()
  stationIds?: string[];

  @IsNumber()
  @Min(0)
  price: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierGroupDto)
  modifierGroups?: ModifierGroupDto[];

  @IsOptional()
  @IsString()
  restaurantId?: string;
}