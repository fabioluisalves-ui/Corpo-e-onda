import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));

  // CORS com allowlist a partir de variável de ambiente
  const origins = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map(s => s.trim());
  app.enableCors({ origin: origins, credentials: true });

  const config = new DocumentBuilder()
    .setTitle('Corpo & Onda Estoque — API')
    .setDescription('API REST de controle de estoque por variante')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const doc = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, doc);

  const port = Number(process.env.PORT) || 3333;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API em http://localhost:${port}/api  •  Swagger em /api/docs`);
}
bootstrap();
