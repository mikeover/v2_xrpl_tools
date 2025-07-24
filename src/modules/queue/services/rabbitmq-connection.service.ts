import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as amqplib from 'amqplib';
import { LoggerService } from '../../../core/logger/logger.service';
import { AppConfiguration } from '../../../shared/config/configuration';
import { QUEUE_CONSTANTS, QUEUE_ERRORS } from '../constants/queue.constants';
import { ExchangeOptions, QueueOptions } from '../interfaces/queue.interface';

@Injectable()
export class RabbitMQConnectionService implements OnModuleInit, OnModuleDestroy {
  private connection: amqplib.Connection | null = null;
  private channel: amqplib.Channel | null = null;
  private connectionUrl: string;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly reconnectDelay = 5000;

  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService<AppConfiguration>,
  ) {
    const queueConfig = this.configService.get('queue', { infer: true });
    this.connectionUrl = queueConfig?.url || 'amqp://rabbitmq:rabbitmq@localhost:5672';
    this.logger.debug(
      `RabbitMQ connection URL: ${this.connectionUrl.replace(/\/\/.*@/, '//***@')}`,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.connect();
      await this.setupExchangesAndQueues();
    } catch (error) {
      this.logger.warn(
        'RabbitMQ connection failed during initialization - queue functionality disabled',
      );
      this.logger.debug(
        `RabbitMQ error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(): Promise<void> {
    try {
      this.logger.log('Connecting to RabbitMQ...');

      this.connection = await amqplib.connect(this.connectionUrl);
      this.channel = await this.connection.createChannel();

      // Set prefetch count for fair dispatch
      await this.channel.prefetch(QUEUE_CONSTANTS.DEFAULT_PREFETCH_COUNT);

      // Handle connection events
      this.connection.on('error', (error) => {
        this.logger.error(`RabbitMQ connection error: ${error.message}`);
        this.handleConnectionError();
      });

      this.connection.on('close', () => {
        this.logger.warn('RabbitMQ connection closed');
        this.handleConnectionError();
      });

      this.channel.on('error', (error) => {
        this.logger.error(`RabbitMQ channel error: ${error.message}`);
      });

      this.channel.on('close', () => {
        this.logger.warn('RabbitMQ channel closed');
      });

      this.reconnectAttempts = 0;
      this.logger.log('Successfully connected to RabbitMQ');
    } catch (error) {
      this.logger.error(
        `Failed to connect to RabbitMQ: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(QUEUE_ERRORS.CONNECTION_FAILED);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }

      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }

      this.logger.log('Disconnected from RabbitMQ');
    } catch (error) {
      this.logger.error(
        `Error disconnecting from RabbitMQ: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getChannel(): amqplib.Channel | null {
    return this.channel;
  }

  isConnected(): boolean {
    return this.connection !== null && this.channel !== null;
  }

  private async setupExchangesAndQueues(): Promise<void> {
    if (!this.channel) {
      throw new Error(QUEUE_ERRORS.CHANNEL_CREATION_FAILED);
    }

    try {
      // Create exchanges
      await this.assertExchange(QUEUE_CONSTANTS.EXCHANGES.XRPL, 'topic', { durable: true });
      await this.assertExchange(QUEUE_CONSTANTS.EXCHANGES.NOTIFICATIONS, 'direct', {
        durable: true,
      });
      await this.assertExchange(QUEUE_CONSTANTS.EXCHANGES.DEAD_LETTER, 'fanout', { durable: true });

      // Create dead letter queue first
      await this.assertQueue(QUEUE_CONSTANTS.QUEUES.DEAD_LETTER, {
        durable: true,
        arguments: {
          'x-message-ttl': QUEUE_CONSTANTS.DEAD_LETTER_TTL,
          'x-max-length': QUEUE_CONSTANTS.DEAD_LETTER_MAX_LENGTH,
        },
      });

      // Bind dead letter queue to dead letter exchange
      await this.channel.bindQueue(
        QUEUE_CONSTANTS.QUEUES.DEAD_LETTER,
        QUEUE_CONSTANTS.EXCHANGES.DEAD_LETTER,
        '',
      );

      // Create main queues with dead letter configuration
      const deadLetterArgs = {
        'x-dead-letter-exchange': QUEUE_CONSTANTS.EXCHANGES.DEAD_LETTER,
        'x-message-ttl': QUEUE_CONSTANTS.DEFAULT_MESSAGE_TTL,
      };

      // Ledger events queue
      await this.assertQueue(QUEUE_CONSTANTS.QUEUES.LEDGER_EVENTS, {
        durable: true,
        arguments: deadLetterArgs,
      });
      await this.channel.bindQueue(
        QUEUE_CONSTANTS.QUEUES.LEDGER_EVENTS,
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.LEDGER_CLOSED,
      );

      // Transaction events queue
      await this.assertQueue(QUEUE_CONSTANTS.QUEUES.TRANSACTION_EVENTS, {
        durable: true,
        arguments: deadLetterArgs,
      });
      await this.channel.bindQueue(
        QUEUE_CONSTANTS.QUEUES.TRANSACTION_EVENTS,
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.TRANSACTION_VALIDATED,
      );

      // NFT events queue
      await this.assertQueue(QUEUE_CONSTANTS.QUEUES.NFT_EVENTS, {
        durable: true,
        arguments: deadLetterArgs,
      });
      await this.channel.bindQueue(
        QUEUE_CONSTANTS.QUEUES.NFT_EVENTS,
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.NFT_ACTIVITY,
      );

      // Notifications queue
      await this.assertQueue(QUEUE_CONSTANTS.QUEUES.NOTIFICATIONS, {
        durable: true,
        arguments: {
          ...deadLetterArgs,
          'x-max-priority': 10, // Priority queue
        },
      });
      await this.channel.bindQueue(
        QUEUE_CONSTANTS.QUEUES.NOTIFICATIONS,
        QUEUE_CONSTANTS.EXCHANGES.NOTIFICATIONS,
        QUEUE_CONSTANTS.ROUTING_KEYS.NOTIFICATION,
      );

      this.logger.log('RabbitMQ exchanges and queues setup completed');
    } catch (error) {
      this.logger.error(
        `Failed to setup exchanges and queues: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  private async assertExchange(
    name: string,
    type: string,
    options: ExchangeOptions,
  ): Promise<void> {
    try {
      await this.channel!.assertExchange(name, type, options);
      this.logger.debug(`Exchange '${name}' (${type}) asserted`);
    } catch (error) {
      this.logger.error(
        `Failed to assert exchange '${name}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(QUEUE_ERRORS.EXCHANGE_ASSERTION_FAILED);
    }
  }

  private async assertQueue(name: string, options: QueueOptions): Promise<void> {
    try {
      await this.channel!.assertQueue(name, options);
      this.logger.debug(`Queue '${name}' asserted`);
    } catch (error) {
      this.logger.error(
        `Failed to assert queue '${name}': ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(QUEUE_ERRORS.QUEUE_ASSERTION_FAILED);
    }
  }

  private async handleConnectionError(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error('Max reconnection attempts reached. Giving up.');
      return;
    }

    this.reconnectAttempts++;
    this.logger.log(
      `Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
    );

    setTimeout(async () => {
      try {
        await this.connect();
        await this.setupExchangesAndQueues();
      } catch (error) {
        this.logger.error(
          `Reconnection attempt failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }
}
