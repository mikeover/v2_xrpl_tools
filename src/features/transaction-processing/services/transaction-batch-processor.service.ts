import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, QueryRunner } from 'typeorm';
import { LoggerService } from '../../../core/logger/logger.service';
import { NftActivityEntity } from '../../../database/entities/nft-activity.entity';
import { NftEntity } from '../../../database/entities/nft.entity';
import { CollectionEntity } from '../../../database/entities/collection.entity';
import {
  NFTTransactionData,
  TransactionBatch,
  NFTActivityType,
} from '../interfaces/transaction.interface';
import { TRANSACTION_CONSTANTS, TRANSACTION_ERRORS } from '../constants/transaction.constants';
import { AlertNotificationService } from '../../alerts/services/alert-notification.service';

@Injectable()
export class TransactionBatchProcessorService {
  private processingQueue = new Map<string, Promise<void>>();

  constructor(
    private readonly logger: LoggerService,
    private readonly dataSource: DataSource,
    @InjectRepository(NftActivityEntity)
    private readonly nftActivityRepository: Repository<NftActivityEntity>,
    @InjectRepository(NftEntity)
    private readonly nftRepository: Repository<NftEntity>,
    @InjectRepository(CollectionEntity)
    private readonly collectionRepository: Repository<CollectionEntity>,
    private readonly alertNotificationService: AlertNotificationService,
  ) {}

  async processBatch(batch: TransactionBatch): Promise<void> {
    const batchId = `batch_${Date.now()}_${Math.random()}`;
    
    try {
      // Prevent concurrent processing of the same batch
      if (this.processingQueue.has(batchId)) {
        this.logger.warn(`Batch ${batchId} is already being processed`);
        return;
      }

      const processingPromise = this.processBatchInternal(batch, batchId);
      this.processingQueue.set(batchId, processingPromise);
      
      await processingPromise;
    } finally {
      this.processingQueue.delete(batchId);
    }
  }

  private async processBatchInternal(batch: TransactionBatch, batchId: string): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.debug(`Processing batch ${batchId} with ${batch.batchSize} transactions`);

      // Process transactions in smaller chunks to avoid memory issues
      const chunkSize = Math.min(TRANSACTION_CONSTANTS.DEFAULT_BATCH_SIZE, batch.batchSize);
      
      for (let i = 0; i < batch.transactions.length; i += chunkSize) {
        const chunk = batch.transactions.slice(i, i + chunkSize);
        await this.processTransactionChunk(chunk, queryRunner);
      }

      await queryRunner.commitTransaction();
      
