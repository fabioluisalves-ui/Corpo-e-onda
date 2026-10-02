import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ReportsController } from './reports.controller';
import { PrismaService } from '../../common/prisma.service';

@Module({ imports: [AuthModule], controllers: [ReportsController], providers: [PrismaService] })
export class ReportsModule {}
