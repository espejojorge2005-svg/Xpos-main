import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';

export class CreateUserDto {
  @IsString()
  name: string;

  @IsString()
  email: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  role?: 'ADMIN' | 'CASHIER' | 'WAITER';

  @IsOptional()
  @IsArray()
  allowedViews?: string[];
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;

  @IsOptional()
  @IsString()
  pin?: string;

  @IsOptional()
  @IsString()
  role?: 'ADMIN' | 'CASHIER' | 'WAITER';

  @IsOptional()
  @IsArray()
  allowedViews?: string[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
