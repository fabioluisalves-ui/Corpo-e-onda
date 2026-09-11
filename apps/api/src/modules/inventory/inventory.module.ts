import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { PrismaInventoryRepository } from './prisma-inventory.repository';
import { PrismaService } from '../../common/prisma.service';

@Module({
  controllers: [InventoryController],
  providers: [InventoryService, PrismaInventoryRepository, PrismaService],
  exports: [InventoryService],
})
export class InventoryModule {}
