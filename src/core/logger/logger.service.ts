import { Injectable, LoggerService as NestLoggerService, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfiguration } from '../../shared/config';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly isDevelopment: boolean;
  private readonly logLevel: string;

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService<AppConfiguration>,
  ) {
    const appConfig = this.configService.get<AppConfiguration['app']>('app');
    const loggingConfig = this.configService.get<AppConfiguration['logging']>('logging');
    
    this.isDevelopment = appConfig?.isDevelopment ?? false;
    this.logLevel = loggingConfig?.level ?? 'info';
  }

  log(message: string, context?: string): void {
    if (this.shouldLog('info')) {
      this.printMessage('info', message, context);
    }
  }

  error(message: string, trace?: string, context?: string): void {
    if (this.shouldLog('error')) {
      this.printMessage('error', message, context);
      if (trace && this.isDevelopment) {
        console.error(trace);
      }
    }
  }

  warn(message: string, context?: string): void {
    if (this.shouldLog('warn')) {
      this.printMessage('warn', message, context);
    }
  }

  debug(message: string, context?: string): void {
    if (this.shouldLog('debug')) {
      this.printMessage('debug', message, context);
    }
  }

  verbose(message: string, context?: string): void {
    if (this.shouldLog('verbose')) {
      this.printMessage('verbose', message, context);
    }
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug', 'verbose'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private printMessage(level: string, message: string, context?: string): void {
    const timestamp = new Date().toISOString();
    const contextString = context ? `[${context}] ` : '';
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${contextString}${message}`;

    switch (level) {
      case 'error':
        console.error(formattedMessage);
        break;
      case 'warn':
        console.warn(formattedMessage);
        break;
      default:
        // eslint-disable-next-line no-console
        console.log(formattedMessage);
    }
  }
}