import { Controller, Get, Post, Body, Patch, Param, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { PlansService, CreatePlanDto, UpdatePlanDto } from './plans.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('saas/plans')
@UseGuards(JwtAuthGuard)
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  private verifySuperAdmin(req: any) {
    if (req.user?.role !== 'SUPER_ADMIN') {
      throw new UnauthorizedException('Acceso denegado: Se requiere rol SUPER_ADMIN');
    }
  }

  @Get()
  findAll(@Req() req: Record<string, any>) {
    this.verifySuperAdmin(req);
    return this.plansService.findAll();
  }

  @Get(':id')
  findOne(@Req() req: Record<string, any>, @Param('id') id: string) {
    this.verifySuperAdmin(req);
    return this.plansService.findOne(id);
  }

  @Post()
  create(@Req() req: Record<string, any>, @Body() dto: CreatePlanDto) {
    this.verifySuperAdmin(req);
    return this.plansService.create(dto);
  }

  @Patch(':id')
  update(@Req() req: Record<string, any>, @Param('id') id: string, @Body() dto: UpdatePlanDto) {
    this.verifySuperAdmin(req);
    return this.plansService.update(id, dto);
  }

  @Patch(':id/status')
  toggleStatus(@Req() req: Record<string, any>, @Param('id') id: string, @Body() body: { isActive: boolean }) {
    this.verifySuperAdmin(req);
    return this.plansService.toggleStatus(id, body.isActive);
  }
}
