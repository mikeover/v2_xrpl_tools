import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Public } from '../../auth/decorators/public.decorator';

interface WebhookExample {
  event: string;
  description: string;
  payload: any;
}

interface RateLimitInfo {
  endpoint: string;
  limit: number;
  window: string;
  scope: string;
}

@ApiTags('API Documentation')
@Controller('api/v1/docs')
@Public()
export class ApiDocsController {
  @Get('webhooks')
  @ApiOperation({
    summary: 'Get webhook documentation',
    description: 'Returns documentation and examples for webhook integrations',
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook documentation',
  })
  getWebhookDocs() {
    const examples: WebhookExample[] = [
      {
        event: 'nft.listed',
        description: 'Triggered when an NFT is listed for sale',
        payload: {
          type: 'nft.listed',
          timestamp: '2024-01-01T00:00:00.000Z',
          data: {
            nft: {
              id: '000812...',
              nftId: 'NFTokenID',
              ownerAddress: 'rXRPL...',
              metadata: {
                name: 'Cool NFT #123',
                description: 'A very cool NFT',
                image: 'https://ipfs.io/ipfs/...',
              },
              imageS3Url: 'https://cdn.xrplmonitor.com/nfts/...',
            },
            activity: {
              type: 'listed',
              price: '100000000', // In drops
              currency: 'XRP',
              seller: 'rSeller...',
              marketplace: 'onXRP',
              transactionHash: 'ABCD1234...',
            },
          },
        },
      },
      {
        event: 'nft.sold',
        description: 'Triggered when an NFT is sold',
        payload: {
          type: 'nft.sold',
          timestamp: '2024-01-01T00:00:00.000Z',
          data: {
            nft: {
              id: '000812...',
              nftId: 'NFTokenID',
              ownerAddress: 'rNewOwner...',
              previousOwner: 'rOldOwner...',
              metadata: {
                name: 'Cool NFT #123',
                description: 'A very cool NFT',
                image: 'https://ipfs.io/ipfs/...',
              },
              imageS3Url: 'https://cdn.xrplmonitor.com/nfts/...',
            },
            activity: {
              type: 'sold',
              price: '100000000',
              currency: 'XRP',
              buyer: 'rBuyer...',
              seller: 'rSeller...',
              marketplace: 'onXRP',
              transactionHash: 'EFGH5678...',
            },
          },
        },
      },
      {
        event: 'nft.minted',
        description: 'Triggered when a new NFT is minted',
        payload: {
          type: 'nft.minted',
          timestamp: '2024-01-01T00:00:00.000Z',
          data: {
            nft: {
              id: '000812...',
              nftId: 'NFTokenID',
              ownerAddress: 'rMinter...',
              metadata: {
                name: 'Brand New NFT',
                description: 'Fresh off the mint',
                image: 'https://ipfs.io/ipfs/...',
                attributes: [
                  { trait_type: 'Rarity', value: 'Rare' },
                  { trait_type: 'Edition', value: '1' },
                ],
              },
              imageS3Url: 'https://cdn.xrplmonitor.com/nfts/...',
            },
            activity: {
              type: 'minted',
              minter: 'rMinter...',
              supply: 100,
              transactionHash: 'IJKL9012...',
            },
          },
        },
      },
    ];

    return {
      overview: {
        description: 'Webhooks allow you to receive real-time notifications about NFT activities',
        authentication: 'Include X-Webhook-Secret header with your configured secret',
        retry: 'Failed webhooks are retried up to 3 times with exponential backoff',
        timeout: 'Webhook endpoints must respond within 10 seconds',
      },
      configuration: {
        url: 'Your publicly accessible HTTPS endpoint',
        secret: 'A secure random string for webhook verification',
        events: ['nft.listed', 'nft.sold', 'nft.minted', 'nft.transferred', 'nft.burned'],
      },
      headers: {
        'X-Webhook-Event': 'The event type (e.g., nft.listed)',
        'X-Webhook-ID': 'Unique identifier for this webhook delivery',
        'X-Webhook-Timestamp': 'ISO 8601 timestamp of the event',
        'X-Webhook-Signature': 'HMAC-SHA256 signature of the payload',
      },
      examples,
      verification: {
        algorithm: 'HMAC-SHA256',
        example: `
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}`,
      },
    };
  }

