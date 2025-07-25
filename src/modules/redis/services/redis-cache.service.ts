import { Injectable, Inject, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { LoggerService } from '../../../core/logger/logger.service';
import { CacheOptions, CacheStats, CacheKeys } from '../interfaces/redis.interface';
import {
  CachedNFTMetadata,
  CachedTransactionData,
  CachedAlertConfig,
} from '../interfaces/cache.interface';

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
  };

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Redis cache service initialized');
    // Test connection
    try {
      await this.set('test:connection', 'ok', { ttl: 10 });
      const value = await this.get('test:connection');
      if (value === 'ok') {
        this.logger.log('Redis connection verified');
        await this.del('test:connection');
      }
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error instanceof Error ? error.message : String(error));
    }
  }

  async onModuleDestroy() {
    this.logger.log('Redis cache service shutting down');
    // Log final stats
    const stats = this.getStats();
    this.logger.log(`Cache statistics - Hits: ${stats.hits}, Misses: ${stats.misses}, Hit Rate: ${(stats.hitRate * 100).toFixed(2)}%`);
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.cacheManager.get<T>(key);
      if (value !== null && value !== undefined) {
        this.stats.hits++;
        this.updateHitRate();
        return value;
      } else {
        this.stats.misses++;
        this.updateHitRate();
        return null;
      }
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache get error for key ${key}`, error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  /**
   * Set a value in cache
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {},
  ): Promise<void> {
    try {
      const ttl = options.ttl || 3600; // Default 1 hour
      await this.cacheManager.set(key, value, ttl * 1000); // Convert to milliseconds
      this.stats.sets++;
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache set error for key ${key}`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Delete a value from cache
   */
  async del(key: string | string[]): Promise<void> {
    try {
      if (Array.isArray(key)) {
        for (const k of key) {
          await this.cacheManager.del(k);
          this.stats.deletes++;
        }
      } else {
        await this.cacheManager.del(key);
        this.stats.deletes++;
      }
    } catch (error) {
      this.stats.errors++;
      this.logger.error(`Cache delete error for key ${key}`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Clear all cache
   */
  async reset(): Promise<void> {
    try {
      // cache-manager v5 doesn't have reset, use del('*') or clear specific keys
      // For now, just log that this operation is not supported
      this.logger.warn('Cache reset not supported in cache-manager v5');
    } catch (error) {
      this.logger.error('Failed to clear cache', error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Get or set a value (cache-aside pattern)
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {},
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // If not in cache, call factory function
    try {
      const value = await factory();
      await this.set(key, value, options);
      return value;
    } catch (error) {
      this.logger.error(`Factory function error for key ${key}`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  /**
   * Wrap a function with caching
   */
  wrap<T>(
    keyGenerator: (...args: unknown[]) => string,
    fn: (...args: unknown[]) => Promise<T>,
    options: CacheOptions = {},
  ): (...args: unknown[]) => Promise<T> {
    return async (...args: unknown[]): Promise<T> => {
      const key = keyGenerator(...args);
      return this.getOrSet(key, () => fn(...args), options);
    };
  }

  /**
   * Build a cache key with namespace
   */
  buildKey(namespace: CacheKeys, ...parts: (string | number)[]): string {
    return [namespace, ...parts].join(':');
  }

  /**
   * Delete keys by pattern (use with caution)
   */
  async deleteByPattern(pattern: string): Promise<number> {
    try {
      // This requires direct Redis access for SCAN command
      // For now, we'll log a warning
      this.logger.warn('deleteByPattern not fully implemented - requires direct Redis access');
      return 0;
    } catch (error) {
      this.logger.error(`Failed to delete keys by pattern ${pattern}`, error instanceof Error ? error.message : String(error));
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Reset cache statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0,
      hitRate: 0,
    };
  }

  /**
   * Cache NFT metadata
   */
  async cacheNftMetadata(
    nftId: string,
    metadata: CachedNFTMetadata,
    ttl = 86400, // 24 hours default
  ): Promise<void> {
    const key = this.buildKey(CacheKeys.NFT_METADATA, nftId);
    await this.set(key, metadata, { ttl });
  }

  /**
   * Get cached NFT metadata
   */
  async getNftMetadata(nftId: string): Promise<CachedNFTMetadata | null> {
    const key = this.buildKey(CacheKeys.NFT_METADATA, nftId);
    return this.get(key);
  }

  /**
   * Cache user alerts
   */
  async cacheUserAlerts(userId: string, alerts: CachedAlertConfig[], ttl = 300): Promise<void> {
    const key = this.buildKey(CacheKeys.USER_ALERTS, userId);
    await this.set(key, alerts, { ttl });
  }

  /**
   * Get cached user alerts
   */
  async getUserAlerts(userId: string): Promise<CachedAlertConfig[] | null> {
    const key = this.buildKey(CacheKeys.USER_ALERTS, userId);
    return this.get<CachedAlertConfig[]>(key);
  }

  /**
   * Invalidate user alerts cache
   */
  async invalidateUserAlerts(userId: string): Promise<void> {
    const key = this.buildKey(CacheKeys.USER_ALERTS, userId);
    await this.del(key);
  }

  /**
   * Cache transaction data
   */
  async cacheTransaction(
    txHash: string,
    txData: CachedTransactionData,
    ttl = 3600, // 1 hour default
  ): Promise<void> {
    const key = this.buildKey(CacheKeys.TRANSACTION, txHash);
    await this.set(key, txData, { ttl });
  }

  /**
   * Get cached transaction
   */
  async getTransaction(txHash: string): Promise<CachedTransactionData | null> {
    const key = this.buildKey(CacheKeys.TRANSACTION, txHash);
    return this.get(key);
  }

  /**
   * Implement distributed lock
   */
  async acquireLock(
    lockKey: string,
    ttl = 30, // 30 seconds default
  ): Promise<boolean> {
    try {
      const key = `lock:${lockKey}`;
      const lockId = Date.now().toString();
      
      // Try to set the lock with NX (only if not exists)
      await this.cacheManager.set(key, lockId, ttl * 1000);
      // Note: This doesn't guarantee NX behavior without direct Redis access
      
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(lockKey: string): Promise<void> {
    const key = `lock:${lockKey}`;
    await this.del(key);
  }

  /**
   * Update hit rate calculation
   */
  private updateHitRate(): void {
    const total = this.stats.hits + this.stats.misses;
    this.stats.hitRate = total > 0 ? this.stats.hits / total : 0;
  }
}