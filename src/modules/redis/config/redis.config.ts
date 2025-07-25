import { ConfigService } from '@nestjs/config';
import { RedisConfig, RedisClusterConfig } from '../interfaces/redis.interface';
import { AppConfiguration } from '../../../shared/config';

export const getRedisConfig = (
  configService: ConfigService<AppConfiguration>,
): RedisConfig | RedisClusterConfig => {
  const redisConfig = configService.get<AppConfiguration['redis']>('redis');
  
  if (!redisConfig) {
    // Default standalone Redis configuration
    return {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'xrpl:',
      ttl: 3600, // 1 hour default
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      showFriendlyErrorStack: process.env['NODE_ENV'] !== 'production',
    };
  }

  // Check if cluster mode is enabled
  if (redisConfig.cluster?.enabled && redisConfig.cluster.nodes) {
    return {
      nodes: redisConfig.cluster.nodes,
      options: {
        redisOptions: redisConfig.password 
          ? { password: redisConfig.password }
          : {},
        clusterRetryStrategy: (times: number) => {
          if (times > 3) return null;
          return Math.min(times * 100, 3000);
        },
        enableReadyCheck: true,
        scaleReads: 'slave',
      },
    };
  }

  // Standalone Redis configuration
  const config: RedisConfig = {
    host: redisConfig.host || 'localhost',
    port: redisConfig.port || 6379,
    db: redisConfig.db || 0,
    keyPrefix: redisConfig.keyPrefix || 'xrpl:',
    ttl: redisConfig.ttl || 3600,
    maxRetriesPerRequest: redisConfig.maxRetriesPerRequest || 3,
    enableReadyCheck: true,
    showFriendlyErrorStack: process.env['NODE_ENV'] !== 'production',
  };

  if (redisConfig.password) {
    config.password = redisConfig.password;
  }

  return config;
};

export const getCacheManagerConfig = (
  redisConfig: RedisConfig | RedisClusterConfig,
) => {
  // Check if it's a cluster configuration
  if ('nodes' in redisConfig) {
    return {
      store: require('cache-manager-ioredis'),
      clusterConfig: {
        nodes: redisConfig.nodes,
        options: redisConfig.options,
      },
      ttl: 3600, // Default 1 hour
    };
  }

  // Standalone configuration
  return {
    store: require('cache-manager-ioredis'),
    host: redisConfig.host,
    port: redisConfig.port,
    password: redisConfig.password,
    db: redisConfig.db,
    keyPrefix: redisConfig.keyPrefix,
    ttl: redisConfig.ttl || 3600,
    max: 1000, // Max number of items in cache
  };
};