import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse, AxiosRequestConfig } from 'axios';
import { LoggerService } from '../../../core/logger/logger.service';
import {
  NotificationPayload,
  NotificationResult,
  WebhookConfig,
  NFTActivityNotificationData,
} from '../interfaces/notification.interface';

@Injectable()
export class WebhookNotificationService {
  constructor(private readonly logger: LoggerService) {}

  /**
   * Send a generic webhook notification
   */
  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const config = payload.channel.config as WebhookConfig;
      
      if (!config.url) {
        throw new Error('Webhook URL is not configured');
      }

      // Build the webhook payload
      const webhookPayload = this.buildWebhookPayload(payload);
      
      // Build the request configuration
      const requestConfig = this.buildRequestConfig(config);

      this.logger.debug(`Sending webhook notification for activity ${payload.activityId} to ${config.url}`);

      // Send the webhook request
      const response = await this.sendWebhookRequest(
        config.url,
        webhookPayload,
        requestConfig,
        config.method
      );

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `✅ Webhook notification sent successfully for activity ${payload.activityId}`
        );
        return {
          success: true,
          messageId: response.headers['x-message-id'] || response.headers['x-request-id'] || 'unknown',
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(
        `❌ Failed to send webhook notification for activity ${payload.activityId}: ${errorMessage}`
      );

      // Handle rate limiting
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] 
          ? parseInt(error.response.headers['retry-after']) * 1000 
          : 60000;
        
        return {
          success: false,
          error: 'Rate limited',
          retryAfter,
        };
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Build the webhook payload
   */
  private buildWebhookPayload(payload: NotificationPayload): any {
    return {
      // Webhook metadata
      webhook: {
        id: payload.id,
        timestamp: new Date().toISOString(),
        type: 'nft_activity_alert',
        version: '1.0',
      },
      
      // Alert information
      alert: {
        id: payload.alertConfigId,
        userId: payload.userId,
        triggeredAt: payload.scheduledAt.toISOString(),
      },
      
      // NFT Activity data
      activity: this.formatActivityData(payload.data),
    };
  }

  /**
   * Format NFT activity data for webhook
   */
  private formatActivityData(data: NFTActivityNotificationData): any {
    return {
      id: data.activityType,
      type: data.activityType,
      transactionHash: data.transactionHash,
      ledgerIndex: data.ledgerIndex,
      timestamp: data.timestamp.toISOString(),
      ...(data.fromAddress && { fromAddress: data.fromAddress }),
      ...(data.toAddress && { toAddress: data.toAddress }),
      ...(data.priceDrops && { 
        priceDrops: data.priceDrops,
        priceXRP: (parseInt(data.priceDrops) / 1_000_000).toFixed(6),
      }),
      ...(data.currency && { currency: data.currency }),
      ...(data.issuer && { issuer: data.issuer }),
      ...(data.nft && {
        nft: {
          id: data.nft.id,
          nftId: data.nft.nftId,
          ownerAddress: data.nft.ownerAddress,
          ...(data.nft.imageUrl && { imageUrl: data.nft.imageUrl }),
          ...(data.nft.metadata && { metadata: data.nft.metadata }),
          ...(data.nft.collection && {
            collection: {
              id: data.nft.collection.id,
              issuerAddress: data.nft.collection.issuerAddress,
              taxon: data.nft.collection.taxon,
              ...(data.nft.collection.name && { name: data.nft.collection.name }),
            },
          }),
        },
      }),
    };
  }

  /**
   * Build request configuration with authentication
   */
  private buildRequestConfig(config: WebhookConfig): AxiosRequestConfig {
    const requestConfig: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'XRPL-NFT-Monitor-Webhook/1.0',
        ...config.headers,
      },
      timeout: 15000, // 15 second timeout
    };

    // Add authentication
    if (config.auth) {
      switch (config.auth.type) {
        case 'bearer':
          if (config.auth.token) {
            requestConfig.headers!['Authorization'] = `Bearer ${config.auth.token}`;
          }
          break;
          
        case 'basic':
          if (config.auth.username && config.auth.password) {
            const credentials = Buffer.from(`${config.auth.username}:${config.auth.password}`).toString('base64');
            requestConfig.headers!['Authorization'] = `Basic ${credentials}`;
          }
          break;
          
        case 'api-key':
          if (config.auth.token && config.auth.headerName) {
            requestConfig.headers![config.auth.headerName] = config.auth.token;
          }
          break;
      }
    }

    return requestConfig;
  }

  /**
   * Send the webhook request
   */
  private async sendWebhookRequest(
    url: string,
    payload: any,
    config: AxiosRequestConfig,
    method: string = 'POST'
  ): Promise<AxiosResponse> {
    switch (method.toUpperCase()) {
      case 'POST':
        return axios.post(url, payload, config);
      case 'PUT':
        return axios.put(url, payload, config);
      case 'PATCH':
        return axios.patch(url, payload, config);
      default:
        throw new Error(`Unsupported HTTP method: ${method}`);
    }
  }

  /**
   * Test webhook connectivity and authentication
   */
  async testWebhook(config: WebhookConfig): Promise<NotificationResult> {
    try {
      const testPayload = {
        webhook: {
          id: 'test-webhook',
          timestamp: new Date().toISOString(),
          type: 'test',
          version: '1.0',
        },
        message: 'This is a test webhook from XRPL NFT Monitor',
        test: true,
      };

      const requestConfig = this.buildRequestConfig(config);
      const response = await this.sendWebhookRequest(
        config.url,
        testPayload,
        requestConfig,
        config.method
      );

      if (response.status >= 200 && response.status < 300) {
        return { 
          success: true, 
          messageId: 'test-webhook',
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validate webhook URL format
   */
  validateWebhookUrl(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Validate webhook configuration
   */
  validateWebhookConfig(config: WebhookConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate URL
    if (!config.url) {
      errors.push('Webhook URL is required');
    } else if (!this.validateWebhookUrl(config.url)) {
      errors.push('Invalid webhook URL format');
    }

    // Validate HTTP method
    const validMethods = ['POST', 'PUT', 'PATCH'];
    if (!validMethods.includes(config.method.toUpperCase())) {
      errors.push(`Invalid HTTP method. Must be one of: ${validMethods.join(', ')}`);
    }

    // Validate authentication
    if (config.auth) {
      switch (config.auth.type) {
        case 'bearer':
          if (!config.auth.token) {
            errors.push('Bearer token is required for bearer authentication');
          }
          break;
          
        case 'basic':
          if (!config.auth.username || !config.auth.password) {
            errors.push('Username and password are required for basic authentication');
          }
          break;
          
        case 'api-key':
          if (!config.auth.token || !config.auth.headerName) {
            errors.push('Token and header name are required for API key authentication');
          }
          break;
          
        default:
          errors.push('Invalid authentication type. Must be: bearer, basic, or api-key');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Parse webhook response for debugging
   */
  parseWebhookResponse(response: AxiosResponse): {
    status: number;
    statusText: string;
    headers: any;
    data?: any;
  } {
    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: response.data,
    };
  }
}