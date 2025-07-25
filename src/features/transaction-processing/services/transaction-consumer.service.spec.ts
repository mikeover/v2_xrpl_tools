import { Test, TestingModule } from '@nestjs/testing';
import { TransactionConsumerService } from './transaction-consumer.service';
import { EventConsumerService } from '../../../modules/queue/services/event-consumer.service';
import { TransactionIngestionService } from './transaction-ingestion.service';
import { LoggerService } from '../../../core/logger/logger.service';

describe('TransactionConsumerService', () => {
  let service: TransactionConsumerService;
  let mockEventConsumer: jest.Mocked<EventConsumerService>;
  let mockTransactionIngestion: jest.Mocked<TransactionIngestionService>;
  let mockLogger: jest.Mocked<LoggerService>;

  beforeEach(async () => {
    mockEventConsumer = {
      consumeTransactionEvents: jest.fn(),
      consumeNFTEvents: jest.fn(),
      consumeLedgerEvents: jest.fn(),
    } as any;

    mockTransactionIngestion = {
      processRawTransaction: jest.fn(),
      startIngestion: jest.fn(),
      stopIngestion: jest.fn(),
      forceProcessBatch: jest.fn(),
      reprocessFailedTransactions: jest.fn(),
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
          provide: EventConsumerService,
          useValue: mockEventConsumer,
        },
        {
          provide: TransactionIngestionService,
          useValue: mockTransactionIngestion,
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
    it('should start all queue consumers successfully', async () => {
      mockEventConsumer.consumeTransactionEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);
      mockEventConsumer.consumeNFTEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);
      mockEventConsumer.consumeLedgerEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);

      await service.onModuleInit();

      expect(mockEventConsumer.consumeTransactionEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockEventConsumer.consumeNFTEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockEventConsumer.consumeLedgerEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockLogger.log).toHaveBeenCalledWith('Starting transaction queue consumers');
      expect(mockLogger.log).toHaveBeenCalledWith('Transaction queue consumers started successfully');
    });

    it('should handle consumer initialization errors', async () => {
      const error = new Error('Consumer setup failed');
      mockEventConsumer.consumeTransactionEvents.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Consumer setup failed');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start transaction queue consumers',
        'Consumer setup failed'
      );
    });

    it('should handle different types of errors during initialization', async () => {
      const errorString = 'String error';
      mockEventConsumer.consumeNFTEvents.mockRejectedValue(errorString);

      await expect(service.onModuleInit()).rejects.toBe(errorString);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start transaction queue consumers',
        'String error'
      );
    });

    it('should log appropriate messages during initialization', async () => {
      mockEventConsumer.consumeTransactionEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);
      mockEventConsumer.consumeNFTEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);
      mockEventConsumer.consumeLedgerEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);

      await service.onModuleInit();

      expect(mockLogger.log).toHaveBeenCalledTimes(2);
      expect(mockLogger.log).toHaveBeenNthCalledWith(1, 'Starting transaction queue consumers');
      expect(mockLogger.log).toHaveBeenNthCalledWith(2, 'Transaction queue consumers started successfully');
    });
  });

  describe('service integration', () => {
    it('should have all required dependencies injected', () => {
      expect(service).toBeDefined();
      expect(service['eventConsumer']).toBeDefined();
      expect(service['transactionIngestion']).toBeDefined();
      expect(service['logger']).toBeDefined();
    });

    it('should implement OnModuleInit interface', () => {
      expect(typeof service.onModuleInit).toBe('function');
    });

    it('should call consumer setup methods with correct parameters', async () => {
      mockEventConsumer.consumeTransactionEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);
      mockEventConsumer.consumeNFTEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);
      mockEventConsumer.consumeLedgerEvents.mockResolvedValue({ consumerTag: 'consumer-tag' } as any);

      await service.onModuleInit();

      // Verify that handlers are bound functions
      const transactionHandler = mockEventConsumer.consumeTransactionEvents.mock.calls[0]?.[0];
      const nftHandler = mockEventConsumer.consumeNFTEvents.mock.calls[0]?.[0];
      const ledgerHandler = mockEventConsumer.consumeLedgerEvents.mock.calls[0]?.[0];

      expect(typeof transactionHandler).toBe('function');
      expect(typeof nftHandler).toBe('function');
      expect(typeof ledgerHandler).toBe('function');

      // Verify options
      expect(mockEventConsumer.consumeTransactionEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockEventConsumer.consumeNFTEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
      expect(mockEventConsumer.consumeLedgerEvents).toHaveBeenCalledWith(
        expect.any(Function),
        { noAck: false }
      );
    });
  });

  describe('error handling', () => {
    it('should properly propagate errors from consumer setup', async () => {
      const testError = new Error('Test error for propagation');
      mockEventConsumer.consumeLedgerEvents.mockRejectedValue(testError);

      await expect(service.onModuleInit()).rejects.toThrow('Test error for propagation');
    });

    it('should handle consumer service failures gracefully', async () => {
      const error = new Error('Consumer service down');
      mockEventConsumer.consumeLedgerEvents.mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow('Consumer service down');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start transaction queue consumers',
        'Consumer service down'
      );
    });
  });
});