import { Module } from '@nestjs/common';
import { NuvemshopController } from './nuvemshop.controller';
import { NuvemshopService } from './nuvemshop.service';
import { NuvemshopConfig } from './nuvemshop.config';
import { NuvemshopAdapter } from './nuvemshop.adapter';
import { PrismaService } from '../../common/prisma.service';
import { InventoryModule } from '../inventory/inventory.module';

@Module({
  imports: [InventoryModule], // usa InventoryService para aplicar NUVEMSHOP_SALE / CUSTOMER_RETURN
  controllers: [NuvemshopController],
  providers: [NuvemshopService, NuvemshopConfig, NuvemshopAdapter, PrismaService],
})
export class NuvemshopModule {}
