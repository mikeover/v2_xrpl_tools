import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
  path: string;
  duration: number;
}

@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const startTime = Date.now();
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data) => {
        // If the response already has the expected structure, return it as is
        if (data && typeof data === 'object' && 'success' in data) {
          return data;
        }

        // Handle health check endpoints differently
        if (request.path.includes('/health')) {
          return data;
        }

        // Transform the response to a consistent format
        const response: ApiResponse<T> = {
          success: true,
          timestamp: new Date().toISOString(),
          path: request.url,
          duration: Date.now() - startTime,
        };

        // Handle different response patterns
        if (data && typeof data === 'object') {
          if ('message' in data && 'data' in data) {
            // Response already has message and data
            response.message = data.message;
            response.data = data.data;
          } else if ('message' in data) {
            // Response has only message
            response.message = data.message;
            // Remove message from data to avoid duplication
            const { message, ...rest } = data;
            if (Object.keys(rest).length > 0) {
              response.data = rest as T;
            }
          } else {
            // Response is just data
            response.data = data;
          }
        } else {
          // Primitive response
          response.data = data;
        }

        return response;
      }),
    );
  }
}