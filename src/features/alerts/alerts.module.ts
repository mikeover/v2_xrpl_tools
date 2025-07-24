import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AlertConfigEntity } from '../../database/entities/alert-config.entity';
import { AlertConfigRepository } from './repositories/alert-config.repository';
import { AlertConfigService } from './services/alert-config.service';
import { AlertMatchingService } from './services/alert-matching.service';
import { AlertConfigController } from './controllers/alert-config.controller';
import { AuthModule } from '../auth/auth.module';
import { LoggerModule } from '../../core/logger/logger.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AlertConfigEntity]),
    AuthModule,
    LoggerModule,
  ],
  controllers: [AlertConfigController],
  providers: [AlertConfigRepository, AlertConfigService, AlertMatchingService],
  exports: [AlertConfigService, AlertMatchingService],
})
export class AlertsModule {}
