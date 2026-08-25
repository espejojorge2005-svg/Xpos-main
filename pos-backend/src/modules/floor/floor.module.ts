import { Module } from '@nestjs/common';
import { FloorController } from './floor.controller';
import { FloorService } from './floor.service';

@Module({
  controllers: [FloorController],
  providers: [FloorService],
})
export class FloorModule {}