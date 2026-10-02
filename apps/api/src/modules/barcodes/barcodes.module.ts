import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LabelsController } from './labels.controller';
import { PrismaService } from '../../common/prisma.service';

@Module({ imports: [AuthModule], controllers: [LabelsController], providers: [PrismaService] })
export class BarcodesModule {}
