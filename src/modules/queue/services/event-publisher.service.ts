import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { LoggerService } from '../../../core/logger/logger.service';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { QUEUE_CONSTANTS, QUEUE_ERRORS } from '../constants/queue.constants';
import {
  PublishOptions,
  QueueEvent,
  EventType,
  LedgerEvent,
  TransactionEvent,
  NFTEvent,
} from '../interfaces/queue.interface';

@Injectable()
export class EventPublisherService {
  constructor(
    private readonly logger: LoggerService,
    private readonly connectionService: RabbitMQConnectionService,
  ) {}

  async publishLedgerEvent(
    ledgerData: Omit<LedgerEvent['data'], never>,
    options?: PublishOptions,
  ): Promise<void> {
    const event: LedgerEvent = {
      eventId: uuidv4(),
      eventType: EventType.LEDGER_CLOSED,
      timestamp: new Date(),
      data: ledgerData,
    };

    await this.publishEvent(
      QUEUE_CONSTANTS.EXCHANGES.XRPL,
      QUEUE_CONSTANTS.ROUTING_KEYS.LEDGER_CLOSED,
      event,
      options,
    );
  }

  async publishTransactionEvent(
    transactionData: Omit<TransactionEvent['data'], never>,
    options?: PublishOptions,
  ): Promise<void> {
    const event: TransactionEvent = {
      eventId: uuidv4(),
      eventType: EventType.TRANSACTION_VALIDATED,
      timestamp: new Date(),
      data: transactionData,
    };

    await this.publishEvent(
      QUEUE_CONSTANTS.EXCHANGES.XRPL,
      QUEUE_CONSTANTS.ROUTING_KEYS.TRANSACTION_VALIDATED,
      event,
      options,
    );
  }

  async publishNFTEvent(
    eventType: NFTEvent['eventType'],
    nftData: Omit<NFTEvent['data'], never>,
    options?: PublishOptions,
  ): Promise<void> {
    const event: NFTEvent = {
      eventId: uuidv4(),
      eventType,
      timestamp: new Date(),
      data: nftData,
    };

    // Determine routing key based on event type
    const routingKey = eventType.replace('nft.', '');

    await this.publishEvent(QUEUE_CONSTANTS.EXCHANGES.XRPL, `nft.${routingKey}`, event, options);
  }

  async publishEvent(
    exchange: string,
    routingKey: string,
    event: QueueEvent,
    options?: PublishOptions,
  ): Promise<void> {
    try {
      const channel = this.connectionService.getChannel();
      if (!channel) {
        this.logger.debug('RabbitMQ not connected - skipping event publication');
        return;
      }

      const messageOptions = {
        persistent: options?.persistent ?? true,
        messageId: options?.messageId ?? event.eventId,
        timestamp: options?.timestamp ?? Date.now(),
        correlationId: options?.correlationId ?? event.correlationId,
        priority: options?.priority,
        expiration: options?.expiration,
        headers: {
          'x-event-type': event.eventType,
          'x-event-id': event.eventId,
          ...options?.headers,
        },
      };

      const messageBuffer = Buffer.from(JSON.stringify(event));

      const published = channel.publish(exchange, routingKey, messageBuffer, messageOptions);

      if (!published) {
        throw new Error('Channel buffer is full');
      }

      this.logger.debug(
        `Published event ${event.eventType} (${event.eventId}) to ${exchange}/${routingKey}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish event ${event.eventType}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(QUEUE_ERRORS.PUBLISH_FAILED);
    }
  }

  async publishBatch(
    exchange: string,
    routingKey: string,
    events: QueueEvent[],
    options?: PublishOptions,
  ): Promise<void> {
    try {
      const channel = this.connectionService.getChannel();
      if (!channel) {
        this.logger.debug('RabbitMQ not connected - skipping batch publication');
        return;
      }

      // Use channel flow control
      let canPublish = true;

      for (const event of events) {
        if (!canPublish) {
          // Wait for drain event
          await new Promise<void>((resolve) => {
            channel.once('drain', () => {
              canPublish = true;
              resolve();
            });
          });
        }

        const messageOptions = {
          persistent: options?.persistent ?? true,
          messageId: event.eventId,
          timestamp: Date.now(),
          correlationId: event.correlationId,
          priority: options?.priority,
          headers: {
            'x-event-type': event.eventType,
            'x-event-id': event.eventId,
            'x-batch': true,
            ...options?.headers,
          },
        };

        const messageBuffer = Buffer.from(JSON.stringify(event));

        canPublish = channel.publish(exchange, routingKey, messageBuffer, messageOptions);
      }

      this.logger.debug(`Published batch of ${events.length} events to ${exchange}/${routingKey}`);
    } catch (error) {
      this.logger.error(
        `Failed to publish batch: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(QUEUE_ERRORS.PUBLISH_FAILED);
    }
  }
}
