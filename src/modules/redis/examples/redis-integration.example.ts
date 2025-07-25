import { Injectable } from '@nestjs/common';
import { RedisCacheService } from '../services/redis-cache.service';
import { CacheKeys } from '../interfaces/redis.interface';

/**
 * Example of integrating Redis caching into existing services
 */
@Injectable()
export class ExampleServiceWithCaching {
  constructor(
    private readonly cacheService: RedisCacheService,
  ) {}

  /**
   * Example 1: Simple cache-aside pattern
   */
  async getUserData(userId: string): Promise<any> {
    const cacheKey = this.cacheService.buildKey(CacheKeys.USER_PROFILE, userId);
    
    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey);
    if (cached) {
      return cached;
    }

    // If not in cache, fetch from database
    const userData = await this.fetchUserFromDatabase(userId);
    
    // Cache for 5 minutes
    await this.cacheService.set(cacheKey, userData, { ttl: 300 });
    
    return userData;
  }

  /**
   * Example 2: Using getOrSet helper
   */
  async getNftMetadata(nftId: string): Promise<any> {
    const cacheKey = this.cacheService.buildKey(CacheKeys.NFT_METADATA, nftId);
    
    return this.cacheService.getOrSet(
      cacheKey,
      () => this.fetchNftMetadataFromIPFS(nftId),
      { ttl: 86400 } // Cache for 24 hours
    );
  }

  /**
   * Example 3: Cache invalidation
   */
  async updateUserProfile(userId: string, data: any): Promise<void> {
    // Update in database
    await this.updateUserInDatabase(userId, data);
    
    // Invalidate cache
    const cacheKey = this.cacheService.buildKey(CacheKeys.USER_PROFILE, userId);
    await this.cacheService.del(cacheKey);
    
    // Also invalidate user alerts cache
    await this.cacheService.invalidateUserAlerts(userId);
  }

  /**
   * Example 4: Wrapping a function with caching
   */
  getCollectionStats = (collectionId: string) => {
    return this.cacheService.wrap(
      (collectionId: string) => this.cacheService.buildKey(CacheKeys.NFT_COLLECTION, 'stats', collectionId),
      async (collectionId: string) => {
        // Expensive calculation
        return this.calculateCollectionStats(collectionId);
      },
      { ttl: 3600 } // Cache for 1 hour
    )(collectionId);
  };

  /**
   * Example 5: Distributed locking for concurrent operations
   */
  async processExpensiveOperation(resourceId: string): Promise<void> {
    const lockKey = `process:${resourceId}`;
    const acquired = await this.cacheService.acquireLock(lockKey, 30); // 30 second lock
    
    if (!acquired) {
      throw new Error('Resource is already being processed');
    }

    try {
      // Do expensive operation
      await this.performExpensiveWork(resourceId);
    } finally {
      // Always release the lock
      await this.cacheService.releaseLock(lockKey);
    }
  }

  /**
   * Example 6: Batch caching
   */
  async cacheTransactionBatch(transactions: any[]): Promise<void> {
    const promises = transactions.map(tx => 
      this.cacheService.cacheTransaction(tx.hash, tx, 3600)
    );
    
    await Promise.all(promises);
  }

  // Mock methods for example
  private async fetchUserFromDatabase(userId: string): Promise<any> {
    // Database fetch logic
    return { id: userId, name: 'Example User' };
  }

  private async fetchNftMetadataFromIPFS(nftId: string): Promise<any> {
    // IPFS fetch logic
    return { id: nftId, name: 'Example NFT' };
  }

  private async updateUserInDatabase(_userId: string, _data: any): Promise<void> {
    // Database update logic
  }

  private async calculateCollectionStats(_collectionId: string): Promise<any> {
    // Complex calculation logic
    return { total: 100, volume: 1000000 };
  }

  private async performExpensiveWork(_resourceId: string): Promise<void> {
    // Expensive operation logic
  }
}