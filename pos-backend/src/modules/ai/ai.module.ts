import { Module } from '@nestjs/common';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { AiAnalyticsService } from './services/ai-analytics.service';
import { AiForecastService } from './services/ai-forecast.service';
import { AiLlmService } from './services/ai-llm.service';
import { AiTemplateService } from './services/ai-template.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [
    AiService,
    AiAnalyticsService,
    AiForecastService,
    AiLlmService,
    AiTemplateService,
  ],
  exports: [AiService, AiAnalyticsService, AiForecastService],
})
export class AiModule {}
