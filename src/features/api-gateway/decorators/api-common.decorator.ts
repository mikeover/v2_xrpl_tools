import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiInternalServerErrorResponse,
  ApiBadRequestResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';

export interface ApiDocOptions {
  summary: string;
  description?: string;
  tags?: string[];
  auth?: boolean;
  responseType?: Type<any>;
  isArray?: boolean;
  paginated?: boolean;
}

/**
 * Common API documentation decorator
 */
export function ApiDoc(options: ApiDocOptions) {
  const decorators: MethodDecorator[] = [];

  // Add ApiOperation with or without description
  if (options.description) {
    decorators.push(
      ApiOperation({
        summary: options.summary,
        description: options.description,
      }),
    );
  } else {
    decorators.push(
      ApiOperation({
        summary: options.summary,
      }),
    );
  }

  // Add tags if provided
  if (options.tags && options.tags.length > 0) {
    decorators.push(ApiTags(...options.tags));
  }

  // Add auth decorator if needed
  if (options.auth) {
    decorators.push(ApiBearerAuth('JWT-auth'));
    decorators.push(
      ApiUnauthorizedResponse({
        description: 'Unauthorized - Invalid or missing JWT token',
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 401 },
            message: { type: 'string', example: 'Unauthorized' },
            error: { type: 'string', example: 'Unauthorized' },
          },
        },
      }),
    );
    decorators.push(
      ApiForbiddenResponse({
        description: 'Forbidden - Insufficient permissions',
        schema: {
          type: 'object',
          properties: {
            statusCode: { type: 'number', example: 403 },
            message: { type: 'string', example: 'Insufficient permissions' },
            error: { type: 'string', example: 'Forbidden' },
          },
        },
      }),
    );
  }

  // Add common error responses
  decorators.push(
    ApiBadRequestResponse({
      description: 'Bad Request - Invalid input data',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 400 },
          message: { type: 'array', items: { type: 'string' } },
          error: { type: 'string', example: 'Bad Request' },
        },
      },
    }),
    ApiTooManyRequestsResponse({
      description: 'Too Many Requests - Rate limit exceeded',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 429 },
          message: { type: 'string', example: 'Too many requests' },
          error: { type: 'string', example: 'Too Many Requests' },
        },
      },
    }),
    ApiInternalServerErrorResponse({
      description: 'Internal Server Error',
      schema: {
        type: 'object',
        properties: {
          statusCode: { type: 'number', example: 500 },
          message: { type: 'string', example: 'Internal server error' },
          error: { type: 'string', example: 'Internal Server Error' },
        },
      },
    }),
  );

  // Add success response
  if (options.responseType) {
    if (options.paginated) {
      decorators.push(
        ApiResponse({
          status: 200,
          description: 'Success',
          schema: {
            type: 'object',
            properties: {
              data: {
                type: 'array',
                items: { $ref: `#/components/schemas/${options.responseType.name}` },
              },
              pagination: {
                type: 'object',
                properties: {
                  page: { type: 'number' },
                  limit: { type: 'number' },
                  total: { type: 'number' },
                  totalPages: { type: 'number' },
                },
              },
            },
          },
        }),
      );
    } else if (options.isArray) {
      decorators.push(
        ApiResponse({
          status: 200,
          description: 'Success',
          type: options.responseType,
          isArray: true,
        }),
      );
    } else {
      decorators.push(
        ApiResponse({
          status: 200,
          description: 'Success',
          type: options.responseType,
        }),
      );
    }
  }

  return applyDecorators(...decorators);
}

/**
 * Common decorator for endpoints that require authentication
 */
export function ApiAuth() {
  return applyDecorators(
    ApiBearerAuth('JWT-auth'),
    ApiUnauthorizedResponse({
      description: 'Unauthorized - Invalid or missing JWT token',
    }),
    ApiForbiddenResponse({
      description: 'Forbidden - Insufficient permissions',
    }),
  );
}

/**
 * Common decorator for public endpoints
 */
export function ApiPublic() {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Success',
    }),
  );
}

/**
 * Decorator for paginated responses
 */
export function ApiPaginatedResponse<T>(model: Type<T>) {
  return applyDecorators(
    ApiResponse({
      status: 200,
      description: 'Paginated response',
      schema: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: `#/components/schemas/${model.name}` },
          },
          pagination: {
            type: 'object',
            properties: {
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 20 },
              total: { type: 'number', example: 100 },
              totalPages: { type: 'number', example: 5 },
            },
          },
        },
      },
    }),
  );
}