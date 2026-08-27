import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  getAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.analyticsService.getAnalytics(from, to);
  }
}

