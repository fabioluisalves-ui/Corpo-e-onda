import { Module } from '@nestjs/common';
import { LabelsController } from './labels.controller';
import { PrismaService } from '../../common/prisma.service';

@Module({ controllers: [LabelsController], providers: [PrismaService] })
export class BarcodesModule {}
