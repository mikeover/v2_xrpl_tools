import { Injectable, OnModuleDestroy } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { LoggerService } from '../../../core/logger/logger.service';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { QUEUE_CONSTANTS, QUEUE_ERRORS } from '../constants/queue.constants';
import { ConsumeOptions, QueueEvent } from '../interfaces/queue.interface';

export type MessageHandler<T = QueueEvent> = (
  event: T,
  message: amqplib.ConsumeMessage,
) => Promise<void>;

export interface ConsumerTag {
  queue: string;
  consumerTag: string;
}

@Injectable()
export class EventConsumerService implements OnModuleDestroy {
  private consumers: Map<string, ConsumerTag> = new Map();

  constructor(
    private readonly logger: LoggerService,
    private readonly connectionService: RabbitMQConnectionService,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await this.cancelAllConsumers();
  }

  async consumeLedgerEvents(
    handler: MessageHandler,
    options?: ConsumeOptions,
  ): Promise<ConsumerTag> {
    return this.consume(QUEUE_CONSTANTS.QUEUES.LEDGER_EVENTS, handler, options);
  }

  async consumeTransactionEvents(
    handler: MessageHandler,
    options?: ConsumeOptions,
  ): Promise<ConsumerTag> {
    return this.consume(QUEUE_CONSTANTS.QUEUES.TRANSACTION_EVENTS, handler, options);
  }

  async consumeNFTEvents(handler: MessageHandler, options?: ConsumeOptions): Promise<ConsumerTag> {
    return this.consume(QUEUE_CONSTANTS.QUEUES.NFT_EVENTS, handler, options);
  }

  async consume(
    queue: string,
    handler: MessageHandler,
    options?: ConsumeOptions,
  ): Promise<ConsumerTag> {
    try {
      const channel = this.connectionService.getChannel();
      if (!channel) {
        this.logger.warn('RabbitMQ not connected - cannot start consumer');
        throw new Error(QUEUE_ERRORS.CONSUME_FAILED);
      }

      const consumerOptions = {
        noAck: options?.noAck ?? false,
        exclusive: options?.exclusive ?? false,
        priority: options?.priority,
        arguments: options?.arguments,
      };

      const { consumerTag } = await channel.consume(
        queue,
        async (message) => {
          if (!message) {
            return;
          }

          try {
            const event = JSON.parse(message.content.toString()) as QueueEvent;

            this.logger.debug(
              `Processing event ${event.eventType} (${event.eventId}) from ${queue}`,
            );

            await handler(event, message);

            // Acknowledge message if not in noAck mode
            if (!consumerOptions.noAck) {
              channel.ack(message);
            }
          } catch (error) {
            this.logger.error(
              `Error processing message from ${queue}: ${error instanceof Error ? error.message : String(error)}`,
            );

            // Handle message based on error and retry count
            if (!consumerOptions.noAck) {
              const retryCount = this.getRetryCount(message);

              if (retryCount < QUEUE_CONSTANTS.DEFAULT_RETRY_ATTEMPTS) {
                // Requeue with incremented retry count
                await this.requeueWithRetry(channel, message, queue, retryCount + 1);
              } else {
                // Max retries reached, reject and send to DLQ
                channel.reject(message, false);
                this.logger.warn(
                  `Message ${message.properties.messageId} sent to dead letter queue after ${retryCount} retries`,
                );
              }
            }
          }
        },
        consumerOptions,
      );

      const tag: ConsumerTag = { queue, consumerTag };
      this.consumers.set(consumerTag, tag);

      this.logger.log(`Started consuming from queue '${queue}' with tag '${consumerTag}'`);

      return tag;
    } catch (error) {
      this.logger.error(
        `Failed to start consumer for ${queue}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(QUEUE_ERRORS.CONSUME_FAILED);
    }
  }

  async cancelConsumer(consumerTag: string): Promise<void> {
    try {
      const channel = this.connectionService.getChannel();
      if (!channel) {
        this.logger.warn('RabbitMQ not connected - cannot cancel consumer');
        return;
      }
      await channel.cancel(consumerTag);

      const tag = this.consumers.get(consumerTag);
      if (tag) {
        this.consumers.delete(consumerTag);
        this.logger.log(`Cancelled consumer '${consumerTag}' for queue '${tag.queue}'`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to cancel consumer ${consumerTag}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async cancelAllConsumers(): Promise<void> {
    const promises = Array.from(this.consumers.keys()).map((tag) => this.cancelConsumer(tag));
    await Promise.all(promises);
  }

  private getRetryCount(message: amqplib.ConsumeMessage): number {
    const headers = message.properties.headers;
    return headers?.['x-retry-count'] || 0;
  }

  private async requeueWithRetry(
    channel: amqplib.Channel,
    message: amqplib.ConsumeMessage,
    queue: string,
    retryCount: number,
  ): Promise<void> {
    try {
      // Calculate delay with exponential backoff
      const delay = Math.min(
        QUEUE_CONSTANTS.DEFAULT_RETRY_DELAY * Math.pow(2, retryCount - 1),
        QUEUE_CONSTANTS.MAX_RETRY_DELAY,
      );

      // Create a delayed message using a temporary queue with TTL
      const tempQueue = `${queue}.retry.${retryCount}.${Date.now()}`;

      await channel.assertQueue(tempQueue, {
        durable: false,
        autoDelete: true,
        expires: delay + 10000, // Queue expires 10s after TTL
        arguments: {
          'x-dead-letter-exchange': '',
          'x-dead-letter-routing-key': queue,
          'x-message-ttl': delay,
        },
      });

      // Publish to temporary queue with updated retry count
      const updatedHeaders = {
        ...message.properties.headers,
        'x-retry-count': retryCount,
        'x-original-queue': queue,
      };

      channel.sendToQueue(tempQueue, message.content, {
        ...message.properties,
        headers: updatedHeaders,
      });

      // Acknowledge original message
      channel.ack(message);

      this.logger.debug(
        `Message ${message.properties.messageId} requeued with ${delay}ms delay (retry ${retryCount})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to requeue message: ${error instanceof Error ? error.message : String(error)}`,
      );
      // If requeue fails, reject the message
      channel.reject(message, false);
    }
  }
}
