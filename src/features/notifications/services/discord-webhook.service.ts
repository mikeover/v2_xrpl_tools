import { Injectable } from '@nestjs/common';
import axios, { AxiosResponse } from 'axios';
import { LoggerService } from '../../../core/logger/logger.service';
import {
  NotificationPayload,
  NotificationResult,
  NotificationTemplate,
  DiscordWebhookConfig,
  NFTActivityNotificationData,
} from '../interfaces/notification.interface';

@Injectable()
export class DiscordWebhookService {
  constructor(
    private readonly logger: LoggerService,
  ) {}

  /**
   * Send a Discord webhook notification
   */
  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const config = payload.channel.config as DiscordWebhookConfig;
      
      if (!config.webhookUrl) {
        throw new Error('Discord webhook URL is not configured');
      }

      // Build the Discord embed message
      const embed = this.buildDiscordEmbed(payload.data);
      
      // Build the Discord message payload
      const discordPayload = this.buildDiscordPayload(config, embed);

      this.logger.debug(`Sending Discord notification for activity ${payload.activityId}`);

      // Send the webhook request
      const response = await this.sendWebhookRequest(config.webhookUrl, discordPayload);

      if (response.status >= 200 && response.status < 300) {
        this.logger.log(
          `✅ Discord notification sent successfully for activity ${payload.activityId}`
        );
        return {
          success: true,
          messageId: response.headers['x-message-id'] || 'unknown',
        };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.logger.error(
        `❌ Failed to send Discord notification for activity ${payload.activityId}: ${errorMessage}`
      );

      // Handle rate limiting
      if (axios.isAxiosError(error) && error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'] 
          ? parseInt(error.response.headers['retry-after']) * 1000 
          : 60000; // Default to 1 minute
        
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
   * Build Discord embed from NFT activity data
   */
  private buildDiscordEmbed(data: NFTActivityNotificationData): NotificationTemplate {
    const activityTypeEmoji = this.getActivityTypeEmoji(data.activityType);
    const activityColor = this.getActivityTypeColor(data.activityType);
    
    const embed: NotificationTemplate = {
      title: `${activityTypeEmoji} NFT ${data.activityType.toUpperCase()}`,
      description: this.buildActivityDescription(data),
      color: activityColor,
      timestamp: data.timestamp.toISOString(),
      fields: this.buildEmbedFields(data),
      footer: {
        text: 'XRPL NFT Monitor',
        icon_url: 'https://xrpl.org/favicon.ico',
      },
    };

    // Add NFT image if available
    if (data.nft?.imageUrl) {
      embed.thumbnail = {
        url: data.nft.imageUrl,
      };
    }

    return embed;
  }

  /**
   * Build the main activity description
   */
  private buildActivityDescription(data: NFTActivityNotificationData): string {
    let description = '';

    if (data.nft?.collection?.name) {
      description += `**Collection:** ${data.nft.collection.name}\n`;
    }

    if (data.nft?.nftId) {
      description += `**NFT ID:** \`${data.nft.nftId}\`\n`;
    }

    description += `**Transaction:** \`${data.transactionHash}\`\n`;
    description += `**Ledger:** ${data.ledgerIndex}\n`;

    return description;
  }

  /**
   * Build embed fields with activity details
   */
  private buildEmbedFields(data: NFTActivityNotificationData): Array<{
    name: string;
    value: string;
    inline?: boolean;
  }> {
    const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

    // From/To addresses
    if (data.fromAddress) {
      fields.push({
        name: 'From',
        value: `\`${data.fromAddress}\``,
        inline: true,
      });
    }

    if (data.toAddress) {
      fields.push({
        name: 'To',
        value: `\`${data.toAddress}\``,
        inline: true,
      });
    }

    // Price information
    if (data.priceDrops) {
      const xrpAmount = (parseInt(data.priceDrops) / 1_000_000).toFixed(6);
      fields.push({
        name: 'Price',
        value: `${xrpAmount} XRP`,
        inline: true,
      });
    }

    // NFT metadata
    if (data.nft?.metadata) {
      try {
        const metadata = typeof data.nft.metadata === 'string' 
          ? JSON.parse(data.nft.metadata) 
          : data.nft.metadata;
        
        if (metadata.name) {
          fields.push({
            name: 'NFT Name',
            value: metadata.name,
            inline: true,
          });
        }

        if (metadata.description && metadata.description.length < 200) {
          fields.push({
            name: 'Description',
            value: metadata.description,
            inline: false,
          });
        }
      } catch (error) {
        // Ignore JSON parse errors
      }
    }

    return fields;
  }

  /**
   * Build the complete Discord webhook payload
   */
  private buildDiscordPayload(
    config: DiscordWebhookConfig,
    embed: NotificationTemplate
  ): any {
    const payload: any = {
      embeds: [embed],
    };

    // Add custom username and avatar
    if (config.username) {
      payload.username = config.username;
    }

    if (config.avatarUrl) {
      payload.avatar_url = config.avatarUrl;
    }

    // Add mentions
    let content = '';
    if (config.mentionUsers && config.mentionUsers.length > 0) {
      content += config.mentionUsers.map(userId => `<@${userId}>`).join(' ') + ' ';
    }

    if (config.mentionRoles && config.mentionRoles.length > 0) {
      content += config.mentionRoles.map(roleId => `<@&${roleId}>`).join(' ') + ' ';
    }

    if (content.trim()) {
      payload.content = content.trim();
    }

    return payload;
  }

  /**
   * Send the actual webhook request to Discord
   */
  private async sendWebhookRequest(
    webhookUrl: string,
    payload: any
  ): Promise<AxiosResponse> {
    return axios.post(webhookUrl, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'XRPL-NFT-Monitor/1.0',
      },
      timeout: 10000, // 10 second timeout
    });
  }

  /**
   * Get emoji for activity type
   */
  private getActivityTypeEmoji(activityType: string): string {
    const emojiMap: Record<string, string> = {
      mint: '🪙',
      transfer: '↔️',
      sale: '💰',
      list: '📝',
      delist: '❌',
      burn: '🔥',
      offer: '💵',
      accept: '✅',
    };

    return emojiMap[activityType.toLowerCase()] || '📄';
  }

  /**
   * Get color for activity type
   */
  private getActivityTypeColor(activityType: string): number {
    const colorMap: Record<string, number> = {
      mint: 0x00ff00,     // Green
      transfer: 0x3498db, // Blue
      sale: 0xf39c12,     // Orange
      list: 0x9b59b6,     // Purple
      delist: 0xe74c3c,   // Red
      burn: 0xe67e22,     // Dark Orange
      offer: 0x2ecc71,    // Emerald
      accept: 0x27ae60,   // Dark Green
    };

    return colorMap[activityType.toLowerCase()] || 0x95a5a6; // Gray
  }

  /**
   * Test Discord webhook connectivity
   */
  async testWebhook(webhookUrl: string): Promise<NotificationResult> {
    try {
      const testPayload = {
        embeds: [
          {
            title: '🧪 Test Notification',
            description: 'This is a test message from XRPL NFT Monitor',
            color: 0x3498db,
            timestamp: new Date().toISOString(),
            footer: {
              text: 'XRPL NFT Monitor - Test',
            },
          },
        ],
      };

      const response = await this.sendWebhookRequest(webhookUrl, testPayload);

      if (response.status >= 200 && response.status < 300) {
        return { success: true, messageId: 'test-message' };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validate Discord webhook URL format
   */
  validateWebhookUrl(url: string): boolean {
    const discordWebhookRegex = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/;
    return discordWebhookRegex.test(url);
  }
}