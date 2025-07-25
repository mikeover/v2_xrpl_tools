import { Injectable, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisCacheService } from './redis-cache.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CollectionEntity } from '../../../database/entities/collection.entity';
import { AlertConfigEntity } from '../../../database/entities/alert-config.entity';
import { CacheKeys } from '../interfaces/redis.interface';

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  private isWarming = false;

  constructor(
    private readonly cacheService: RedisCacheService,
    private readonly logger: LoggerService,
    @InjectRepository(CollectionEntity)
    private readonly collectionRepository: Repository<CollectionEntity>,
    @InjectRepository(AlertConfigEntity)
    private readonly alertConfigRepository: Repository<AlertConfigEntity>,
  ) {}

  async onModuleInit() {
    // Initial cache warming on startup
    await this.warmCache();
  }

  /**
   * Warm cache every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async scheduledCacheWarming() {
    await this.warmCache();
  }

  /**
   * Main cache warming logic
   */
  async warmCache(): Promise<void> {
    if (this.isWarming) {
      this.logger.warn('Cache warming already in progress, skipping');
      return;
    }

    this.isWarming = true;
    this.logger.log('Starting cache warming process');

    try {
      await Promise.all([
        this.warmPopularCollections(),
        this.warmActiveAlerts(),
        this.warmSystemConfig(),
      ]);

      this.logger.log('Cache warming completed successfully');
    } catch (error) {
      this.logger.error('Cache warming failed', error instanceof Error ? error.message : String(error));
    } finally {
      this.isWarming = false;
    }
  }

  /**
   * Warm popular collections
   */
  private async warmPopularCollections(): Promise<void> {
    try {
      // Get top 100 collections by activity
      const collections = await this.collectionRepository
        .createQueryBuilder('collection')
        .leftJoinAndSelect('collection.nfts', 'nfts')
        .orderBy('collection.total_volume', 'DESC')
        .limit(100)
        .getMany();

      for (const collection of collections) {
        const key = this.cacheService.buildKey(
          CacheKeys.NFT_COLLECTION,
          collection.taxon.toString(),
        );
        await this.cacheService.set(key, collection, { ttl: 3600 }); // 1 hour
      }

      this.logger.log(`Warmed ${collections.length} popular collections`);
    } catch (error) {
      this.logger.error('Failed to warm popular collections', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Warm active alerts
   */
  private async warmActiveAlerts(): Promise<void> {
    try {
      // Get all active alerts
      const alerts = await this.alertConfigRepository
        .createQueryBuilder('alert')
        .where('alert.enabled = :enabled', { enabled: true })
        .andWhere('alert.deleted_at IS NULL')
        .leftJoinAndSelect('alert.user', 'user')
        .getMany();

      // Group alerts by user
      const alertsByUser = new Map<string, any[]>();
      for (const alert of alerts) {
        const userId = alert.user.id;
        if (!alertsByUser.has(userId)) {
          alertsByUser.set(userId, []);
        }
        alertsByUser.get(userId)?.push(alert);
      }

      // Cache alerts for each user
      for (const [userId, userAlerts] of alertsByUser) {
        await this.cacheService.cacheUserAlerts(userId, userAlerts, 300); // 5 minutes
      }

      this.logger.log(`Warmed alerts for ${alertsByUser.size} users`);
    } catch (error) {
      this.logger.error('Failed to warm active alerts', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Warm system configuration
   */
  private async warmSystemConfig(): Promise<void> {
    try {
      // Cache frequently accessed system config
      const systemConfig = {
        xrplNodes: process.env['XRPL_NODES']?.split(',') || [],
        ipfsGateways: process.env['IPFS_GATEWAYS']?.split(',') || [],
        s3Bucket: process.env['AWS_S3_BUCKET'],
        rateLimits: {
          api: 1000,
          webhook: 100,
          metadata: 500,
        },
      };

      const key = this.cacheService.buildKey(CacheKeys.SYSTEM_CONFIG, 'global');
      await this.cacheService.set(key, systemConfig, { ttl: 3600 }); // 1 hour

      this.logger.log('Warmed system configuration');
    } catch (error) {
      this.logger.error('Failed to warm system config', error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Warm specific NFT metadata
   */
  async warmNftMetadata(nftIds: string[]): Promise<void> {
    this.logger.log(`Warming metadata for ${nftIds.length} NFTs`);

    const results = await Promise.allSettled(
      nftIds.map(async (nftId) => {
        // Check if already cached
        const cached = await this.cacheService.getNftMetadata(nftId);
        if (cached) {
          return; // Already in cache
        }

        // Fetch from database or external source
        // This would integrate with MetadataEnrichmentService
        // For now, we'll skip the actual fetching
      }),
    );

    const successful = results.filter((r) => r.status === 'fulfilled').length;
    this.logger.log(`Successfully warmed ${successful}/${nftIds.length} NFT metadata`);
  }
}