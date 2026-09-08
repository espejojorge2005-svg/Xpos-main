import { Controller, Get, Query, UseGuards, Req, Headers } from '@nestjs/common';
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
    @Query('timezone') timezoneQuery?: string,
    @Headers('x-timezone') tzHeader?: string,
    @Req() req?: any,
    @Headers('x-restaurant-id') restHeader?: string,
  ) {
    const restaurantId = req?.user?.restaurantId || restHeader || null;
    const clientTimezone = tzHeader || timezoneQuery || 'America/Lima';
    return this.analyticsService.getAnalytics(from, to, restaurantId, clientTimezone);
  }
}

