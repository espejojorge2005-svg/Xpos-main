import { Controller, Get, Post, Patch, Body, Param, UseGuards, UnauthorizedException, Req } from '@nestjs/common';
import { SaasService, CreateRestaurantSaaS, UpdateRestaurantSaaS, UpdateAdminSaaS } from './saas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('saas')
@UseGuards(JwtAuthGuard)
export class SaasController {
  constructor(private readonly saasService: SaasService) {}

  private verifySuperAdmin(req: any) {
    if (req.user?.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedException('Acceso denegado: Se requiere rol SUPER_ADMIN');
    }
  }

  @Get('restaurants')
  async findAll(@Req() req: Record<string, any>) {
    this.verifySuperAdmin(req);
    return this.saasService.findAllRestaurants();
  }

  @Post('restaurants')
  async createRestaurant(@Req() req: Record<string, any>, @Body() body: CreateRestaurantSaaS) {
    this.verifySuperAdmin(req);
    return this.saasService.createRestaurant(body);
  }

  @Post('restaurants/:id/admins')
  async createAdmin(@Req() req: Record<string, any>, @Param('id') id: string, @Body() body: any) {
    this.verifySuperAdmin(req);
    return this.saasService.createAdminForRestaurant(id, {
      name: body.name,
      email: body.email,
      password: body.password
    });
  }

  @Patch('restaurants/:id/status')
  async toggleStatus(@Req() req: Record<string, any>, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    this.verifySuperAdmin(req);
    return this.saasService.toggleRestaurantStatus(id, body.isActive);
  }

  @Get('restaurants/:id/admin')
  async getAdmin(@Req() req: Record<string, any>, @Param('id') id: string) {
    this.verifySuperAdmin(req);
    return this.saasService.getRestaurantAdmin(id);
  }

  @Patch('restaurants/:id/admin')
  async updateAdmin(@Req() req: Record<string, any>, @Param('id') id: string, @Body() body: UpdateAdminSaaS) {
    this.verifySuperAdmin(req);
    return this.saasService.updateRestaurantAdmin(id, body);
  }

  @Patch('restaurants/:id/renew')
  async renewSubscription(@Req() req: Record<string, any>, @Param('id') id: string, @Body() body: { days: number }) {
    this.verifySuperAdmin(req);
    return this.saasService.renewSubscription(id, body.days);
  }

  @Patch('restaurants/:id')
  async updateRestaurant(@Req() req: Record<string, any>, @Param('id') id: string, @Body() body: UpdateRestaurantSaaS) {
    this.verifySuperAdmin(req);
    return this.saasService.updateRestaurant(id, body);
  }
}
