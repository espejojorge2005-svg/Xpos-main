import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto, LoginPinDto } from './dto/login.dto';

@Controller('auth') // Rutas: /api/v1/auth/...
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('login/pin')
  async loginPin(@Body() loginPinDto: LoginPinDto) {
    return this.authService.loginPin(loginPinDto);
  }

  @Get('restaurant/:restaurantId/staff')
  async getStaff(@Param('restaurantId') restaurantId: string) {
    return this.authService.getStaffByRestaurant(restaurantId);
  }
}