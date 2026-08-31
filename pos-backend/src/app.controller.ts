import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getStatus() {
    return {
      status: 'online',
      message: '🚀 Xpos Backend API is running successfully!',
      prefix: '/api/v1',
      documentation: '/api/v1',
      timestamp: new Date().toISOString()
    };
  }
}
