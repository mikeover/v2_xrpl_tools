import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { HealthCheckError, HealthIndicator, HealthIndicatorResult } from '@nestjs/terminus';
import { LoggerService } from '../../../core/logger/logger.service';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly logger: LoggerService,
  ) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const startTime = Date.now();
    try {
      // Test write
      const testKey = `health:check:${Date.now()}`;
      const testValue = { timestamp: new Date().toISOString(), random: Math.random() };
      await this.cacheManager.set(testKey, testValue, 10000); // 10 second TTL

      // Test read
      const retrieved = await this.cacheManager.get(testKey);
      if (!retrieved) {
        throw new Error('Failed to retrieve test value from Redis');
      }

      // Test delete
      await this.cacheManager.del(testKey);

      const responseTime = Date.now() - startTime;

      return this.getStatus(key, true, {
        status: 'healthy',
        responseTime: `${responseTime}ms`,
        message: 'Redis is operational',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Redis health check failed';
      this.logger.error('Redis health check failed', error instanceof Error ? error.message : String(error));

      throw new HealthCheckError(
        'Redis health check failed',
        this.getStatus(key, false, {
          status: 'unhealthy',
          error: errorMessage,
          responseTime: `${Date.now() - startTime}ms`,
        }),
      );
    }
  }

  /**
   * Get Redis connection info
   */
  async getConnectionInfo(): Promise<any> {
    try {
      // This would require direct Redis client access for INFO command
      // For now, return basic info
      return {
        connected: true,
        keyPrefix: 'xrpl:',
        // Additional info would come from Redis INFO command
      };
    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Connection error',
      };
    }
  }

  /**
   * Get Redis memory usage
   */
  async getMemoryInfo(): Promise<any> {
    try {
      // This would require direct Redis client access for MEMORY command
      // For now, return placeholder
      return {
        used_memory: 'N/A',
        used_memory_peak: 'N/A',
        // Additional memory stats would come from Redis
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : 'Memory info error',
      };
    }
  }
}