      this.logger.debug(
        `Successfully committed batch ${batchId} with ${batch.batchSize} transactions`,
      );
      
    } catch (error) {
      await queryRunner.rollbackTransaction();
      
      this.logger.error(
        `Failed to process batch ${batchId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      throw new Error(TRANSACTION_ERRORS.BATCH_PROCESSING_FAILED);
    } finally {
      await queryRunner.release();
    }
  }

  private async processTransactionChunk(
    transactions: NFTTransactionData[],
    queryRunner: QueryRunner,
  ): Promise<void> {
    const nftsToUpdate = new Map<string, Partial<NftEntity>>();
    const collectionsToCreate = new Map<string, CollectionEntity>();
    const activities: NftActivityEntity[] = [];

    // First pass: Process NFTs and collections
    for (const transaction of transactions) {
      try {
        if (transaction.nftTokenID) {
          await this.processNFTUpdate(transaction, nftsToUpdate, collectionsToCreate, queryRunner);
        }
      } catch (error) {
        this.logger.error(
          `Error processing NFT update for transaction ${transaction.transactionHash}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Create new collections first
    if (collectionsToCreate.size > 0) {
      await queryRunner.manager.save(CollectionEntity, Array.from(collectionsToCreate.values()));
    }

    // Update existing NFTs
    for (const [nftId, updates] of nftsToUpdate) {
      await queryRunner.manager.update(NftEntity, { nftId }, updates);
    }

    // Second pass: Create activities (now that NFTs exist)
    for (const transaction of transactions) {
      try {
        const activity = await this.createNftActivity(transaction, queryRunner);
        activities.push(activity);
      } catch (error) {
        this.logger.error(
          `Error creating activity for transaction ${transaction.transactionHash}: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
    }

    // Bulk insert activities
    let savedActivities: NftActivityEntity[] = [];
    if (activities.length > 0) {
      savedActivities = await queryRunner.manager.save(NftActivityEntity, activities);
    }

    // After successful database commit, process alerts asynchronously
    if (savedActivities.length > 0) {
      // Process alerts in the background without blocking transaction processing
      this.processAlertsAsync(savedActivities).catch(error => {
        // Log but don't throw - alert failures shouldn't break transaction processing
        this.logger.error(
          `Alert processing failed for ${savedActivities.length} activities: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    }
  }

  private async createNftActivity(
    transaction: NFTTransactionData,
    queryRunner: QueryRunner,
  ): Promise<NftActivityEntity> {
    const activity = new NftActivityEntity();
    
    // Find the NFT entity if nftTokenID exists
    let nftEntity: NftEntity | null = null;
    if (transaction.nftTokenID) {
      nftEntity = await queryRunner.manager.findOne(NftEntity, {
        where: { nftId: transaction.nftTokenID },
      });
    }

    activity.nftId = nftEntity?.id || null;
    activity.transactionHash = transaction.transactionHash;
    activity.ledgerIndex = transaction.ledgerIndex.toString();
    activity.activityType = transaction.activityType;
    activity.fromAddress = transaction.fromAddress || null;
    activity.toAddress = transaction.toAddress || null;
    activity.priceDrops = transaction.priceDrops || null;
    activity.currency = transaction.currency || null;
    activity.issuer = transaction.issuer || null;
    activity.timestamp = transaction.timestamp;
    activity.metadata = transaction.metadata || null;

    return activity;
  }

  private async processNFTUpdate(
    transaction: NFTTransactionData,
    nftsToUpdate: Map<string, Partial<NftEntity>>,
    collectionsToCreate: Map<string, CollectionEntity>,
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (!transaction.nftTokenID) {
      return;
    }

    const existingNft = await queryRunner.manager.findOne(NftEntity, {
      where: { nftId: transaction.nftTokenID },
    });

    switch (transaction.activityType) {
      case NFTActivityType.MINT:
        if (!existingNft) {
          await this.createNewNFT(transaction, collectionsToCreate, queryRunner);
        }
        break;

      case NFTActivityType.TRANSFER:
      case NFTActivityType.SALE:
      case NFTActivityType.OFFER_ACCEPTED:
        if (existingNft && transaction.toAddress) {
          nftsToUpdate.set(transaction.nftTokenID, {
            ownerAddress: transaction.toAddress,
            lastActivityAt: transaction.timestamp,
          });
        }
        break;

      case NFTActivityType.BURN:
        if (existingNft) {
          // Mark as burned or delete depending on business logic
          nftsToUpdate.set(transaction.nftTokenID, {
            lastActivityAt: transaction.timestamp,
          });
        }
        break;
    }
  }

  private async createNewNFT(
    transaction: NFTTransactionData,
    collectionsToCreate: Map<string, CollectionEntity>,
    queryRunner: QueryRunner,
  ): Promise<void> {
    if (!transaction.nftTokenID || !transaction.metadata) {
      return;
    }

    // Extract collection information from metadata
    const issuerAddress = transaction.metadata?.['minter'] || transaction.fromAddress;
    const taxon = transaction.metadata?.['taxon'] || 0;

    if (!issuerAddress) {
      this.logger.warn(`Cannot create NFT without issuer address: ${transaction.nftTokenID}`);
      return;
    }

    // Find or create collection
    let collection = await queryRunner.manager.findOne(CollectionEntity, {
      where: { issuerAddress, taxon },
    });

    if (!collection) {
      const collectionKey = `${issuerAddress}_${taxon}`;
      if (!collectionsToCreate.has(collectionKey)) {
        collection = new CollectionEntity();
        collection.issuerAddress = issuerAddress;
        collection.taxon = taxon;
        collection.name = this.extractCollectionName(transaction.metadata);
        collection.metadata = {
          createdFromMint: true,
          firstMintTransaction: transaction.transactionHash,
        };
        
        collectionsToCreate.set(collectionKey, collection);
      } else {
        collection = collectionsToCreate.get(collectionKey)!;
      }
    }

    // Create NFT entity with decoded URI
    const nft = new NftEntity();
    nft.nftId = transaction.nftTokenID;
    nft.collectionId = collection.id;
    nft.ownerAddress = transaction.toAddress || transaction.fromAddress || '';
    nft.metadataUriHex = transaction.metadata?.['uriHex'] || null;
    nft.metadataUri = transaction.metadata?.['uri'] || null;
    nft.lastActivityAt = transaction.timestamp;
    
    // Don't set metadata yet - it will be fetched asynchronously
    nft.metadata = null;
    nft.metadataFetchedAt = null;

    await queryRunner.manager.save(NftEntity, nft);
    
    // Queue for metadata enrichment (only if URI exists)
    if (nft.metadataUri) {
      await this.queueMetadataEnrichment(nft.nftId, queryRunner);
    }
  }

  private async queueMetadataEnrichment(nftId: string, queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`
        INSERT INTO metadata_enrichment_queue (nft_id, status, next_retry_at)
        VALUES ($1, 'pending', NOW())
        ON CONFLICT (nft_id) DO NOTHING
      `, [nftId]);
      
      this.logger.debug(`Queued NFT ${nftId} for metadata enrichment`);
    } catch (error) {
      this.logger.error(`Failed to queue metadata enrichment for NFT ${nftId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private extractCollectionName(metadata: any): string | null {
    // Try to extract collection name from various metadata fields
    if (metadata.collection?.name) {
      return metadata.collection.name;
    }
    
    if (metadata.name && typeof metadata.name === 'string') {
      // Extract collection name from NFT name if it follows a pattern
      const match = metadata.name.match(/^(.+)\s#\d+$/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Process alerts for NFT activities asynchronously
   * This method runs in the background and doesn't block transaction processing
   */
  private async processAlertsAsync(activities: NftActivityEntity[]): Promise<void> {
    try {
      // Check if alert service is available
      if (!this.alertNotificationService) {
        this.logger.debug('AlertNotificationService not available, skipping alert processing');
        return;
      }

      // Fetch full activity data with relations for alert processing
      const activityIds = activities.map(a => a.id);
      const activitiesWithRelations = await this.nftActivityRepository
        .createQueryBuilder('activity')
        .leftJoinAndSelect('activity.nft', 'nft')
        .leftJoinAndSelect('nft.collection', 'collection')
        .where('activity.id IN (:...ids)', { ids: activityIds })
        .getMany();

      if (activitiesWithRelations.length > 0) {
        this.logger.debug(
          `Processing ${activitiesWithRelations.length} activities for alert matching`
        );

        // Process alerts through the AlertNotificationService
        await this.alertNotificationService.processActivityBatch(activitiesWithRelations);
        
        this.logger.debug(
          `Successfully processed ${activitiesWithRelations.length} activities for alerts`
        );
      }
    } catch (error) {
      this.logger.error(
        `Critical error in processAlertsAsync: ${error instanceof Error ? error.message : String(error)}`
      );
      // Re-throw so the catch in the caller can log it appropriately
      throw error;
    }
  }

  // Monitoring and stats methods
  getCurrentQueueSize(): number {
    return this.processingQueue.size;
  }

  getActiveProcesses(): string[] {
    return Array.from(this.processingQueue.keys());
  }

  async getProcessingStats(): Promise<{
    totalActivities: number;
    totalNFTs: number;
    totalCollections: number;
    recentActivities: number;
  }> {
    const [totalActivities, totalNFTs, totalCollections] = await Promise.all([
      this.nftActivityRepository.count(),
      this.nftRepository.count(),
      this.collectionRepository.count(),
    ]);

    // Count activities from the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentActivities = await this.nftActivityRepository
      .createQueryBuilder('activity')
      .where('activity.created_at >= :oneHourAgo', { oneHourAgo })
      .getCount();

    return {
      totalActivities,
      totalNFTs,
      totalCollections,
      recentActivities,
    };
  }
}