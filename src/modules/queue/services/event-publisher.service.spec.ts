import { Test, TestingModule } from '@nestjs/testing';
import { EventPublisherService } from './event-publisher.service';
import { RabbitMQConnectionService } from './rabbitmq-connection.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { QUEUE_CONSTANTS } from '../constants/queue.constants';
import { EventType } from '../interfaces/queue.interface';

describe('EventPublisherService', () => {
  let service: EventPublisherService;
  let mockChannel: any;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    mockChannel = {
      publish: jest.fn().mockReturnValue(true),
      once: jest.fn(),
    };

    const mockConnectionService = {
      getChannel: jest.fn().mockReturnValue(mockChannel),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventPublisherService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: RabbitMQConnectionService,
          useValue: mockConnectionService,
        },
      ],
    }).compile();

    service = module.get<EventPublisherService>(EventPublisherService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('publishLedgerEvent', () => {
    it('should publish ledger event to correct exchange and routing key', async () => {
      const ledgerData = {
        ledgerIndex: 1000,
        ledgerHash: 'ABC123',
        ledgerTime: 123456789,
        txnCount: 5,
        validatedLedgerIndex: 999,
      };

      await service.publishLedgerEvent(ledgerData);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.LEDGER_CLOSED,
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-event-type': EventType.LEDGER_CLOSED,
          }),
        }),
      );
    });
  });

  describe('publishTransactionEvent', () => {
    it('should publish transaction event to correct exchange and routing key', async () => {
      const transactionData = {
        transaction: { Account: 'rTest123' },
        meta: { TransactionResult: 'tesSUCCESS' },
        ledgerIndex: 1000,
        ledgerHash: 'ABC123',
        validated: true,
      };

      await service.publishTransactionEvent(transactionData);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.TRANSACTION_VALIDATED,
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-event-type': EventType.TRANSACTION_VALIDATED,
          }),
        }),
      );
    });
  });

  describe('publishNFTEvent', () => {
    it('should publish NFT event with correct routing key', async () => {
      const nftData = {
        nftokenId: 'NFT123',
        issuer: 'rIssuer123',
        transactionHash: 'TX123',
        ledgerIndex: 1000,
      };

      await service.publishNFTEvent(EventType.NFT_MINTED, nftData);

      expect(mockChannel.publish).toHaveBeenCalledWith(
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        'nft.minted',
        expect.any(Buffer),
        expect.objectContaining({
          persistent: true,
          headers: expect.objectContaining({
            'x-event-type': EventType.NFT_MINTED,
          }),
        }),
      );
    });
  });

  describe('publishBatch', () => {
    it('should publish multiple events', async () => {
      const events = [
        {
          eventId: '1',
          eventType: EventType.LEDGER_CLOSED,
          timestamp: new Date(),
          data: { ledgerIndex: 1 },
        },
        {
          eventId: '2',
          eventType: EventType.LEDGER_CLOSED,
          timestamp: new Date(),
          data: { ledgerIndex: 2 },
        },
      ];

      await service.publishBatch(
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.LEDGER_CLOSED,
        events as any,
      );

      expect(mockChannel.publish).toHaveBeenCalledTimes(2);
    });

    it('should handle flow control when channel buffer is full', async () => {
      mockChannel.publish
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      // Mock the drain event to resolve immediately
      mockChannel.once.mockImplementation((event: string, callback: () => void) => {
        if (event === 'drain') {
          setTimeout(callback, 0);
        }
      });

      const events = Array(3).fill({
        eventId: '1',
        eventType: EventType.LEDGER_CLOSED,
        timestamp: new Date(),
        data: { ledgerIndex: 1 },
      });

      await service.publishBatch(
        QUEUE_CONSTANTS.EXCHANGES.XRPL,
        QUEUE_CONSTANTS.ROUTING_KEYS.LEDGER_CLOSED,
        events as any,
      );

      expect(mockChannel.once).toHaveBeenCalledWith('drain', expect.any(Function));
      expect(mockChannel.publish).toHaveBeenCalledTimes(3);
    });
  });

  describe('error handling', () => {
    it('should throw error when publish fails', async () => {
      mockChannel.publish.mockImplementation(() => {
        throw new Error('Publish failed');
      });

      const ledgerData = {
        ledgerIndex: 1000,
        ledgerHash: 'ABC123',
        ledgerTime: 123456789,
        txnCount: 5,
        validatedLedgerIndex: 999,
      };

      await expect(service.publishLedgerEvent(ledgerData)).rejects.toThrow(
        'Failed to publish message to queue',
      );

      expect(mockLoggerService.error).toHaveBeenCalled();
    });
  });
});