import { Controller, Get, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { TransactionIngestionService } from '../services/transaction-ingestion.service';
import { TransactionBatchProcessorService } from '../services/transaction-batch-processor.service';
import { TransactionDeduplicationService } from '../services/transaction-deduplication.service';
import { LoggerService } from '../../../core/logger/logger.service';

@Controller('api/transaction-ingestion')
export class TransactionIngestionController {
  constructor(
    private readonly ingestionService: TransactionIngestionService,
    private readonly batchProcessor: TransactionBatchProcessorService,
    private readonly deduplication: TransactionDeduplicationService,
    private readonly logger: LoggerService,
  ) {}

  @Get('status')
  async getIngestionStatus(): Promise<{
    ingestion: ReturnType<TransactionIngestionService['getIngestionStats']>;
    processing: {
      queueSize: number;
      activeProcesses: string[];
    };
    deduplication: ReturnType<TransactionDeduplicationService['getCacheStats']>;
    database: Awaited<ReturnType<TransactionBatchProcessorService['getProcessingStats']>>;
  }> {
    try {
      const [ingestionStats, processingStats, deduplicationStats, databaseStats] = await Promise.all([
        this.ingestionService.getIngestionStats(),
        {
          queueSize: this.batchProcessor.getCurrentQueueSize(),
          activeProcesses: this.batchProcessor.getActiveProcesses(),
        },
        this.deduplication.getCacheStats(),
        this.batchProcessor.getProcessingStats(),
      ]);

      return {
        ingestion: ingestionStats,
        processing: processingStats,
        deduplication: deduplicationStats,
        database: databaseStats,
      };
    } catch (error) {
      this.logger.error(
        `Error getting ingestion status: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Get('health')
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'unhealthy' | 'degraded';
    checks: {
      ingestion: boolean;
      processing: boolean;
      deduplication: boolean;
      database: boolean;
    };
    details: Record<string, any>;
  }> {
    try {
      const stats = await this.getIngestionStatus();
      
      const checks = {
        ingestion: !stats.ingestion.isProcessing || stats.ingestion.currentBatchSize < 100,
        processing: stats.processing.queueSize < 10,
        deduplication: stats.deduplication.size < stats.deduplication.maxSize * 0.9,
        database: stats.database.totalActivities > 0,
      };

      const healthyChecks = Object.values(checks).filter(Boolean).length;
      const totalChecks = Object.values(checks).length;

      let status: 'healthy' | 'unhealthy' | 'degraded';
      if (healthyChecks === totalChecks) {
        status = 'healthy';
      } else if (healthyChecks >= totalChecks / 2) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        checks,
        details: {
          ingestionStats: stats.ingestion,
          processingStats: stats.processing,
          deduplicationStats: stats.deduplication,
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting health status: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      return {
        status: 'unhealthy',
        checks: {
          ingestion: false,
          processing: false,
          deduplication: false,
          database: false,
        },
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  @Post('force-batch-process')
  @HttpCode(HttpStatus.OK)
  async forceBatchProcess(): Promise<{ message: string; timestamp: string }> {
    try {
      this.logger.log('Manual batch processing triggered');
      await this.ingestionService.forceProcessBatch();
      
      return {
        message: 'Batch processing completed successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error in manual batch processing: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Post('clear-deduplication-cache')
  @HttpCode(HttpStatus.OK)
  async clearDeduplicationCache(): Promise<{ message: string; timestamp: string }> {
    try {
      this.logger.log('Manual deduplication cache clear triggered');
      await this.deduplication.clearCache();
      
      return {
        message: 'Deduplication cache cleared successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error clearing deduplication cache: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Post('start-ingestion')
  @HttpCode(HttpStatus.OK)
  async startIngestion(): Promise<{ message: string; timestamp: string }> {
    try {
      this.logger.log('Manual ingestion start triggered');
      await this.ingestionService.startIngestion();
      
      return {
        message: 'Transaction ingestion started successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error starting ingestion: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Post('stop-ingestion')
  @HttpCode(HttpStatus.OK)
  async stopIngestion(): Promise<{ message: string; timestamp: string }> {
    try {
      this.logger.log('Manual ingestion stop triggered');
      await this.ingestionService.stopIngestion();
      
      return {
        message: 'Transaction ingestion stopped successfully',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error stopping ingestion: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Post('reprocess-failed')
  @HttpCode(HttpStatus.OK)
  async reprocessFailed(): Promise<{ message: string; timestamp: string }> {
    try {
      this.logger.log('Manual reprocess failed transactions triggered');
      await this.ingestionService.reprocessFailedTransactions();
      
      return {
        message: 'Failed transaction reprocessing initiated',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error(
        `Error reprocessing failed transactions: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  @Get('debug/recent-transactions')
  async getRecentTransactionTypes(): Promise<{ 
    message: string; 
    stats: { transactionType: string; count: number }[];
  }> {
    // This is a debug endpoint to see what transaction types we're receiving
    return {
      message: 'Debug endpoint - check logs for transaction type details',
      stats: [],
    };
  }
}