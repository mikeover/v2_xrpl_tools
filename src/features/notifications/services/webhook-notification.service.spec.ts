import { Test, TestingModule } from '@nestjs/testing';
import { WebhookNotificationService } from './webhook-notification.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { NotificationPayload, WebhookConfig } from '../interfaces/notification.interface';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('WebhookNotificationService', () => {
  let service: WebhookNotificationService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookNotificationService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<WebhookNotificationService>(WebhookNotificationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendNotification', () => {
    const mockPayload: NotificationPayload = {
      id: 'notification-123',
      userId: 'user-456',
      alertConfigId: 'alert-789',
      activityId: 'activity-101',
      channel: {
        type: 'webhook',
        enabled: true,
        config: {
          url: 'https://example.com/webhook',
          method: 'POST',
          headers: {
            'X-Custom-Header': 'test-value',
          },
        },
      },
      data: {
        activityType: 'sale',
        transactionHash: 'TX123ABC',
        ledgerIndex: 75000000,
        timestamp: new Date('2024-01-15T10:30:00Z'),
        fromAddress: 'rSeller123',
        toAddress: 'rBuyer456',
        priceDrops: '1000000000', // 1000 XRP
        currency: 'XRP',
        nft: {
          id: 'nft-1',
          nftId: 'NFT789',
          ownerAddress: 'rOwner123',
          metadata: {
            name: 'Cool NFT #123',
            description: 'A really cool NFT',
            image: 'https://example.com/nft.png',
          },
          imageUrl: 'https://example.com/nft.png',
          collection: {
            id: 'collection-1',
            name: 'Cool Collection',
            issuerAddress: 'rIssuer789',
            taxon: 1234,
          },
        },
      },
      scheduledAt: new Date('2024-01-15T10:30:00Z'),
      retryCount: 0,
      maxRetries: 3,
    };

    it('should send webhook notification successfully with POST', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {
          'x-message-id': 'webhook-message-123',
        },
        data: { received: true },
      });

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: true,
        messageId: 'webhook-message-123',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          webhook: {
            id: 'notification-123',
            timestamp: expect.any(String),
            type: 'nft_activity_alert',
            version: '1.0',
          },
          alert: {
            id: 'alert-789',
            userId: 'user-456',
            triggeredAt: '2024-01-15T10:30:00.000Z',
          },
          activity: expect.objectContaining({
            type: 'sale',
            transactionHash: 'TX123ABC',
            ledgerIndex: 75000000,
            fromAddress: 'rSeller123',
            toAddress: 'rBuyer456',
            priceDrops: '1000000000',
            priceXRP: '1000.000000',
            nft: expect.objectContaining({
              id: 'nft-1',
              nftId: 'NFT789',
              ownerAddress: 'rOwner123',
              metadata: {
                name: 'Cool NFT #123',
                description: 'A really cool NFT',
                image: 'https://example.com/nft.png',
              },
              collection: {
                id: 'collection-1',
                name: 'Cool Collection',
                issuerAddress: 'rIssuer789',
                taxon: 1234,
              },
            }),
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'XRPL-NFT-Monitor-Webhook/1.0',
            'X-Custom-Header': 'test-value',
          }),
          timeout: 15000,
        }),
      );
    });

    it('should send webhook notification with PUT method', async () => {
      const putPayload = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            ...mockPayload.channel.config,
            method: 'PUT' as const,
          },
        },
      };

      mockedAxios.put.mockResolvedValueOnce({
        status: 201,
        statusText: 'Created',
        headers: {},
        data: {},
      });

      const result = await service.sendNotification(putPayload);

      expect(result.success).toBe(true);
      expect(mockedAxios.put).toHaveBeenCalled();
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should send webhook notification with PATCH method', async () => {
      const patchPayload = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            ...mockPayload.channel.config,
            method: 'PATCH' as const,
          },
        },
      };

      mockedAxios.patch.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      const result = await service.sendNotification(patchPayload);

      expect(result.success).toBe(true);
      expect(mockedAxios.patch).toHaveBeenCalled();
    });

    it('should handle missing webhook URL', async () => {
      const payloadWithoutUrl = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            method: 'POST' as const,
            headers: {},
          } as any,
        },
      };

      const result = await service.sendNotification(payloadWithoutUrl);

      expect(result).toEqual({
        success: false,
        error: 'Webhook URL is not configured',
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle bearer token authentication', async () => {
      const payloadWithAuth = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            url: 'https://example.com/webhook',
            method: 'POST' as const,
            auth: {
              type: 'bearer' as const,
              token: 'test-bearer-token',
            },
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      await service.sendNotification(payloadWithAuth);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-bearer-token',
          }),
        }),
      );
    });

    it('should handle basic authentication', async () => {
      const payloadWithBasicAuth = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            url: 'https://example.com/webhook',
            method: 'POST' as const,
            auth: {
              type: 'basic' as const,
              username: 'testuser',
              password: 'testpass',
            },
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      await service.sendNotification(payloadWithBasicAuth);

      const expectedAuth = Buffer.from('testuser:testpass').toString('base64');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': `Basic ${expectedAuth}`,
          }),
        }),
      );
    });

    it('should handle API key authentication', async () => {
      const payloadWithApiKey = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            url: 'https://example.com/webhook',
            method: 'POST' as const,
            auth: {
              type: 'api-key' as const,
              token: 'test-api-key',
              headerName: 'X-API-Key',
            },
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      await service.sendNotification(payloadWithApiKey);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key',
          }),
        }),
      );
    });

    it('should handle mint activity without price information', async () => {
      const mintPayload = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          activityType: 'mint',
          fromAddress: 'rMinter123',
        },
      };
      delete mintPayload.data.priceDrops;
      delete mintPayload.data.toAddress;

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      await service.sendNotification(mintPayload);

      const callArgs = mockedAxios.post.mock.calls[0];
      const webhookPayload = callArgs?.[1] as any;

      expect(webhookPayload.activity.type).toBe('mint');
      expect(webhookPayload.activity.fromAddress).toBe('rMinter123');
      expect(webhookPayload.activity.priceDrops).toBeUndefined();
      expect(webhookPayload.activity.priceXRP).toBeUndefined();
      expect(webhookPayload.activity.toAddress).toBeUndefined();
    });

    it('should handle NFT without metadata or collection', async () => {
      const payloadWithoutMetadata = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          nft: {
            id: 'nft-1',
            nftId: 'NFT789',
            ownerAddress: 'rOwner123',
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      await service.sendNotification(payloadWithoutMetadata);

      const callArgs = mockedAxios.post.mock.calls[0];
      const webhookPayload = callArgs?.[1] as any;

      expect(webhookPayload.activity.nft).toEqual({
        id: 'nft-1',
        nftId: 'NFT789',
        ownerAddress: 'rOwner123',
      });
    });

    it('should handle webhook rate limiting', async () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).response = {
        status: 429,
        headers: {
          'retry-after': '30',
        },
      };
      Object.defineProperty(rateLimitError, 'isAxiosError', { value: true });
      mockedAxios.post.mockRejectedValueOnce(rateLimitError);
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'Rate limited',
        retryAfter: 30000,
      });
    });

    it('should handle webhook HTTP errors', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 400,
        statusText: 'Bad Request',
        headers: {},
        data: { error: 'Invalid payload' },
      });

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'HTTP 400: Bad Request',
      });

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.stringContaining('Failed to send webhook notification for activity activity-101')
      );
    });

    it('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'Network timeout',
      });
    });

    it('should handle unsupported HTTP methods', async () => {
      const payloadWithInvalidMethod = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {
            url: 'https://example.com/webhook',
            method: 'DELETE' as any,
          },
        },
      };

      const result = await service.sendNotification(payloadWithInvalidMethod);

      expect(result).toEqual({
        success: false,
        error: 'Unsupported HTTP method: DELETE',
      });
    });

    it('should use fallback message ID when response headers are missing', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: {},
      });

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: true,
        messageId: 'unknown',
      });
    });

    it('should prefer x-message-id over x-request-id', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {
          'x-message-id': 'message-123',
          'x-request-id': 'request-456',
        },
        data: {},
      });

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: true,
        messageId: 'message-123',
      });
    });
  });

  describe('testWebhook', () => {
    const testConfig: WebhookConfig = {
      url: 'https://example.com/test-webhook',
      method: 'POST',
      headers: {
        'X-Test': 'true',
      },
    };

    it('should send test webhook successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        statusText: 'OK',
        headers: {},
        data: { test: 'received' },
      });

      const result = await service.testWebhook(testConfig);

      expect(result).toEqual({
        success: true,
        messageId: 'test-webhook',
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://example.com/test-webhook',
        expect.objectContaining({
          webhook: {
            id: 'test-webhook',
            timestamp: expect.any(String),
            type: 'test',
            version: '1.0',
          },
          message: 'This is a test webhook from XRPL NFT Monitor',
          test: true,
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'XRPL-NFT-Monitor-Webhook/1.0',
            'X-Test': 'true',
          }),
        }),
      );
    });

    it('should handle test webhook failures', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await service.testWebhook(testConfig);

      expect(result).toEqual({
        success: false,
        error: 'Connection refused',
      });
    });
  });

  describe('URL validation', () => {
    it('should validate correct webhook URLs', () => {
      const validUrls = [
        'https://example.com/webhook',
        'http://localhost:3000/webhook',
        'https://api.service.com/v1/webhooks/12345',
        'http://192.168.1.100:8080/webhook',
      ];

      validUrls.forEach(url => {
        expect(service.validateWebhookUrl(url)).toBe(true);
      });
    });

    it('should reject invalid webhook URLs', () => {
      const invalidUrls = [
        'ftp://example.com/webhook',
        'invalid-url',
        '',
        'mailto:test@example.com',
        'javascript:alert(1)',
      ];

      invalidUrls.forEach(url => {
        expect(service.validateWebhookUrl(url)).toBe(false);
      });
    });
  });

  describe('configuration validation', () => {
    it('should validate correct webhook configuration', () => {
      const validConfig: WebhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST',
        headers: {
          'X-Custom': 'value',
        },
        auth: {
          type: 'bearer',
          token: 'test-token',
        },
      };

      const result = service.validateWebhookConfig(validConfig);

      expect(result).toEqual({
        valid: true,
        errors: [],
      });
    });

    it('should detect missing URL', () => {
      const invalidConfig = {
        method: 'POST',
      } as WebhookConfig;

      const result = service.validateWebhookConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Webhook URL is required');
    });

    it('should detect invalid URL format', () => {
      const invalidConfig: WebhookConfig = {
        url: 'invalid-url',
        method: 'POST',
      };

      const result = service.validateWebhookConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid webhook URL format');
    });

    it('should detect invalid HTTP method', () => {
      const invalidConfig: WebhookConfig = {
        url: 'https://example.com/webhook',
        method: 'DELETE' as any,
      };

      const result = service.validateWebhookConfig(invalidConfig);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid HTTP method. Must be one of: POST, PUT, PATCH');
    });

    it('should validate bearer authentication', () => {
      const configWithoutToken: WebhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST',
        auth: {
          type: 'bearer',
        },
      };

      const result = service.validateWebhookConfig(configWithoutToken);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Bearer token is required for bearer authentication');
    });

    it('should validate basic authentication', () => {
      const configWithoutCredentials: WebhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST',
        auth: {
          type: 'basic',
          username: 'user',
        },
      };

      const result = service.validateWebhookConfig(configWithoutCredentials);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Username and password are required for basic authentication');
    });

    it('should validate API key authentication', () => {
      const configWithoutHeaderName: WebhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST',
        auth: {
          type: 'api-key',
          token: 'test-key',
        },
      };

      const result = service.validateWebhookConfig(configWithoutHeaderName);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Token and header name are required for API key authentication');
    });

    it('should detect invalid authentication type', () => {
      const configWithInvalidAuth: WebhookConfig = {
        url: 'https://example.com/webhook',
        method: 'POST',
        auth: {
          type: 'oauth' as any,
        },
      };

      const result = service.validateWebhookConfig(configWithInvalidAuth);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid authentication type. Must be: bearer, basic, or api-key');
    });
  });

  describe('parseWebhookResponse', () => {
    it('should parse webhook response correctly', () => {
      const mockResponse = {
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'value',
        },
        data: {
          id: 'created-resource',
          status: 'success',
        },
      } as any;

      const result = service.parseWebhookResponse(mockResponse);

      expect(result).toEqual({
        status: 201,
        statusText: 'Created',
        headers: {
          'content-type': 'application/json',
          'x-custom-header': 'value',
        },
        data: {
          id: 'created-resource',
          status: 'success',
        },
      });
    });
  });
});