import { Test, TestingModule } from '@nestjs/testing';
import { DiscordWebhookService } from './discord-webhook.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { NotificationPayload } from '../interfaces/notification.interface';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('DiscordWebhookService', () => {
  let service: DiscordWebhookService;

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
        DiscordWebhookService,
        {
          provide: LoggerService,
          useValue: mockLoggerService,
        },
      ],
    }).compile();

    service = module.get<DiscordWebhookService>(DiscordWebhookService);
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
        type: 'discord',
        enabled: true,
        config: {
          webhookUrl: 'https://discord.com/api/webhooks/123456/test-webhook',
        } as any,
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
      scheduledAt: new Date(),
      retryCount: 0,
      maxRetries: 3,
    };

    it('should send NFT sale notification successfully', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-123',
        },
      });

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: true,
        messageId: expect.any(String),
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/123456/test-webhook',
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining('NFT SALE'),
              description: expect.stringContaining('Cool Collection'),
              color: expect.any(Number),
              fields: expect.arrayContaining([
                expect.objectContaining({ name: 'From', value: '`rSeller123`' }),
                expect.objectContaining({ name: 'To', value: '`rBuyer456`' }),
                expect.objectContaining({ name: 'Price', value: '1000.000000 XRP' }),
                expect.objectContaining({ name: 'NFT Name', value: 'Cool NFT #123' }),
              ]),
              timestamp: expect.any(String),
            }),
          ]),
        }),
        expect.objectContaining({
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'XRPL-NFT-Monitor/1.0',
          },
          timeout: 10000,
        }),
      );
    });

    it('should send NFT mint notification successfully', async () => {
      const mintPayload = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          activityType: 'mint',
          fromAddress: 'rMinter123',
        },
      };
      delete mintPayload.data.priceDrops;

      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-456',
        },
      });

      const result = await service.sendNotification(mintPayload);

      expect(result.success).toBe(true);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining('NFT MINT'),
              description: expect.stringContaining('Cool Collection'),
              fields: expect.not.arrayContaining([
                expect.objectContaining({ name: 'Price' }),
              ]),
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should handle missing webhook URL', async () => {
      const payloadWithoutWebhook = {
        ...mockPayload,
        channel: {
          ...mockPayload.channel,
          config: {} as any,
        },
      };

      const result = await service.sendNotification(payloadWithoutWebhook);

      expect(result).toEqual({
        success: false,
        error: 'Discord webhook URL is not configured',
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle NFT without metadata', async () => {
      const payloadWithoutMetadata = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          nft: {
            ...mockPayload.data.nft!,
          },
        },
      };
      delete payloadWithoutMetadata.data.nft!.metadata;

      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-789',
        },
      });

      const result = await service.sendNotification(payloadWithoutMetadata);

      expect(result.success).toBe(true);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              description: expect.stringContaining('NFT789'), // Falls back to NFT ID
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should handle Discord API rate limiting', async () => {
      const rateLimitError = new Error('Rate limited');
      (rateLimitError as any).response = {
        status: 429,
        headers: {
          'retry-after': '5',
        },
        data: {
          retry_after: 5000,
        },
      };
      Object.defineProperty(rateLimitError, 'isAxiosError', { value: true });
      mockedAxios.post.mockRejectedValueOnce(rateLimitError);
      
      // Mock axios.isAxiosError to return true for our error
      jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'Rate limited',
        retryAfter: 5000,
      });
    });

    it('should handle Discord API errors', async () => {
      const apiError = new Error('HTTP 400: Bad Request');
      mockedAxios.post.mockRejectedValueOnce(apiError);

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'HTTP 400: Bad Request',
      });

      expect(mockLoggerService.error).toHaveBeenCalled();
    });

    it('should handle network errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'Network timeout',
      });
    });

    it('should format price correctly for different currencies', async () => {
      const usdPayload = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          priceDrops: '50000000', // 50 USDC
          currency: 'USD',
          issuer: 'rUSDCIssuer123',
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-usd',
        },
      });

      await service.sendNotification(usdPayload);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.arrayContaining([
                expect.objectContaining({
                  name: 'Price',
                  value: '50.000000 XRP',
                }),
              ]),
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should include image in embed when available', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-image',
        },
      });

      await service.sendNotification(mockPayload);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              thumbnail: {
                url: 'https://example.com/nft.png',
              },
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should truncate long descriptions', async () => {
      const longDescription = 'A'.repeat(500); // Very long description
      const payloadWithLongDescription = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          nft: {
            ...mockPayload.data.nft!,
            metadata: {
              ...mockPayload.data.nft!.metadata!,
              description: longDescription,
            },
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-long',
        },
      });

      await service.sendNotification(payloadWithLongDescription);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          embeds: expect.arrayContaining([
            expect.objectContaining({
              fields: expect.not.arrayContaining([
                expect.objectContaining({ name: 'Description' }),
              ]),
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should validate embed limits', async () => {
      const payloadWithManyFields = {
        ...mockPayload,
        data: {
          ...mockPayload.data,
          nft: {
            ...mockPayload.data.nft!,
            metadata: {
              ...mockPayload.data.nft!.metadata!,
              attributes: Array.from({ length: 30 }, (_, i) => ({
                trait_type: `Trait ${i}`,
                value: `Value ${i}`,
              })),
            },
          },
        },
      };

      mockedAxios.post.mockResolvedValueOnce({
        status: 204,
        statusText: 'No Content',
        headers: {
          'x-message-id': 'test-message-limits',
        },
      });

      await service.sendNotification(payloadWithManyFields);

      const callArgs = mockedAxios.post.mock.calls[0];
      const embed = (callArgs?.[1] as any)?.embeds?.[0];
      
      // Discord embed limits
      expect(embed.fields.length).toBeLessThanOrEqual(25);
      expect(embed.description.length).toBeLessThanOrEqual(4096);
    });
  });

  describe('validateWebhookUrl', () => {
    it('should validate correct Discord webhook URLs', () => {
      const validUrls = [
        'https://discord.com/api/webhooks/123456789/abcdefg',
        'https://discordapp.com/api/webhooks/987654321/hijklmn',
      ];

      validUrls.forEach((url) => {
        expect(service.validateWebhookUrl(url)).toBe(true);
      });
    });

    it('should reject invalid webhook URLs', () => {
      const invalidUrls = [
        'https://example.com/webhook',
        'http://discord.com/api/webhooks/123/abc', // HTTP instead of HTTPS
        'https://discord.com/api/webhooks/invalid',
        '',
      ];

      invalidUrls.forEach((url) => {
        expect(service.validateWebhookUrl(url)).toBe(false);
      });
    });
  });
});