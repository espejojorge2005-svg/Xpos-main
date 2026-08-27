import { Controller, Post, Body, Get, Patch, Delete, Param, UseGuards, Req } from '@nestjs/common';
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
  async createZone(@Req() req: any, @Body() createZoneDto: CreateZoneDto) {
    try {
      return await this.floorService.createZone(createZoneDto, req.user);
    } catch (e: any) {
      console.error('Error creating zone:', e);
      throw e;
    }
  }

  @Patch('zone/:id')
  async updateZone(@Req() req: any, @Param('id') id: string, @Body() updateZoneDto: UpdateZoneDto) {
    try {
      return await this.floorService.updateZone(id, updateZoneDto, req.user);
    } catch (e: any) {
      console.error(`Error updating zone ${id}:`, e);
      throw e;
    }
  }

  @Delete('zone/:id')
  async deleteZone(@Req() req: any, @Param('id') id: string) {
    try {
      return await this.floorService.deleteZone(id, req.user);
    } catch (e: any) {
      console.error(`Error deleting zone ${id}:`, e);
      throw e;
    }
  }

  @Post('table') 
  async createTable(@Req() req: any, @Body() createTableDto: CreateTableDto) {
    try {
      return await this.floorService.createTable(createTableDto, req.user);
    } catch (e: any) {
      console.error('Error creating table:', e);
      throw e;
    }
  }

  @Patch('table/:id')
  async updateTable(@Req() req: any, @Param('id') id: string, @Body() updateTableDto: UpdateTableDto) {
    try {
      return await this.floorService.updateTable(id, updateTableDto, req.user);
    } catch (e: any) {
      console.error(`Error updating table ${id}:`, e);
      throw e;
    }
  }

  @Delete('table/:id')
  async deleteTable(@Req() req: any, @Param('id') id: string) {
    try {
      return await this.floorService.deleteTable(id, req.user);
    } catch (e: any) {
      console.error(`Error deleting table ${id}:`, e);
      throw e;
    }
  }

  @Get('zones') 
  async getZones(@Req() req: any) {
    try {
      return await this.floorService.findAllZones(req.user);
    } catch (e: any) {
      console.error('Error getting zones:', e);
      throw e;
    }
  }
}