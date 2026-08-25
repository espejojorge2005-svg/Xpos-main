import { Controller, Get, Post, Body, Patch, Param } from '@nestjs/common';
import { PlansService, CreatePlanDto, UpdatePlanDto } from './plans.service';

@Controller('saas/plans')
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  @Get()
  findAll() {
    return this.plansService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.plansService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Patch(':id/status')
  toggleStatus(@Param('id') id: string, @Body() body: { isActive: boolean }) {
    return this.plansService.toggleStatus(id, body.isActive);
  }
}
