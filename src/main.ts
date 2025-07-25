import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppConfiguration } from './shared/config';
import { LoggerService } from './core';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  // Use our custom logger
  const loggerService = app.get(LoggerService);
  app.useLogger(loggerService);

  const configService = app.get(ConfigService<AppConfiguration>);
  const appConfig = configService.get<AppConfiguration['app']>('app');
  const port = appConfig?.port ?? 3110;
  const env = appConfig?.env ?? 'development';

  // Setup Swagger API documentation
  const config = new DocumentBuilder()
    .setTitle('XRPL NFT Monitor API')
    .setDescription('Real-time NFT activity monitoring and alert system for the XRP Ledger')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth'
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-Key',
        in: 'header',
        description: 'API key for webhook integrations',
      },
      'API-key'
    )
    .addTag('Authentication', 'User registration, login, and profile management')
    .addTag('Alerts', 'NFT alert configuration and management')
    .addTag('Health', 'System health and monitoring endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`API Documentation available at: http://localhost:${port}/api/docs`);
  logger.log(`Environment: ${env}`);
}

void bootstrap();
