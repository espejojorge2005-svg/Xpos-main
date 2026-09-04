import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { SaasService, CreateRestaurantSaaS, UpdateRestaurantSaaS, UpdateAdminSaaS, RenewSubscriptionDto } from './saas.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SuperAdminGuard } from '../auth/super-admin.guard';

@Controller('saas')
@UseGuards(JwtAuthGuard, SuperAdminGuard)
export class SaasController {
  constructor(private readonly saasService: SaasService) {}

  @Get('restaurants')
  async findAll() {
    return this.saasService.findAllRestaurants();
  }

  @Post('restaurants')
  async createRestaurant(@Body() body: CreateRestaurantSaaS) {
    return this.saasService.createRestaurant(body);
  }

  @Post('restaurants/:id/admins')
  async createAdmin(@Param('id') id: string, @Body() body: any) {
    return this.saasService.createAdminForRestaurant(id, {
      name: body.name,
      email: body.email,
      password: body.password
    });
  }

  @Patch('restaurants/:id/status')
  async toggleStatus(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.saasService.toggleRestaurantStatus(id, body.isActive);
  }

  @Get('restaurants/:id/admin')
  async getAdmin(@Param('id') id: string) {
    return this.saasService.getRestaurantAdmin(id);
  }

  @Patch('restaurants/:id/admin')
  async updateAdmin(@Param('id') id: string, @Body() body: UpdateAdminSaaS) {
    return this.saasService.updateRestaurantAdmin(id, body);
  }

  @Patch('restaurants/:id/renew')
  async renewSubscription(@Param('id') id: string, @Body() body: RenewSubscriptionDto) {
    return this.saasService.renewSubscription(id, Number(body.days));
  }

  @Patch('restaurants/:id')
  async updateRestaurant(@Param('id') id: string, @Body() body: UpdateRestaurantSaaS) {
    return this.saasService.updateRestaurant(id, body);
  }

  @Delete('restaurants/:id')
  async deleteRestaurant(@Param('id') id: string) {
    return this.saasService.deleteRestaurant(id);
  }
}
