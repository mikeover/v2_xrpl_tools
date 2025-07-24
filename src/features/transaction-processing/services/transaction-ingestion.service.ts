import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LoggerService } from '../../../core/logger/logger.service';
import { XRPLConnectionManagerService } from '../../../modules/xrpl-connection/services/xrpl-connection-manager.service';
import { NFTTransactionParserService } from './nft-transaction-parser.service';
import { TransactionBatchProcessorService } from './transaction-batch-processor.service';
import { TransactionDeduplicationService } from './transaction-deduplication.service';
import { LedgerSyncStatusEntity } from '../../../database/entities/ledger-sync-status.entity';
import {
  NFTTransactionData,
  TransactionBatch,
} from '../interfaces/transaction.interface';
import { TRANSACTION_CONSTANTS, TRANSACTION_ERRORS } from '../constants/transaction.constants';
import { Subscription } from '../../../modules/xrpl-connection/interfaces/connection.interface';

@Injectable()
export class TransactionIngestionService implements OnModuleInit, OnModuleDestroy {
  private subscription: Subscription | null = null;
  private currentBatch: NFTTransactionData[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private processedCount = 0;
  private lastProcessedLedger = 0;
  private debugStructureCount = 0;

  constructor(
    private readonly logger: LoggerService,
    private readonly xrplManager: XRPLConnectionManagerService,
    private readonly parser: NFTTransactionParserService,
    private readonly batchProcessor: TransactionBatchProcessorService,
    private readonly deduplication: TransactionDeduplicationService,
    @InjectRepository(LedgerSyncStatusEntity)
    private readonly ledgerSyncRepository: Repository<LedgerSyncStatusEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Transaction Ingestion Service');
    
    // Get the last processed ledger from database
    await this.loadLastProcessedLedger();
    
    // Start transaction ingestion
    await this.startIngestion();
    
    // Start batch processing timer
    this.startBatchTimer();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down Transaction Ingestion Service');
    
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
    }
    
    // Process any remaining transactions in the current batch
    await this.processBatch();
  }

  async startIngestion(): Promise<void> {
    try {
      this.subscription = this.xrplManager.subscribeTransactions(
        (transactionMessage) => {
          this.handleTransaction(transactionMessage).catch((error) => {
            this.logger.error(
              `Error handling transaction: ${error instanceof Error ? error.message : String(error)}`,
            );
          });
        },
      );

      this.logger.log('Started XRPL transaction ingestion');
    } catch (error) {
      this.logger.error(
        `Failed to start transaction ingestion: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  async stopIngestion(): Promise<void> {
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
    
    await this.processBatch();
    this.logger.log('Stopped transaction ingestion');
  }

  private async handleTransaction(transactionMessage: any): Promise<void> {
    try {
      // Update ledger tracking
      if (transactionMessage.ledger_index > this.lastProcessedLedger) {
        this.lastProcessedLedger = transactionMessage.ledger_index;
      }

      // Log EVERY transaction type for debugging
      const rawTx = transactionMessage.transaction || transactionMessage;
      const tx = rawTx.tx_json || rawTx; // The actual transaction data is in tx_json
      const isNFTRelated = this.parser.isNFTTransaction(tx);
      
      // Debug the transaction structure to see what fields are available (only first 3 transactions)
      if (this.debugStructureCount < 3) {
        this.logger.debug('Raw transaction structure:', {
          topLevelKeys: Object.keys(transactionMessage),
          rawTxKeys: Object.keys(rawTx),
          txJsonKeys: Object.keys(tx),
          transactionType: tx.TransactionType,
          txTransactionType: tx.transaction_type,
          fullTxJson: tx
        });
        this.debugStructureCount++;
      }
      
      // Use the new transaction logging method to log every single transaction
      this.logger.logTransaction(
        tx.TransactionType || tx.transaction_type || 'UNKNOWN',
        transactionMessage.ledger_index || 0,
        isNFTRelated,
        { 
          hash: tx.hash || tx.Hash,
          account: tx.Account,
          fee: tx.Fee,
          rawTxKeys: Object.keys(tx)
        }
      );

      // Check if this is an NFT transaction
      if (!isNFTRelated) {
        // Specifically warn about NFT transaction types that get rejected
        if (tx.TransactionType?.startsWith('NFToken')) {
          this.logger.warn(`Found NFT transaction type ${tx.TransactionType} but parser rejected it`);
        }
        return;
      }

      this.logger.log(`🎯 NFT Transaction detected: ${tx.TransactionType} in ledger ${transactionMessage.ledger_index}`);

      // Parse the NFT transaction
      const nftTransaction = this.parser.parseNFTTransaction(transactionMessage);
      if (!nftTransaction) {
        this.logger.warn(`Failed to parse NFT transaction of type ${tx.TransactionType}`);
        return;
      }

      // Check for duplicates
      const isDuplicate = await this.deduplication.isDuplicate({
        transactionHash: nftTransaction.transactionHash,
        ledgerIndex: nftTransaction.ledgerIndex,
      });

      if (isDuplicate) {
        this.logger.debug(`Duplicate transaction detected: ${nftTransaction.transactionHash}`);
        return;
      }

      // Add to current batch
      this.currentBatch.push(nftTransaction);
      
      // Process batch if it reaches the maximum size
      if (this.currentBatch.length >= TRANSACTION_CONSTANTS.MAX_BATCH_SIZE) {
        await this.processBatch();
      }

      this.processedCount++;
      
      // Log progress every 100 transactions
      if (this.processedCount % 100 === 0) {
        this.logger.log(`Processed ${this.processedCount} NFT transactions`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing transaction: ${error instanceof Error ? error.message : String(error)}`,
        transactionMessage,
      );
    }
  }

