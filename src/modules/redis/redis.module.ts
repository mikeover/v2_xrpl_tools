import { Module, Global, DynamicModule } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RedisCacheService } from './services/redis-cache.service';
import { RedisHealthIndicator } from './services/redis-health.service';
import { CacheWarmingService } from './services/cache-warming.service';
import { getRedisConfig, getCacheManagerConfig } from './config/redis.config';
import { LoggerModule } from '../../core/logger/logger.module';
import { CollectionEntity } from '../../database/entities/collection.entity';
import { AlertConfigEntity } from '../../database/entities/alert-config.entity';
import { AppConfiguration } from '../../shared/config';

@Global()
@Module({})
export class RedisModule {
  static forRootAsync(): DynamicModule {
    return {
      module: RedisModule,
      imports: [
        CacheModule.registerAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: async (configService: ConfigService<AppConfiguration>) => {
            const redisConfig = getRedisConfig(configService);
            return getCacheManagerConfig(redisConfig);
          },
        }),
        LoggerModule,
        ScheduleModule.forRoot(),
        TypeOrmModule.forFeature([CollectionEntity, AlertConfigEntity]),
      ],
      providers: [
        RedisCacheService,
        RedisHealthIndicator,
        CacheWarmingService,
      ],
      exports: [
        RedisCacheService,
        RedisHealthIndicator,
        CacheModule,
      ],
    };
  }
}