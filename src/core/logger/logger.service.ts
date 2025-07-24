import { Injectable, LoggerService as NestLoggerService, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLogger, format, transports, Logger } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { AppConfiguration } from '../../shared/config';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logLevel: string;
  private readonly winston: Logger;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService<AppConfiguration>,
  ) {
    const loggingConfig = this.configService.get<AppConfiguration['logging']>('logging');

    this.logLevel = loggingConfig?.level ?? 'info';

    // Create Winston logger with daily rotation
    this.winston = createLogger({
      level: this.logLevel,
      format: format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json()
      ),
      defaultMeta: { service: 'xrpl-nft-monitor' },
      transports: [
        // Daily rotating file for all logs
        new DailyRotateFile({
          filename: 'logs/application-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
        // Separate daily rotating file for transaction debugging
        new DailyRotateFile({
          filename: 'logs/transactions-%DATE%.log',
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '50m',
          maxFiles: '7d',
          level: 'debug',
          format: format.combine(
            format.timestamp(),
            format.printf(({ timestamp, level, message, service, ...meta }) => {
              return `${timestamp} [${level.toUpperCase()}] ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
            })
          ),
        }),
        // Console output
        new transports.Console({
          format: format.combine(
            format.colorize(),
            format.simple()
          )
        })
      ]
    });
  }

  log(message: string, context?: string): void {
    this.winston.info(message, { context });
  }

  error(message: string, trace?: string, context?: string): void {
    this.winston.error(message, { context, trace });
  }

  warn(message: string, context?: string): void {
    this.winston.warn(message, { context });
  }

  debug(message: string, contextOrData?: string | any): void {
    if (typeof contextOrData === 'string') {
      this.winston.debug(message, { context: contextOrData });
    } else {
      this.winston.debug(message, contextOrData || {});
    }
  }

  verbose(message: string, context?: string): void {
    this.winston.verbose(message, { context });
  }

  // New method specifically for transaction logging
  logTransaction(transactionType: string, ledgerIndex: number, isNFT: boolean, extra?: any): void {
    this.winston.debug(`TX: ${transactionType} | Ledger: ${ledgerIndex} | NFT: ${isNFT}`, { 
      transactionType, 
      ledgerIndex, 
      isNFT,
      ...extra
    });
  }

}
