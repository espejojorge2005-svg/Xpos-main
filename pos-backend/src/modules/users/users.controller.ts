import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, Headers } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

function isAdmin(req: any) {
  return req.user?.role === 'ADMIN' || req.user?.role === 'SUPER_ADMIN';
}

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.usersService.findAll(req.user, restaurantId);
  }

  @Post()
  create(
    @Req() req: any, 
    @Body() dto: CreateUserDto,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.usersService.create(dto, req.user, restaurantId);
  }

  @Patch(':id')
  update(
    @Req() req: any, 
    @Param('id') id: string, 
    @Body() dto: UpdateUserDto,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    if (!isAdmin(req)) return { error: 'Acceso denegado' };
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    if (!isAdmin(req)) return { error: 'Acceso denegado' };
    return this.usersService.remove(id);
  }


  @Patch('profile/superadmin')
  updateProfile(@Req() req: any, @Body() dto: { email?: string; password?: string }) {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return { error: 'Acceso denegado: Se requiere rol SUPER_ADMIN' };
    }
    return this.usersService.updateProfile(req.user.userId, dto);
  }
}
