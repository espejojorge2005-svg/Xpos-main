import { Module } from '@nestjs/common';
import { KitchenStationsService } from './kitchen-stations.service';
import { KitchenStationsController } from './kitchen-stations.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [KitchenStationsController],
  providers: [KitchenStationsService],
  exports: [KitchenStationsService]
})
export class KitchenStationsModule {}
