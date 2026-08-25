import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Debe ser un correo válido' })
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class LoginPinDto {
  @IsString()
  @IsNotEmpty()
  pin: string;

  @IsString()
  @IsNotEmpty()
  restaurantId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}