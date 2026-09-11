import { Module } from '@nestjs/common';
import { NuvemshopController } from './nuvemshop.controller';
import { NuvemshopService } from './nuvemshop.service';
import { PrismaService } from '../../common/prisma.service';

@Module({ controllers: [NuvemshopController], providers: [NuvemshopService, PrismaService] })
export class NuvemshopModule {}
