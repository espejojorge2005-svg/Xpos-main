import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateKitchenStationDto {
  @IsNotEmpty()
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  colorHex?: string;

  @IsOptional()
  printerName?: string | null;
}
