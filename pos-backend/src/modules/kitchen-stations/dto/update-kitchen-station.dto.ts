import { PartialType } from '@nestjs/mapped-types';
import { CreateKitchenStationDto } from './create-kitchen-station.dto';

export class UpdateKitchenStationDto extends PartialType(CreateKitchenStationDto) {}
