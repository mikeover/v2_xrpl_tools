import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmailNotificationService } from './email-notification.service';
import { LoggerService } from '../../../core/logger/logger.service';
import { NotificationPayload } from '../interfaces/notification.interface';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('EmailNotificationService', () => {
  let service: EmailNotificationService;

  const mockLoggerService = {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  };

  const mockConfigWithSendGrid = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'email') {
        return {
          sendgridApiKey: 'SG.test-api-key',
          from: 'test@example.com',
        };
      }
      return null;
    }),
  };

  const mockConfigWithoutSendGrid = {
    get: jest.fn().mockImplementation(() => null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
  });

  describe('with SendGrid configuration', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailNotificationService,
          {
            provide: LoggerService,
            useValue: mockLoggerService,
          },
          {
            provide: ConfigService,
            useValue: mockConfigWithSendGrid,
          },
        ],
      }).compile();

      service = module.get<EmailNotificationService>(EmailNotificationService);
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
          type: 'email',
          enabled: true,
          config: {
            recipients: ['test@example.com', 'admin@example.com'],
            subject: 'Custom NFT Alert',
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
        scheduledAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
      };

      it('should send email notification successfully', async () => {
        mockedAxios.post.mockResolvedValueOnce({
          status: 202,
          statusText: 'Accepted',
          headers: {
            'x-message-id': 'sendgrid-message-123',
          },
        });

        const result = await service.sendNotification(mockPayload);

        expect(result).toEqual({
          success: true,
          messageId: 'sendgrid-message-123',
        });

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'https://api.sendgrid.com/v3/mail/send',
          expect.objectContaining({
            personalizations: [
              {
                to: [
                  { email: 'test@example.com' },
                  { email: 'admin@example.com' },
                ],
                subject: 'Custom NFT Alert',
              },
            ],
            from: {
              email: 'test@example.com',
              name: 'XRPL NFT Monitor',
            },
            content: [
              {
                type: 'text/html',
                value: expect.stringContaining('NFT Activity Alert'),
              },
              {
                type: 'text/plain',
                value: expect.stringContaining('NFT SALE ALERT'),
              },
            ],
          }),
          expect.objectContaining({
            headers: {
              'Authorization': 'Bearer SG.test-api-key',
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          }),
        );
      });

      it('should use default subject when not provided', async () => {
        const payloadWithoutSubject = {
          ...mockPayload,
          channel: {
            ...mockPayload.channel,
            config: {
              recipients: ['test@example.com'],
            },
          },
        };

        mockedAxios.post.mockResolvedValueOnce({
          status: 202,
          statusText: 'Accepted',
          headers: {},
        });

        await service.sendNotification(payloadWithoutSubject);

        expect(mockedAxios.post).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            personalizations: [
              expect.objectContaining({
                subject: '🚨 SALE Alert: Cool Collection',
              }),
            ],
          }),
          expect.any(Object),
        );
      });

      it('should handle missing recipients', async () => {
        const payloadWithoutRecipients = {
          ...mockPayload,
          channel: {
            ...mockPayload.channel,
            config: {
              recipients: [],
            },
          },
        };

        const result = await service.sendNotification(payloadWithoutRecipients);

        expect(result).toEqual({
          success: false,
          error: 'No email recipients configured',
        });

        expect(mockedAxios.post).not.toHaveBeenCalled();
      });

      it('should include NFT image in HTML content when available', async () => {
        mockedAxios.post.mockResolvedValueOnce({
          status: 202,
          statusText: 'Accepted',
          headers: {},
        });

        await service.sendNotification(mockPayload);

        const callArgs = mockedAxios.post.mock.calls[0];
        const emailPayload = callArgs?.[1] as any;
        const htmlContent = emailPayload?.content?.find((c: any) => c.type === 'text/html')?.value;

        expect(htmlContent).toContain('https://example.com/nft.png');
        expect(htmlContent).toContain('Cool Collection');
        expect(htmlContent).toContain('1000.000000 XRP');
        expect(htmlContent).toContain('TX123ABC');
      });

      it('should handle NFT without image', async () => {
        const payloadWithoutImage = {
          ...mockPayload,
          data: {
            ...mockPayload.data,
            nft: {
              ...mockPayload.data.nft!,
            },
          },
        };
        delete payloadWithoutImage.data.nft!.imageUrl;
        delete payloadWithoutImage.data.nft!.imageS3Url;

        mockedAxios.post.mockResolvedValueOnce({
          status: 202,
          statusText: 'Accepted',
          headers: {},
        });

        await service.sendNotification(payloadWithoutImage);

        const callArgs = mockedAxios.post.mock.calls[0];
        const emailPayload = callArgs?.[1] as any;
        const htmlContent = emailPayload?.content?.find((c: any) => c.type === 'text/html')?.value;

        expect(htmlContent).not.toContain('<div class="nft-image">');
        expect(htmlContent).not.toContain('<img');
      });

      it('should handle mint activity without price', async () => {
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
          status: 202,
          statusText: 'Accepted',
          headers: {},
        });

        await service.sendNotification(mintPayload);

        const callArgs = mockedAxios.post.mock.calls[0];
        const emailPayload = callArgs?.[1] as any;
        const htmlContent = emailPayload?.content?.find((c: any) => c.type === 'text/html')?.value;
        const textContent = emailPayload?.content?.find((c: any) => c.type === 'text/plain')?.value;

        expect(htmlContent).toContain('NFT Activity Alert');
        expect(htmlContent).toContain('MINT');
        expect(htmlContent).not.toContain('Price:');
        expect(textContent).toContain('NFT MINT ALERT');
        expect(textContent).not.toContain('Price:');
      });

      it('should handle SendGrid rate limiting', async () => {
        const rateLimitError = new Error('Rate limited');
        (rateLimitError as any).response = {
          status: 429,
          headers: {
            'retry-after': '60',
          },
        };
        Object.defineProperty(rateLimitError, 'isAxiosError', { value: true });
        mockedAxios.post.mockRejectedValueOnce(rateLimitError);
        jest.spyOn(axios, 'isAxiosError').mockReturnValue(true);

        const result = await service.sendNotification(mockPayload);

        expect(result).toEqual({
          success: false,
          error: 'Rate limited',
          retryAfter: 60000,
        });
      });

      it('should handle SendGrid API errors', async () => {
        const apiError = new Error('Invalid API key');
        mockedAxios.post.mockRejectedValueOnce(apiError);

        const result = await service.sendNotification(mockPayload);

        expect(result).toEqual({
          success: false,
          error: 'Invalid API key',
        });

        expect(mockLoggerService.error).toHaveBeenCalledWith(
          expect.stringContaining('Failed to send email notification for activity activity-101')
        );
      });

      it('should handle HTTP errors from SendGrid', async () => {
        mockedAxios.post.mockResolvedValueOnce({
          status: 400,
          statusText: 'Bad Request',
          headers: {},
        });

        const result = await service.sendNotification(mockPayload);

        expect(result).toEqual({
          success: false,
          error: 'HTTP 400: Bad Request',
        });
      });
    });

    describe('testEmail', () => {
      it('should send test email successfully', async () => {
        mockedAxios.post.mockResolvedValueOnce({
          status: 202,
          statusText: 'Accepted',
          headers: {},
        });

        const result = await service.testEmail(['test@example.com']);

        expect(result).toEqual({
          success: true,
          messageId: 'test-email',
        });

        expect(mockedAxios.post).toHaveBeenCalledWith(
          'https://api.sendgrid.com/v3/mail/send',
          expect.objectContaining({
            personalizations: [
              {
                to: [{ email: 'test@example.com' }],
                subject: '🧪 Test Email from XRPL NFT Monitor',
              },
            ],
            from: {
              email: 'test@example.com',
              name: 'XRPL NFT Monitor',
            },
            content: [
              {
                type: 'text/html',
                value: expect.stringContaining('Test Email'),
              },
              {
                type: 'text/plain',
                value: expect.stringContaining('Test Email'),
              },
            ],
          }),
          expect.objectContaining({
            headers: {
              'Authorization': 'Bearer SG.test-api-key',
              'Content-Type': 'application/json',
            },
          }),
        );
      });

      it('should handle test email failures', async () => {
        mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));

        const result = await service.testEmail(['test@example.com']);

        expect(result).toEqual({
          success: false,
          error: 'Network error',
        });
      });
    });

    describe('email validation', () => {
      it('should validate correct email addresses', () => {
        const validEmails = [
          'test@example.com',
          'user.name@domain.co.uk',
          'admin+alerts@company.org',
          'user123@test-domain.com',
        ];

        validEmails.forEach(email => {
          expect(service.validateEmailAddress(email)).toBe(true);
        });
      });

      it('should reject invalid email addresses', () => {
        const invalidEmails = [
          'invalid-email',
          '@domain.com',
          'user@',
          'user@domain',
          'user name@domain.com',
          '',
        ];

        invalidEmails.forEach(email => {
          expect(service.validateEmailAddress(email)).toBe(false);
        });
      });

      it('should validate multiple email addresses', () => {
        const emails = [
          'valid@example.com',
          'invalid-email',
          'another.valid@domain.org',
          '@invalid.com',
        ];

        const result = service.validateEmailAddresses(emails);

        expect(result).toEqual({
          valid: ['valid@example.com', 'another.valid@domain.org'],
          invalid: ['invalid-email', '@invalid.com'],
        });
      });

      it('should handle empty email list', () => {
        const result = service.validateEmailAddresses([]);

        expect(result).toEqual({
          valid: [],
          invalid: [],
        });
      });
    });

    describe('content generation', () => {
      it('should generate activity colors correctly', () => {
        const testCases = [
          { activity: 'mint', expectedColor: '#27ae60' },
          { activity: 'sale', expectedColor: '#f39c12' },
          { activity: 'transfer', expectedColor: '#3498db' },
          { activity: 'unknown', expectedColor: '#95a5a6' },
        ];

        testCases.forEach(({ activity, expectedColor }) => {
          const color = (service as any).getActivityColor(activity);
          expect(color).toBe(expectedColor);
        });
      });

      it('should generate default subjects correctly', () => {
        const testData = {
          activityType: 'sale',
          transactionHash: 'TX123',
          ledgerIndex: 12345,
          timestamp: new Date(),
          nft: {
            id: 'nft-1',
            nftId: 'NFT123',
            ownerAddress: 'rOwner',
            collection: {
              id: 'collection-1',
              name: 'Test Collection',
              issuerAddress: 'rIssuer',
              taxon: 1,
            },
          },
        };

        const subject = (service as any).getDefaultSubject(testData);
        expect(subject).toBe('🚨 SALE Alert: Test Collection');
      });

      it('should handle missing collection name in subject', () => {
        const testData = {
          activityType: 'mint',
          transactionHash: 'TX123',
          ledgerIndex: 12345,
          timestamp: new Date(),
          nft: {
            id: 'nft-1',
            nftId: 'NFT123',
            ownerAddress: 'rOwner',
          },
        };

        const subject = (service as any).getDefaultSubject(testData);
        expect(subject).toBe('🚨 MINT Alert: NFT');
      });
    });
  });

  describe('without SendGrid configuration', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EmailNotificationService,
          {
            provide: LoggerService,
            useValue: mockLoggerService,
          },
          {
            provide: ConfigService,
            useValue: mockConfigWithoutSendGrid,
          },
        ],
      }).compile();

      service = module.get<EmailNotificationService>(EmailNotificationService);
    });

    it('should handle missing SendGrid configuration', async () => {
      const mockPayload: NotificationPayload = {
        id: 'notification-123',
        userId: 'user-456',
        alertConfigId: 'alert-789',
        activityId: 'activity-101',
        channel: {
          type: 'email',
          enabled: true,
          config: {
            recipients: ['test@example.com'],
          },
        },
        data: {
          activityType: 'sale',
          transactionHash: 'TX123ABC',
          ledgerIndex: 75000000,
          timestamp: new Date(),
        },
        scheduledAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
      };

      const result = await service.sendNotification(mockPayload);

      expect(result).toEqual({
        success: false,
        error: 'SendGrid API key is not configured',
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle missing SendGrid configuration in test email', async () => {
      const result = await service.testEmail(['test@example.com']);

      expect(result).toEqual({
        success: false,
        error: 'SendGrid API key is not configured',
      });

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });
});