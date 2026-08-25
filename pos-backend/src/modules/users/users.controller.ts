import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req } from '@nestjs/common';
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
  findAll(@Req() req: any) {
    return this.usersService.findAll(req.user);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.usersService.create(dto, req.user);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    if (!isAdmin(req)) return { error: 'Acceso denegado' };
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  deactivate(@Req() req: any, @Param('id') id: string) {
    if (!isAdmin(req)) return { error: 'Acceso denegado' };
    return this.usersService.deactivate(id);
  }

  @Patch('profile/superadmin')
  updateProfile(@Req() req: any, @Body() dto: { email?: string; password?: string }) {
    if (req.user?.role !== 'SUPER_ADMIN') {
      return { error: 'Acceso denegado: Se requiere rol SUPER_ADMIN' };
    }
    return this.usersService.updateProfile(req.user.userId, dto);
  }
}
