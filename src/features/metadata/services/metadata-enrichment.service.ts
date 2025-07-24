import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../../core/logger/logger.service';
import { NFTMetadataFetcherService } from './nft-metadata-fetcher.service';
import { NftEntity } from '../../../database/entities/nft.entity';

@Injectable()
export class MetadataEnrichmentService implements OnModuleInit, OnModuleDestroy {
  private enrichmentInterval: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private readonly BATCH_SIZE = 10;
  private readonly PROCESS_INTERVAL = 5000; // 5 seconds
  private readonly MAX_RETRIES = 3;

  constructor(
    private readonly logger: LoggerService,
    private readonly metadataFetcher: NFTMetadataFetcherService,
    @InjectRepository(NftEntity)
    private readonly nftRepository: Repository<NftEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting Metadata Enrichment Service');
    this.startEnrichmentProcess();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Stopping Metadata Enrichment Service');
    if (this.enrichmentInterval) {
      clearInterval(this.enrichmentInterval);
    }
  }

  private startEnrichmentProcess(): void {
    this.enrichmentInterval = setInterval(async () => {
      if (!this.isProcessing) {
        await this.processEnrichmentQueue();
      }
    }, this.PROCESS_INTERVAL);
  }

  private async processEnrichmentQueue(): Promise<void> {
    this.isProcessing = true;

    try {
      // Get pending NFTs from the queue
      const pendingNfts = await this.getPendingNfts();
      
      if (pendingNfts.length === 0) {
        return;
      }

      this.logger.debug(`Processing ${pendingNfts.length} NFTs for metadata enrichment`);

      // Process each NFT
      const promises = pendingNfts.map((nft) => this.enrichNft(nft));
      const results = await Promise.allSettled(promises);

      // Log results
      const successful = results.filter((r) => r.status === 'fulfilled').length;
      const failed = results.filter((r) => r.status === 'rejected').length;
      
      if (successful > 0 || failed > 0) {
        this.logger.log(
          `Metadata enrichment batch completed: ${successful} successful, ${failed} failed`
        );
      }
    } catch (error) {
      this.logger.error(
        `Error in metadata enrichment process: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.isProcessing = false;
    }
  }

  private async getPendingNfts(): Promise<NftEntity[]> {
    // Get NFTs that need metadata enrichment
    const qb = this.nftRepository.createQueryBuilder('nft');
    
    const pendingNfts = await qb
      .innerJoin(
        'metadata_enrichment_queue',
        'queue',
        'queue.nft_id = nft.nft_id'
      )
      .where('queue.status = :status', { status: 'pending' })
      .andWhere('queue.retry_count < :maxRetries', { maxRetries: this.MAX_RETRIES })
      .andWhere('queue.next_retry_at <= NOW()')
      .orderBy('queue.created_at', 'ASC')
      .limit(this.BATCH_SIZE)
      .getMany();

    return pendingNfts;
  }

  private async enrichNft(nft: NftEntity): Promise<void> {
    try {
      if (!nft.metadataUri) {
        throw new Error('NFT has no metadata URI');
      }

      // Fetch metadata
      const result = await this.metadataFetcher.fetchNFTMetadata(
        nft.nftId,
        nft.metadataUri
      );

      if (!result.metadata) {
        throw new Error(result.error || 'Failed to fetch metadata');
      }

      // Update NFT with metadata
      await this.nftRepository.update(
        { nftId: nft.nftId },
        {
          metadata: result.metadata,
          metadataFetchedAt: new Date(),
          imageUrl: result.metadata.image || null,
          traits: result.metadata.attributes ? { attributes: result.metadata.attributes } : null,
          metadataFetchError: null,
        }
      );

      // Fetch and cache image if present
      if (result.metadata.image) {
        try {
          const imageS3Url = await this.metadataFetcher.fetchAndCacheImage(
            nft.nftId,
            result.metadata.image
          );

          if (imageS3Url) {
            await this.nftRepository.update(
              { nftId: nft.nftId },
              {
                imageS3Url,
                imageFetchedAt: new Date(),
                imageFetchError: null,
              }
            );
            this.logger.log(`Successfully cached image for NFT ${nft.nftId}`);
          } else {
            await this.nftRepository.update(
              { nftId: nft.nftId },
              {
                imageFetchError: 'Failed to fetch/cache image - no S3 URL returned',
              }
            );
          }
        } catch (imageError) {
          const errorMessage = imageError instanceof Error ? imageError.message : String(imageError);
          this.logger.error(`Failed to fetch image for NFT ${nft.nftId}: ${errorMessage}`);
          await this.nftRepository.update(
            { nftId: nft.nftId },
            {
              imageFetchError: errorMessage,
            }
          );
        }
      }

      // Mark as completed in queue
      await this.updateQueueStatus(nft.nftId, 'completed');

      this.logger.log(`Successfully enriched metadata for NFT ${nft.nftId}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to enrich NFT ${nft.nftId}: ${errorMessage}`);

      // Update error in database
      await this.nftRepository.update(
        { nftId: nft.nftId },
        {
          metadataFetchError: errorMessage,
        }
      );

      // Update queue for retry
      await this.updateQueueForRetry(nft.nftId);
    }
  }

  private async updateQueueStatus(nftId: string, status: string): Promise<void> {
    await this.nftRepository.query(
      `UPDATE metadata_enrichment_queue 
       SET status = $1, updated_at = NOW() 
       WHERE nft_id = $2`,
      [status, nftId]
    );
  }

  private async updateQueueForRetry(nftId: string): Promise<void> {
    // Exponential backoff: 1 min, 5 min, 30 min
    const retryDelays = [60, 300, 1800];
    
    await this.nftRepository.query(
      `UPDATE metadata_enrichment_queue 
       SET retry_count = retry_count + 1,
           last_attempt_at = NOW(),
           next_retry_at = NOW() + INTERVAL '1 second' * $1,
           updated_at = NOW()
       WHERE nft_id = $2
       AND retry_count < $3`,
      [
        retryDelays[Math.min(retryDelays.length - 1, await this.getRetryCount(nftId))],
        nftId,
        this.MAX_RETRIES
      ]
    );
  }

  private async getRetryCount(nftId: string): Promise<number> {
    const result = await this.nftRepository.query(
      `SELECT retry_count FROM metadata_enrichment_queue WHERE nft_id = $1`,
      [nftId]
    );
    
    return result[0]?.retry_count || 0;
  }

  // Public method to manually trigger enrichment for specific NFT
  async enrichSpecificNft(nftId: string): Promise<void> {
    const nft = await this.nftRepository.findOne({ where: { nftId } });
    if (nft) {
      await this.enrichNft(nft);
    } else {
      throw new Error(`NFT ${nftId} not found`);
    }
  }
}