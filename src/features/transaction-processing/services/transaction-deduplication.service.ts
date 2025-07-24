import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../core/logger/logger.service';
import { DeduplicationKey, ProcessedTransaction } from '../interfaces/transaction.interface';
import { TRANSACTION_CONSTANTS, TRANSACTION_ERRORS } from '../constants/transaction.constants';

@Injectable()
export class TransactionDeduplicationService {
  private cache = new Map<string, ProcessedTransaction>();
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  constructor(private readonly logger: LoggerService) {
    this.startCacheCleanup();
  }

  async isDuplicate(key: DeduplicationKey): Promise<boolean> {
    try {
      const cacheKey = this.generateCacheKey(key);
      return this.cache.has(cacheKey);
    } catch (error) {
      this.logger.error(
        `Error checking for duplicate: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(TRANSACTION_ERRORS.DEDUPLICATION_CHECK_FAILED);
    }
  }

  async markAsProcessed(key: DeduplicationKey): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const processed: ProcessedTransaction = {
        id: cacheKey,
        processed: true,
        processedAt: new Date(),
      };

      this.cache.set(cacheKey, processed);

      // Enforce cache size limit
      if (this.cache.size > TRANSACTION_CONSTANTS.DEDUPLICATION_CACHE_MAX_SIZE) {
        this.evictOldestEntries();
      }
    } catch (error) {
      this.logger.error(
        `Error marking transaction as processed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async markAsFailed(key: DeduplicationKey, errors: string[]): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const processed: ProcessedTransaction = {
        id: cacheKey,
        processed: false,
        processedAt: new Date(),
        errors,
      };

      this.cache.set(cacheKey, processed);
    } catch (error) {
      this.logger.error(
        `Error marking transaction as failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async getProcessedTransaction(key: DeduplicationKey): Promise<ProcessedTransaction | null> {
    try {
      const cacheKey = this.generateCacheKey(key);
      return this.cache.get(cacheKey) || null;
    } catch (error) {
      this.logger.error(
        `Error retrieving processed transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async clearCache(): Promise<void> {
    this.cache.clear();
    this.logger.log('Deduplication cache cleared');
  }

  getCacheStats(): {
    size: number;
    maxSize: number;
    hitRate: number;
    memoryUsage: number;
  } {
    const size = this.cache.size;
    const maxSize = TRANSACTION_CONSTANTS.DEDUPLICATION_CACHE_MAX_SIZE;
    
    // Estimate memory usage (rough calculation)
    const avgKeySize = 64; // bytes
    const avgValueSize = 200; // bytes
    const memoryUsage = size * (avgKeySize + avgValueSize);

    return {
      size,
      maxSize,
      hitRate: 0, // TODO: Implement hit rate tracking
      memoryUsage,
    };
  }

  private generateCacheKey(key: DeduplicationKey): string {
    return `${key.transactionHash}_${key.ledgerIndex}`;
  }

  private evictOldestEntries(): void {
    const targetSize = Math.floor(TRANSACTION_CONSTANTS.DEDUPLICATION_CACHE_MAX_SIZE * 0.8);
    const entriesToRemove = this.cache.size - targetSize;

    if (entriesToRemove <= 0) {
      return;
    }

    // Convert to array and sort by processedAt timestamp
    const entries = Array.from(this.cache.entries())
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => {
        const aTime = a.value.processedAt?.getTime() || 0;
        const bTime = b.value.processedAt?.getTime() || 0;
        return aTime - bTime;
      });

    // Remove oldest entries
    for (let i = 0; i < entriesToRemove && i < entries.length; i++) {
      this.cache.delete(entries[i]!.key);
    }

    this.logger.debug(`Evicted ${entriesToRemove} old entries from deduplication cache`);
  }

  private startCacheCleanup(): void {
    this.cacheCleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, TRANSACTION_CONSTANTS.DEDUPLICATION_CACHE_TTL * 1000);
  }

  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const ttlMs = TRANSACTION_CONSTANTS.DEDUPLICATION_CACHE_TTL * 1000;
    let removedCount = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.processedAt) {
        const age = now - value.processedAt.getTime();
        if (age > ttlMs) {
          this.cache.delete(key);
          removedCount++;
        }
      }
    }

    if (removedCount > 0) {
      this.logger.debug(`Cleaned up ${removedCount} expired entries from deduplication cache`);
    }
  }

  // Batch operations for efficiency
  async isDuplicateBatch(keys: DeduplicationKey[]): Promise<boolean[]> {
    try {
      return keys.map((key) => {
        const cacheKey = this.generateCacheKey(key);
        return this.cache.has(cacheKey);
      });
    } catch (error) {
      this.logger.error(
        `Error checking batch for duplicates: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(TRANSACTION_ERRORS.DEDUPLICATION_CHECK_FAILED);
    }
  }

  async markBatchAsProcessed(keys: DeduplicationKey[]): Promise<void> {
    try {
      const now = new Date();
      
      for (const key of keys) {
        const cacheKey = this.generateCacheKey(key);
        const processed: ProcessedTransaction = {
          id: cacheKey,
          processed: true,
          processedAt: now,
        };
        
        this.cache.set(cacheKey, processed);
      }

      // Enforce cache size limit after batch operation
      if (this.cache.size > TRANSACTION_CONSTANTS.DEDUPLICATION_CACHE_MAX_SIZE) {
        this.evictOldestEntries();
      }
    } catch (error) {
      this.logger.error(
        `Error marking batch as processed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  // Cleanup method for shutdown
  destroy(): void {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    
    this.cache.clear();
  }
}