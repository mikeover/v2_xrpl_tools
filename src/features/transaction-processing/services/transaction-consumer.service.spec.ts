import { Test, TestingModule } from '@nestjs/testing';
import { TransactionConsumerService } from './transaction-consumer.service';
import { NFTTransactionParserService } from './nft-transaction-parser.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { EventConsumerService } from '../../../modules/queue/services/event-consumer.service';
import { EventPublisherService } from '../../../modules/queue/services/event-publisher.service';
import { TestDataFactory } from '../../../test/utils/test-data-factory';
import { XRPLTransactionStreamMessage } from '../../../shared/types/xrpl-stream.types';
import { QueueEvent } from '../../../modules/queue/interfaces/queue.interface';
import * as amqplib from 'amqplib';

describe('TransactionConsumerService', () => {
  let service: TransactionConsumerService;
  let mockNftParser: jest.Mocked<NFTTransactionParserService>;
  let mockEventConsumer: jest.Mocked<EventConsumerService>;
  let mockEventPublisher: jest.Mocked<EventPublisherService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    mockNftParser = {
      parseTransaction: jest.fn(),
      isNFTTransaction: jest.fn(),
    } as any;

    mockEventConsumer = {
      consumeTransactionEvents: jest.fn(),
      consumeLedgerEvents: jest.fn(),
    } as any;

    mockEventPublisher = {
      publishNFTEvent: jest.fn(),
    } as any;

    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionConsumerService,
        {
          provide: NFTTransactionParserService,
          useValue: mockNftParser,
        },
        {
          provide: EventConsumerService,
          useValue: mockEventConsumer,
        },
        {
          provide: EventPublisherService,
          useValue: mockEventPublisher,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get<TransactionConsumerService>(TransactionConsumerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should start consuming both transaction and ledger events', async () => {
      await service.onModuleInit();

      expect(mockEventConsumer.consumeTransactionEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockEventConsumer.consumeLedgerEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        'TransactionConsumerService started - consuming transaction and ledger events'
      );
    });

    it('should handle consumer initialization errors', async () => {
      const error = new Error('Consumer initialization failed');
      mockEventConsumer.consumeTransactionEvents.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Consumer initialization failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start TransactionConsumerService',
        error.stack
      );
    });
  });

  describe('handleTransactionEvent', () => {
    let mockMessage: amqplib.ConsumeMessage;
    let transactionEvent: QueueEvent;

    beforeEach(() => {
      mockMessage = {
        fields: { deliveryTag: 1 },
        properties: {},
      } as amqplib.ConsumeMessage;

      const streamMessage = TestDataFactory.createNFTMintTransaction();
      transactionEvent = {
        eventId: 'test-event-1',
        eventType: 'transaction.validated' as any,
        timestamp: new Date(),
        data: streamMessage,
      };
    });

    it('should process NFT transactions and publish events', async () => {
      const nftData = TestDataFactory.createNFTTransactionData();
      mockNftParser.isNFTTransaction.mockReturnValue(true);
      mockNftParser.parseTransaction.mockResolvedValue(nftData);

      await service['handleTransactionEvent'](transactionEvent, mockMessage);

      expect(mockNftParser.isNFTTransaction).toHaveBeenCalledWith(
        transactionEvent.data.transaction
      );
      expect(mockNftParser.parseTransaction).toHaveBeenCalledWith(transactionEvent.data);
      expect(mockEventPublisher.publishNFTEvent).toHaveBeenCalledWith(
        'nft.activity',
        nftData
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Processed NFT transaction: ${transactionEvent.data.transaction.hash}`
      );
    });

    it('should skip non-NFT transactions', async () => {
      mockNftParser.isNFTTransaction.mockReturnValue(false);

      await service['handleTransactionEvent'](transactionEvent, mockMessage);

      expect(mockNftParser.isNFTTransaction).toHaveBeenCalledWith(
        transactionEvent.data.transaction
      );
      expect(mockNftParser.parseTransaction).not.toHaveBeenCalled();
      expect(mockEventPublisher.publishNFTEvent).not.toHaveBeenCalled();
      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Skipping non-NFT transaction: ${transactionEvent.data.transaction.hash}`
      );
    });

    it('should handle NFT parsing errors gracefully', async () => {
      const error = new Error('Parsing failed');
      mockNftParser.isNFTTransaction.mockReturnValue(true);
      mockNftParser.parseTransaction.mockRejectedValue(error);

      await service['handleTransactionEvent'](transactionEvent, mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        `Error processing transaction ${transactionEvent.data.transaction.hash}:`,
        error.stack
      );
      expect(mockEventPublisher.publishNFTEvent).not.toHaveBeenCalled();
    });

    it('should handle invalid transaction data', async () => {
      const invalidEvent = {
        ...transactionEvent,
        data: { transaction: null, meta: null } as any,
      };

      await service['handleTransactionEvent'](invalidEvent, mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid transaction data received:',
        expect.any(String)
      );
      expect(mockNftParser.isNFTTransaction).not.toHaveBeenCalled();
    });
  });

  describe('handleLedgerEvent', () => {
    let mockMessage: amqplib.ConsumeMessage;
    let ledgerEvent: QueueEvent;

    beforeEach(() => {
      mockMessage = {
        fields: { deliveryTag: 1 },
        properties: {},
      } as amqplib.ConsumeMessage;

      ledgerEvent = {
        eventId: 'ledger-event-1',
        eventType: 'ledger.closed' as any,
        timestamp: new Date(),
        data: {
          ledgerIndex: 75000000,
          ledgerHash: 'ABC123DEF456',
          ledgerTime: Math.floor(Date.now() / 1000),
          txnCount: 42,
          validatedLedgerIndex: 74999999,
        },
      };
    });

    it('should process ledger close events', async () => {
      await service['handleLedgerEvent'](ledgerEvent, mockMessage);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Processed ledger close: ${ledgerEvent.data.ledgerIndex} with ${ledgerEvent.data.txnCount} transactions`
      );
    });

    it('should handle ledger processing errors', async () => {
      const invalidLedgerEvent = {
        ...ledgerEvent,
        data: null,
      };

      await service['handleLedgerEvent'](invalidLedgerEvent, mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing ledger event:',
        expect.any(String)
      );
    });

    it('should log ledger statistics correctly', async () => {
      const highTxnLedger = {
        ...ledgerEvent,
        data: {
          ...ledgerEvent.data,
          txnCount: 1500,
        },
      };

      await service['handleLedgerEvent'](highTxnLedger, mockMessage);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        `Processed ledger close: ${highTxnLedger.data.ledgerIndex} with ${highTxnLedger.data.txnCount} transactions`
      );
    });
  });

  describe('error scenarios', () => {
    it('should handle missing event data gracefully', async () => {
      const invalidEvent = {} as QueueEvent;
      const mockMessage = {} as amqplib.ConsumeMessage;

      await service['handleTransactionEvent'](invalidEvent, mockMessage);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Invalid transaction data received:',
        expect.any(String)
      );
    });

    it('should handle consumer service failures during initialization', async () => {
      mockEventConsumer.consumeTransactionEvents.mockRejectedValue(
        new Error('RabbitMQ connection failed')
      );

      await expect(service.onModuleInit()).rejects.toThrow('RabbitMQ connection failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start TransactionConsumerService',
        expect.any(String)
      );
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple transaction types in sequence', async () => {
      const mockMessage = { fields: { deliveryTag: 1 } } as amqplib.ConsumeMessage;
      
      // NFT Mint Transaction
      const mintTransaction = TestDataFactory.createNFTMintTransaction();
      const mintEvent = {
        eventId: 'mint-1',
        eventType: 'transaction.validated' as any,
        timestamp: new Date(),
        data: mintTransaction,
      };

      // NFT Sale Transaction
      const saleTransaction = TestDataFactory.createNFTSaleTransaction();
      const saleEvent = {
        eventId: 'sale-1',
        eventType: 'transaction.validated' as any,
        timestamp: new Date(),
        data: saleTransaction,
      };

      mockNftParser.isNFTTransaction.mockReturnValue(true);
      mockNftParser.parseTransaction
        .mockResolvedValueOnce(TestDataFactory.createNFTTransactionData({ activityType: 'mint' as any }))
        .mockResolvedValueOnce(TestDataFactory.createNFTTransactionData({ activityType: 'sale' as any }));

      await service['handleTransactionEvent'](mintEvent, mockMessage);
      await service['handleTransactionEvent'](saleEvent, mockMessage);

      expect(mockNftParser.parseTransaction).toHaveBeenCalledTimes(2);
      expect(mockEventPublisher.publishNFTEvent).toHaveBeenCalledTimes(2);
    });
  });
});