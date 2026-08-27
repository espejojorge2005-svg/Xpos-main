import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RestaurantConfigService } from './restaurant-config.service';
import { UpdateRestaurantConfigDto } from './dto/update-restaurant-config.dto';

@Controller('restaurant-config')
export class RestaurantConfigController {
  constructor(private readonly service: RestaurantConfigService) {}

  /** GET /api/v1/restaurant-config */
  @Get()
  @UseGuards(JwtAuthGuard)
  getConfig() {
    return this.service.getConfig();
  }

  /** PATCH /api/v1/restaurant-config — protected */
  @Patch()
  @UseGuards(JwtAuthGuard)
  updateConfig(@Body() dto: UpdateRestaurantConfigDto) {
    return this.service.updateConfig(dto);
  }
}

