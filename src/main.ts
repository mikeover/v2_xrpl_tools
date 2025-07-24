import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
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
  
  await app.listen(port);
  
  const logger = new Logger('Bootstrap');
  logger.log(`Application is running on: http://localhost:${port}`);
  logger.log(`Environment: ${env}`);
}

void bootstrap();
