import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { PrismaService } from '../../common/prisma.service';

@Module({ imports: [AuthModule], controllers: [CatalogController], providers: [CatalogService, PrismaService] })
export class CatalogModule {}
