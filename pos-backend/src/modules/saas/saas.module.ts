import { Module } from '@nestjs/common';
import { SaasController } from './saas.controller';
import { SaasService } from './saas.service';
import { PlansController } from './plans.controller';
import { PlansService } from './plans.service';

@Module({
  controllers: [SaasController, PlansController],
  providers: [SaasService, PlansService]
})
export class SaasModule {}
