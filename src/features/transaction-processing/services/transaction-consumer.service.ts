import { Injectable, OnModuleInit } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { EventConsumerService } from '../../../modules/queue/services/event-consumer.service';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { QueueEvent, TransactionEvent, NFTEvent, LedgerEvent, EventType } from '../../../modules/queue/interfaces/queue.interface';

/**
 * Consumes NFT transactions from RabbitMQ instead of direct subscriptions
 * This replaces the direct subscription model for better scalability and reliability
 */
@Injectable()
export class TransactionConsumerService implements OnModuleInit {
  constructor(
    private readonly eventConsumer: EventConsumerService,
    private readonly transactionIngestion: TransactionIngestionService,
    private readonly logger: LoggerService,
  ) {}

  async onModuleInit() {
    this.logger.log('Starting transaction queue consumers');
    
    try {
      // Subscribe to transaction events (for all transactions that need processing)
      await this.eventConsumer.consumeTransactionEvents(
        this.handleTransactionEvent.bind(this),
        { noAck: false } // Enable acknowledgments for reliability
      );

      // Subscribe to NFT events specifically (for processed NFT activities)
      await this.eventConsumer.consumeNFTEvents(
        this.handleNFTEvent.bind(this),
        { noAck: false }
      );

      // Subscribe to ledger events (for ledger close processing)
      await this.eventConsumer.consumeLedgerEvents(
        this.handleLedgerEvent.bind(this),
        { noAck: false }
      );

      this.logger.log('Transaction queue consumers started successfully');
    } catch (error) {
      this.logger.error(
        'Failed to start transaction queue consumers',
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Handle raw transaction events from XRPL
   */
  private async handleTransactionEvent(
    event: QueueEvent,
    _message: amqplib.ConsumeMessage,
  ): Promise<void> {
    if (event.eventType !== EventType.TRANSACTION_VALIDATED) {
      this.logger.warn(`Unexpected event type: ${event.eventType}`);
      return;
    }

    const transactionEvent = event as TransactionEvent;
    
    try {
      this.logger.debug(
        `Processing transaction event from queue: ${transactionEvent.data.transaction.hash || 'unknown'}`,
      );
      
      // Process the raw transaction through the existing pipeline
      // The transaction ingestion service will parse and classify it
      await this.transactionIngestion.processRawTransaction(
        transactionEvent.data.transaction,
        transactionEvent.data.meta,
        transactionEvent.data.ledgerIndex,
      );
      
    } catch (error) {
      this.logger.error(
        `Failed to process transaction event ${transactionEvent.eventId}`,
        error instanceof Error ? error.message : String(error),
      );
      // Re-throw to trigger RabbitMQ retry mechanism
      throw error;
    }
  }

  /**
   * Handle processed NFT events
   */
  private async handleNFTEvent(
    event: QueueEvent,
    _message: amqplib.ConsumeMessage,
  ): Promise<void> {
    if (!this.isNFTEvent(event)) {
      this.logger.warn(`Unexpected event type: ${event.eventType}`);
      return;
    }

    const nftEvent = event as NFTEvent;
    
    try {
      this.logger.debug(
        `Processing NFT event from queue: ${nftEvent.eventType} for token ${nftEvent.data.nftokenId}`,
      );
      
      // This could trigger additional processing like:
      // - Metadata enrichment
      // - Alert matching
      // - Analytics updates
      await this.processNFTEvent(nftEvent);
      
    } catch (error) {
      this.logger.error(
        `Failed to process NFT event ${nftEvent.eventId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Handle ledger close events
   */
  private async handleLedgerEvent(
    event: QueueEvent,
    _message: amqplib.ConsumeMessage,
  ): Promise<void> {
    if (event.eventType !== EventType.LEDGER_CLOSED) {
      this.logger.warn(`Unexpected event type: ${event.eventType}`);
      return;
    }

    const ledgerEvent = event as LedgerEvent;
    
    try {
      this.logger.debug(
        `Processing ledger event from queue: ${ledgerEvent.data.ledgerIndex} (${ledgerEvent.data.ledgerHash})`,
      );
      
      // Process the ledger close event
      // This could include:
      // - Updating ledger sync status
      // - Triggering batch processing for missed transactions
      // - Monitoring ledger progression
      await this.processLedgerEvent(ledgerEvent);
      
    } catch (error) {
      this.logger.error(
        `Failed to process ledger event ${ledgerEvent.eventId}`,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  private isNFTEvent(event: QueueEvent): boolean {
    return [
      EventType.NFT_MINTED,
      EventType.NFT_BURNED,
      EventType.NFT_OFFER_CREATED,
      EventType.NFT_OFFER_CANCELLED,
      EventType.NFT_OFFER_ACCEPTED,
    ].includes(event.eventType as EventType);
  }

  private async processNFTEvent(nftEvent: NFTEvent): Promise<void> {
    // Placeholder for additional NFT event processing
    // This could include:
    // - Triggering metadata enrichment for new mints
    // - Running alert matching for sales/offers
    // - Updating analytics/statistics
    
    this.logger.debug(`Processed NFT event: ${nftEvent.eventType}`);
  }

  private async processLedgerEvent(ledgerEvent: LedgerEvent): Promise<void> {
    // Process ledger close events
    // This could include:
    // - Updating ledger sync status in the database
    // - Triggering any ledger-specific processing
    // - Monitoring ledger progression for health checks
    
    this.logger.debug(
      `Processed ledger close: ${ledgerEvent.data.ledgerIndex} with ${ledgerEvent.data.txnCount} transactions`
    );
    
    // You could potentially call the transaction ingestion service to update ledger status
    // For now, we'll just log it
    // TODO: Consider adding ledger-specific business logic here
  }
}