  @Get('rate-limits')
  @ApiOperation({
    summary: 'Get rate limit documentation',
    description: 'Returns information about API rate limits',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate limit documentation',
  })
  getRateLimitDocs() {
    const limits: RateLimitInfo[] = [
      {
        endpoint: 'POST /api/v1/auth/login',
        limit: 5,
        window: '15 minutes',
        scope: 'IP address',
      },
      {
        endpoint: 'POST /api/v1/auth/register',
        limit: 3,
        window: '1 hour',
        scope: 'IP address',
      },
      {
        endpoint: 'GET /api/v1/alerts',
        limit: 100,
        window: '1 minute',
        scope: 'User',
      },
      {
        endpoint: 'POST /api/v1/alerts',
        limit: 20,
        window: '1 hour',
        scope: 'User',
      },
      {
        endpoint: 'POST /api/v1/alerts/:id/test',
        limit: 10,
        window: '1 hour',
        scope: 'User',
      },
      {
        endpoint: 'GET /api/v1/notifications',
        limit: 100,
        window: '1 minute',
        scope: 'User',
      },
      {
        endpoint: 'All other authenticated endpoints',
        limit: 1000,
        window: '1 minute',
        scope: 'User',
      },
      {
        endpoint: 'Health check endpoints',
        limit: 60,
        window: '1 minute',
        scope: 'IP address',
      },
    ];

    return {
      overview: {
        description: 'API rate limits help ensure fair usage and system stability',
        scope: 'Rate limits are applied per user (authenticated) or IP address (public)',
        headers: {
          'X-RateLimit-Limit': 'The rate limit for the endpoint',
          'X-RateLimit-Remaining': 'Number of requests remaining in the current window',
          'X-RateLimit-Reset': 'Unix timestamp when the rate limit resets',
        },
        response: 'HTTP 429 Too Many Requests when limit is exceeded',
      },
      limits,
      recommendations: [
        'Implement exponential backoff when receiving 429 responses',
        'Cache responses when possible to reduce API calls',
        'Use webhooks for real-time updates instead of polling',
        'Batch operations when possible (e.g., bulk alert creation)',
      ],
    };
  }

  @Get('errors')
  @ApiOperation({
    summary: 'Get error code documentation',
    description: 'Returns documentation about API error codes and responses',
  })
  @ApiResponse({
    status: 200,
    description: 'Error code documentation',
  })
  getErrorDocs() {
    return {
      overview: {
        description: 'All API errors follow a consistent format',
        format: {
          statusCode: 'HTTP status code',
          message: 'Human-readable error message or array of messages',
          error: 'Error type/category',
          timestamp: 'ISO 8601 timestamp',
          path: 'Request path',
        },
      },
      commonErrors: [
        {
          code: 400,
          type: 'Bad Request',
          description: 'Invalid request data or parameters',
          example: {
            statusCode: 400,
            message: ['email must be an email', 'password is too short'],
            error: 'Bad Request',
          },
        },
        {
          code: 401,
          type: 'Unauthorized',
          description: 'Missing or invalid authentication token',
          example: {
            statusCode: 401,
            message: 'Unauthorized',
            error: 'Unauthorized',
          },
        },
        {
          code: 403,
          type: 'Forbidden',
          description: 'Insufficient permissions for the requested resource',
          example: {
            statusCode: 403,
            message: 'Insufficient permissions',
            error: 'Forbidden',
          },
        },
        {
          code: 404,
          type: 'Not Found',
          description: 'Requested resource does not exist',
          example: {
            statusCode: 404,
            message: 'Alert configuration not found',
            error: 'Not Found',
          },
        },
        {
          code: 409,
          type: 'Conflict',
          description: 'Request conflicts with current state',
          example: {
            statusCode: 409,
            message: 'Email already registered',
            error: 'Conflict',
          },
        },
        {
          code: 429,
          type: 'Too Many Requests',
          description: 'Rate limit exceeded',
          example: {
            statusCode: 429,
            message: 'Too many requests',
            error: 'Too Many Requests',
          },
        },
        {
          code: 500,
          type: 'Internal Server Error',
          description: 'Unexpected server error',
          example: {
            statusCode: 500,
            message: 'Internal server error',
            error: 'Internal Server Error',
          },
        },
      ],
    };
  }

  @Get('authentication')
  @ApiOperation({
    summary: 'Get authentication documentation',
    description: 'Returns detailed documentation about API authentication',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication documentation',
  })
  getAuthDocs() {
    return {
      overview: {
        description: 'The API uses JWT (JSON Web Tokens) for authentication',
        tokenType: 'Bearer',
        header: 'Authorization: Bearer <token>',
        expiration: '24 hours',
      },
      flow: [
        {
          step: 1,
          action: 'Register or login',
          endpoint: 'POST /api/v1/auth/register or /api/v1/auth/login',
          response: 'Returns access_token and user information',
        },
        {
          step: 2,
          action: 'Include token in requests',
          description: 'Add Authorization header to all authenticated requests',
          example: 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
        {
          step: 3,
          action: 'Handle token expiration',
          description: 'When token expires, login again to get a new token',
          errorCode: 401,
        },
      ],
      example: {
        login: {
          request: {
            method: 'POST',
            url: '/api/v1/auth/login',
            body: {
              email: 'user@example.com',
              password: 'securepassword',
            },
          },
          response: {
            access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
            user: {
              id: 'uuid',
              email: 'user@example.com',
              name: 'John Doe',
              xrplAddress: 'rXRPLAddress...',
            },
          },
        },
        authenticatedRequest: {
          method: 'GET',
          url: '/api/v1/alerts',
          headers: {
            Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
        },
      },
    };
  }
}