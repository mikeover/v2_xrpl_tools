import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { LoggerService } from '../../../core/logger/logger.service';
import { AppConfiguration } from '../../../shared/config';
import {
  NotificationPayload,
  NotificationResult,
  EmailConfig,
  NFTActivityNotificationData,
} from '../interfaces/notification.interface';

@Injectable()
export class EmailNotificationService {
  constructor(
    private readonly logger: LoggerService,
    private readonly configService: ConfigService<AppConfiguration>,
  ) {}

  /**
   * Send an email notification using SendGrid
   */
  async sendNotification(payload: NotificationPayload): Promise<NotificationResult> {
    try {
      const emailConfig = this.configService.get<AppConfiguration['email']>('email');
      
      if (!emailConfig?.sendgridApiKey) {
        throw new Error('SendGrid API key is not configured');
      }

      const config = payload.channel.config as EmailConfig;
      
      if (!config.recipients || config.recipients.length === 0) {
        throw new Error('No email recipients configured');
      }

      // Build the email content
      const emailContent = this.buildEmailContent(payload.data);
      
      // Build the SendGrid payload
      const sendGridPayload = {
        personalizations: [
          {
            to: config.recipients.map(email => ({ email })),
            subject: config.subject || this.getDefaultSubject(payload.data),
          },
        ],
        from: {
          email: emailConfig.from || 'noreply@xrpl-nft-monitor.com',
          name: 'XRPL NFT Monitor',
        },
        content: [
          {
            type: 'text/html',
            value: emailContent.html,
          },
          {
            type: 'text/plain',
            value: emailContent.text,
          },
        ],
      };

      this.logger.debug(`Sending email notification for activity ${payload.activityId}`);

      // Send via SendGrid API
      const response = await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        sendGridPayload,
        {
          headers: {
            'Authorization': `Bearer ${emailConfig.sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000, // 15 second timeout
        }
      );

      if (response.status === 202) {
        this.logger.log(
          `✅ Email notification sent successfully for activity ${payload.activityId}`
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
        `❌ Failed to send email notification for activity ${payload.activityId}: ${errorMessage}`
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
   * Build email content (HTML and plain text)
   */
  private buildEmailContent(
    data: NFTActivityNotificationData,
  ): { html: string; text: string } {
    const activityType = data.activityType.toUpperCase();
    const collectionName = data.nft?.collection?.name || 'Unknown Collection';
    const nftId = data.nft?.nftId || 'Unknown NFT';
    
    // Build HTML content
    const html = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NFT ${activityType} Alert</title>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 2px solid #e74c3c; }
        .header h1 { color: #e74c3c; margin: 0; font-size: 28px; }
        .activity-type { background: ${this.getActivityColor(data.activityType)}; color: white; padding: 10px 20px; border-radius: 25px; display: inline-block; font-weight: bold; margin: 10px 0; }
        .details { margin: 20px 0; }
        .detail-row { margin: 10px 0; padding: 10px; background: #f8f9fa; border-left: 4px solid #3498db; }
        .detail-label { font-weight: bold; color: #2c3e50; }
        .detail-value { margin-left: 10px; color: #34495e; font-family: 'Courier New', monospace; }
        .nft-image { text-align: center; margin: 20px 0; }
        .nft-image img { max-width: 200px; border-radius: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); }
        .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; text-align: center; color: #7f8c8d; font-size: 14px; }
        .button { display: inline-block; padding: 12px 24px; background: #3498db; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
        .button:hover { background: #2980b9; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚨 NFT Activity Alert</h1>
            <div class="activity-type">${activityType}</div>
        </div>
        
        <div class="details">
            <div class="detail-row">
                <span class="detail-label">Collection:</span>
                <span class="detail-value">${collectionName}</span>
            </div>
            
            <div class="detail-row">
                <span class="detail-label">NFT ID:</span>
                <span class="detail-value">${nftId}</span>
            </div>
            
            <div class="detail-row">
                <span class="detail-label">Transaction:</span>
                <span class="detail-value">${data.transactionHash}</span>
            </div>
            
            <div class="detail-row">
                <span class="detail-label">Ledger Index:</span>
                <span class="detail-value">${data.ledgerIndex}</span>
            </div>
            
            ${data.fromAddress ? `
            <div class="detail-row">
                <span class="detail-label">From:</span>
                <span class="detail-value">${data.fromAddress}</span>
            </div>
            ` : ''}
            
            ${data.toAddress ? `
            <div class="detail-row">
                <span class="detail-label">To:</span>
                <span class="detail-value">${data.toAddress}</span>
            </div>
            ` : ''}
            
            ${data.priceDrops ? `
            <div class="detail-row">
                <span class="detail-label">Price:</span>
                <span class="detail-value">${(parseInt(data.priceDrops) / 1_000_000).toFixed(6)} XRP</span>
            </div>
            ` : ''}
            
            <div class="detail-row">
                <span class="detail-label">Timestamp:</span>
                <span class="detail-value">${data.timestamp.toLocaleString()}</span>
            </div>
        </div>
        
        ${(data.nft?.imageS3Url || data.nft?.imageUrl) ? `
        <div class="nft-image">
            <img src="${data.nft.imageS3Url || data.nft.imageUrl}" alt="NFT Image" />
        </div>
        ` : ''}
        
        <div style="text-align: center; margin: 30px 0;">
            <a href="https://livenet.xrpl.org/transactions/${data.transactionHash}" class="button" target="_blank">
                View Transaction
            </a>
        </div>
        
        <div class="footer">
            <p>This alert was generated by XRPL NFT Monitor</p>
            <p>Received at ${new Date().toLocaleString()}</p>
        </div>
    </div>
</body>
</html>
    `.trim();

    // Build plain text content
    const text = `
NFT ${activityType} ALERT

Collection: ${collectionName}
NFT ID: ${nftId}
Transaction: ${data.transactionHash}
Ledger Index: ${data.ledgerIndex}
${data.fromAddress ? `From: ${data.fromAddress}` : ''}
${data.toAddress ? `To: ${data.toAddress}` : ''}
${data.priceDrops ? `Price: ${(parseInt(data.priceDrops) / 1_000_000).toFixed(6)} XRP` : ''}
Timestamp: ${data.timestamp.toLocaleString()}

View Transaction: https://livenet.xrpl.org/transactions/${data.transactionHash}

---
This alert was generated by XRPL NFT Monitor
Received at ${new Date().toLocaleString()}
    `.trim();

    return { html, text };
  }

  /**
   * Get default email subject
   */
  private getDefaultSubject(data: NFTActivityNotificationData): string {
    const activityType = data.activityType.toUpperCase();
    const collectionName = data.nft?.collection?.name || 'NFT';
    
    return `🚨 ${activityType} Alert: ${collectionName}`;
  }

  /**
   * Get activity color for email styling
   */
  private getActivityColor(activityType: string): string {
    const colorMap: Record<string, string> = {
      mint: '#27ae60',     // Green
      transfer: '#3498db', // Blue
      sale: '#f39c12',     // Orange
      list: '#9b59b6',     // Purple
      delist: '#e74c3c',   // Red
      burn: '#e67e22',     // Dark Orange
      offer: '#2ecc71',    // Emerald
      accept: '#27ae60',   // Dark Green
    };

    return colorMap[activityType.toLowerCase()] || '#95a5a6'; // Gray
  }

  /**
   * Test email configuration
   */
  async testEmail(recipients: string[]): Promise<NotificationResult> {
    try {
      const emailConfig = this.configService.get<AppConfiguration['email']>('email');
      
      if (!emailConfig?.sendgridApiKey) {
        throw new Error('SendGrid API key is not configured');
      }

      const testPayload = {
        personalizations: [
          {
            to: recipients.map(email => ({ email })),
            subject: '🧪 Test Email from XRPL NFT Monitor',
          },
        ],
        from: {
          email: emailConfig.from || 'noreply@xrpl-nft-monitor.com',
          name: 'XRPL NFT Monitor',
        },
        content: [
          {
            type: 'text/html',
            value: `
              <div style="font-family: Arial, sans-serif; padding: 20px;">
                <h2>🧪 Test Email</h2>
                <p>This is a test email from XRPL NFT Monitor to verify your email configuration.</p>
                <p>If you received this email, your email notifications are working correctly!</p>
                <p><strong>Test Time:</strong> ${new Date().toLocaleString()}</p>
              </div>
            `,
          },
          {
            type: 'text/plain',
            value: `Test Email from XRPL NFT Monitor\n\nThis is a test email to verify your email configuration.\nTest Time: ${new Date().toLocaleString()}`,
          },
        ],
      };

      const response = await axios.post(
        'https://api.sendgrid.com/v3/mail/send',
        testPayload,
        {
          headers: {
            'Authorization': `Bearer ${emailConfig.sendgridApiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      if (response.status === 202) {
        return { success: true, messageId: 'test-email' };
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Validate email address format
   */
  validateEmailAddress(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate multiple email addresses
   */
  validateEmailAddresses(emails: string[]): { valid: string[]; invalid: string[] } {
    const valid: string[] = [];
    const invalid: string[] = [];

    emails.forEach(email => {
      if (this.validateEmailAddress(email)) {
        valid.push(email);
      } else {
        invalid.push(email);
      }
    });

    return { valid, invalid };
  }
}