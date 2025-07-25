import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { XRPLConnectionManagerService } from './xrpl-connection-manager.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { EventPublisherService } from '../../queue/services/event-publisher.service';
import { XRPL_CONSTANTS } from '../constants/xrpl.constants';

describe('XRPLConnectionManagerService', () => {
  let service: XRPLConnectionManagerService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'xrpl') {
        return {
          nodes: [
            { url: 'wss://test1.example.com', priority: 1 },
            { url: 'wss://test2.example.com', priority: 2 },
          ],
          reconnectInterval: 5000,
          maxReconnectAttempts: 3,
          healthCheckInterval: 10000,
          connectionTimeout: 5000,
          maxConsecutiveFailures: 2,
        };
      }
      return null;
    }),
  };

  const mockEventPublisher = {
    publishConnectionEvent: jest.fn(),
    publishLedgerEvent: jest.fn(),
    publishTransactionEvent: jest.fn(),
    publishNFTEvent: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XRPLConnectionManagerService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EventPublisherService,
          useValue: mockEventPublisher,
        },
      ],
    }).compile();

    service = module.get<XRPLConnectionManagerService>(XRPLConnectionManagerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('addNode', () => {
    it('should add a valid WebSocket node', () => {
      const url = 'wss://new-node.example.com';
      const priority = 3;

      service.addNode(url, priority);

      expect(mockLoggerService.log).toHaveBeenCalledWith(
        `Added XRPL node: ${url} with priority ${priority}`,
      );
    });

    it('should throw error for invalid URL', () => {
      const invalidUrl = 'http://invalid.example.com';

      expect(() => service.addNode(invalidUrl, 1)).toThrow('Invalid XRPL node URL');
    });

    it('should throw error for empty URL', () => {
      expect(() => service.addNode('', 1)).toThrow('Invalid XRPL node URL');
    });
  });

  describe('removeNode', () => {
    it('should remove an existing node', () => {
      const url = 'wss://remove-me.example.com';
      service.addNode(url, 1);

      service.removeNode(url);

      expect(mockLoggerService.log).toHaveBeenCalledWith(`Removed XRPL node: ${url}`);
    });

    it('should handle removing non-existent node gracefully', () => {
      const url = 'wss://non-existent.example.com';

      expect(() => service.removeNode(url)).not.toThrow();
      expect(mockLoggerService.log).toHaveBeenCalledWith(`Removed XRPL node: ${url}`);
    });
  });

  describe('subscribeLedger', () => {
    it('should create a subscription with unique ID', () => {
      const callback = jest.fn();

      const subscription = service.subscribeLedger(callback);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.unsubscribe).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('should allow unsubscribing', () => {
      const callback = jest.fn();
      const subscription = service.subscribeLedger(callback);

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('subscribeTransactions', () => {
    it('should create a subscription with unique ID', () => {
      const callback = jest.fn();

      const subscription = service.subscribeTransactions(callback);

      expect(subscription).toBeDefined();
      expect(subscription.id).toBeDefined();
      expect(subscription.unsubscribe).toBeDefined();
      expect(typeof subscription.unsubscribe).toBe('function');
    });

    it('should allow unsubscribing', () => {
      const callback = jest.fn();
      const subscription = service.subscribeTransactions(callback);

      expect(() => subscription.unsubscribe()).not.toThrow();
    });
  });

  describe('getConnectionHealth', () => {
    it('should return connection health status', () => {
      service.addNode('wss://test1.example.com', 1);
      service.addNode('wss://test2.example.com', 2);

      const health = service.getConnectionHealth();

      expect(health).toBeDefined();
      expect(health.totalNodes).toBe(2);
      expect(health.nodes).toHaveLength(2);
      expect(health.nodes[0]?.url).toBe('wss://test1.example.com');
      expect(health.nodes[1]?.url).toBe('wss://test2.example.com');
    });

    it('should show all nodes as unhealthy initially', () => {
      service.addNode('wss://test.example.com', 1);

      const health = service.getConnectionHealth();

      expect(health.healthyNodes).toBe(0);
      expect(health.unhealthyNodes).toBe(1);
      expect(health.nodes[0]?.isHealthy).toBe(false);
    });
  });

  describe('detectLedgerGaps', () => {
    it('should return empty array when no gaps exist', () => {
      const gaps = service.detectLedgerGaps();

      expect(gaps).toEqual([]);
    });
  });

  describe('registerHealthCheck', () => {
    it('should register health check callback', () => {
      const callback = jest.fn();

      expect(() => service.registerHealthCheck(callback)).not.toThrow();
    });
  });

  describe('isConnected', () => {
    it('should return false when no nodes are healthy', () => {
      service.addNode('wss://test.example.com', 1);

      expect(service.isConnected()).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should use default values when config is not provided', () => {
      const serviceWithNoConfig = new XRPLConnectionManagerService(
        mockLoggerService as any,
        {
          get: jest.fn().mockReturnValue(null),
        } as any,
        mockEventPublisher as any,
      );

      expect(serviceWithNoConfig).toBeDefined();
      expect(serviceWithNoConfig['reconnectInterval']).toBe(
        XRPL_CONSTANTS.DEFAULT_RECONNECT_INTERVAL,
      );
      expect(serviceWithNoConfig['healthCheckIntervalMs']).toBe(
        XRPL_CONSTANTS.DEFAULT_HEALTH_CHECK_INTERVAL,
      );
      expect(serviceWithNoConfig['connectionTimeout']).toBe(
        XRPL_CONSTANTS.DEFAULT_CONNECTION_TIMEOUT,
      );
      expect(serviceWithNoConfig['maxConsecutiveFailures']).toBe(
        XRPL_CONSTANTS.DEFAULT_MAX_CONSECUTIVE_FAILURES,
      );
    });
  });
});
