import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req, Headers } from '@nestjs/common';
import { KitchenStationsService } from './kitchen-stations.service';
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('kitchen-stations') // /api/v1/kitchen-stations
@UseGuards(JwtAuthGuard)
export class KitchenStationsController {
  constructor(private readonly kitchenStationsService: KitchenStationsService) {}

  @Post()
  create(
    @Body() createDto: CreateKitchenStationDto,
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || (createDto as any)?.restaurantId || null;
    return this.kitchenStationsService.create(createDto, restaurantId, req.user);
  }

  @Get()
  findAll(
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.kitchenStationsService.findAll(restaurantId, req.user);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateKitchenStationDto,
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.kitchenStationsService.update(id, updateDto, restaurantId, req.user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @Req() req: any,
    @Headers('x-restaurant-id') restHeader?: string
  ) {
    const restaurantId = req.user?.restaurantId || restHeader || null;
    return this.kitchenStationsService.remove(id, restaurantId, req.user);
  }
}

