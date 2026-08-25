import { Module } from '@nestjs/common';
import { RestaurantConfigController } from './restaurant-config.controller';
import { RestaurantConfigService } from './restaurant-config.service';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RestaurantConfigController],
  providers: [RestaurantConfigService],
})
export class RestaurantConfigModule {}