  private async processBatch(): Promise<void> {
    if (this.currentBatch.length === 0 || this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    const batch: TransactionBatch = {
      transactions: [...this.currentBatch],
      batchSize: this.currentBatch.length,
      createdAt: new Date(),
    };

    try {
      this.logger.debug(`Processing batch of ${batch.batchSize} transactions`);
      
      const startTime = Date.now();
      await this.batchProcessor.processBatch(batch);
      const processingTime = Date.now() - startTime;

      // Mark transactions as processed in deduplication cache
      for (const transaction of batch.transactions) {
        await this.deduplication.markAsProcessed({
          transactionHash: transaction.transactionHash,
          ledgerIndex: transaction.ledgerIndex,
        });
      }

      // Update ledger sync status
      await this.updateLedgerSyncStatus();

      this.logger.debug(
        `Successfully processed batch of ${batch.batchSize} transactions in ${processingTime}ms`,
      );

      // Warn if processing took too long
      if (processingTime > TRANSACTION_CONSTANTS.PROCESSING_TIME_THRESHOLD) {
        this.logger.warn(
          `Batch processing took ${processingTime}ms, which exceeds the threshold of ${TRANSACTION_CONSTANTS.PROCESSING_TIME_THRESHOLD}ms`,
        );
      }

      // Clear the current batch
      this.currentBatch = [];
    } catch (error) {
      this.logger.error(
        `Failed to process batch: ${error instanceof Error ? error.message : String(error)} (batch size: ${batch.batchSize})`,
      );

      // Don't clear the batch on error - it will be retried
      throw new Error(TRANSACTION_ERRORS.BATCH_PROCESSING_FAILED);
    } finally {
      this.isProcessing = false;
    }
  }

  private startBatchTimer(): void {
    this.batchTimer = setInterval(async () => {
      try {
        await this.processBatch();
      } catch (error) {
        this.logger.error(
          `Error in batch timer: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, TRANSACTION_CONSTANTS.BATCH_FLUSH_INTERVAL);
  }

  private async loadLastProcessedLedger(): Promise<void> {
    try {
      const lastSync = await this.ledgerSyncRepository.findOne({
        where: {},
        order: { ledgerIndex: 'DESC' },
      });

      if (lastSync) {
        this.lastProcessedLedger = parseInt(lastSync.ledgerIndex);
        this.logger.log(`Resuming from ledger index: ${this.lastProcessedLedger}`);
      } else {
        this.logger.log('No previous sync status found, starting fresh');
      }
    } catch (error) {
      this.logger.error(
        `Failed to load last processed ledger: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async updateLedgerSyncStatus(): Promise<void> {
    if (this.lastProcessedLedger === 0) {
      return;
    }

    try {
      const syncStatus = new LedgerSyncStatusEntity();
      syncStatus.ledgerIndex = this.lastProcessedLedger.toString();
      syncStatus.ledgerHash = 'unknown'; // We'll update this from ledger events
      syncStatus.closeTime = new Date();
      syncStatus.transactionCount = this.processedCount;
      syncStatus.processedAt = new Date();

      await this.ledgerSyncRepository.save(syncStatus);
    } catch (error) {
      this.logger.error(
        `Failed to update ledger sync status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Public methods for monitoring and control
  getIngestionStats(): {
    processedCount: number;
    currentBatchSize: number;
    lastProcessedLedger: number;
    isProcessing: boolean;
  } {
    return {
      processedCount: this.processedCount,
      currentBatchSize: this.currentBatch.length,
      lastProcessedLedger: this.lastProcessedLedger,
      isProcessing: this.isProcessing,
    };
  }

  async forceProcessBatch(): Promise<void> {
    await this.processBatch();
  }

  async reprocessFailedTransactions(): Promise<void> {
    // This would implement logic to reprocess transactions that failed
    // For now, we'll just log that this feature is not yet implemented
    this.logger.warn('Reprocess failed transactions feature not yet implemented');
  }
}