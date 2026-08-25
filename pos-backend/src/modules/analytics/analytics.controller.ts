import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AnalyticsService } from './analytics.service';

@Controller('analytics')
@UseGuards(AuthGuard('jwt'))
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get()
  getAnalytics(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    const fromDate = from ? new Date(from) : new Date(now.toISOString().slice(0, 10)); // default: today
    const toDate   = to   ? new Date(to)   : new Date(now.toISOString().slice(0, 10));
    return this.analyticsService.getAnalytics(fromDate, toDate);
  }
}
