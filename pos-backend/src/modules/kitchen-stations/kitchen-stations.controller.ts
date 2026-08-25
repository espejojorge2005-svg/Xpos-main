import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { KitchenStationsService } from './kitchen-stations.service';
import { CreateKitchenStationDto } from './dto/create-kitchen-station.dto';
import { UpdateKitchenStationDto } from './dto/update-kitchen-station.dto';

@Controller('kitchen-stations') // /api/v1/kitchen-stations
export class KitchenStationsController {
  constructor(private readonly kitchenStationsService: KitchenStationsService) {}

  @Post()
  create(@Body() createDto: CreateKitchenStationDto) {
    return this.kitchenStationsService.create(createDto);
  }

  @Get()
  findAll() {
    return this.kitchenStationsService.findAll();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateKitchenStationDto) {
    return this.kitchenStationsService.update(id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.kitchenStationsService.remove(id);
  }
}
