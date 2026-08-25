import { Controller, Post, Body, Get, Patch, Delete, Param, UseGuards } from '@nestjs/common';
import { FloorService } from './floor.service';
import { CreateZoneDto } from './dto/create-zone.dto';
import { UpdateZoneDto } from './dto/update-zone.dto';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard'; 

@UseGuards(JwtAuthGuard)
@Controller('floor') 
export class FloorController {
  constructor(private readonly floorService: FloorService) {}

  @Post('zone') 
  async createZone(@Body() createZoneDto: CreateZoneDto) {
    return this.floorService.createZone(createZoneDto);
  }

  @Patch('zone/:id')
  async updateZone(@Param('id') id: string, @Body() updateZoneDto: UpdateZoneDto) {
    try {
      return await this.floorService.updateZone(id, updateZoneDto);
    } catch (e: any) {
      console.error(`Error updating zone ${id}:`, e);
      return { error: e.message, stack: e.stack };
    }
  }

  @Delete('zone/:id')
  async deleteZone(@Param('id') id: string) {
    return this.floorService.deleteZone(id);
  }

  @Post('table') 
  async createTable(@Body() createTableDto: CreateTableDto) {
    return this.floorService.createTable(createTableDto);
  }

  @Patch('table/:id')
  async updateTable(@Param('id') id: string, @Body() updateTableDto: UpdateTableDto) {
    try {
      return await this.floorService.updateTable(id, updateTableDto);
    } catch (e: any) {
      console.error(`Error updating table ${id}:`, e);
      return { error: e.message, stack: e.stack };
    }
  }

  @Delete('table/:id')
  async deleteTable(@Param('id') id: string) {
    return this.floorService.deleteTable(id);
  }

  @Get('zones') 
  async getZones() {
    return this.floorService.findAllZones();
  }
}