import { IsOptional, IsString } from 'class-validator';

export class UpdateRestaurantConfigDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  slogan?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  ruc?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
