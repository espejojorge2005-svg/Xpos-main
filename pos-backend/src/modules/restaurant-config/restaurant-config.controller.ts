import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RestaurantConfigService } from './restaurant-config.service';
import type { UpdateRestaurantConfigDto } from './restaurant-config.service';

@Controller('restaurant-config')
export class RestaurantConfigController {
  constructor(private readonly service: RestaurantConfigService) {}

  /** GET /api/v1/restaurant-config */
  @Get()
  @UseGuards(AuthGuard('jwt'))
  getConfig() {
    return this.service.getConfig();
  }

  /** PATCH /api/v1/restaurant-config — protected */
  @Patch()
  @UseGuards(AuthGuard('jwt'))
  updateConfig(@Body() dto: UpdateRestaurantConfigDto) {
    return this.service.updateConfig(dto);
  }
}
