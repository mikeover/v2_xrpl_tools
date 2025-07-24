import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus } from '@nestjs/common';
import { EventClassifierService, ClassificationResult, ClassificationRules } from '../services/event-classifier.service';
import { LoggerService } from '../../../core/logger/logger.service';

interface ClassifyTransactionRequest {
  transaction: any;
  rules?: Partial<ClassificationRules>;
}

interface ClassifyBatchRequest {
  transactions: any[];
  rules?: Partial<ClassificationRules>;
}

interface ClassificationStatsResponse {
  totalClassified: number;
  averageConfidence: number;
  qualityDistribution: Record<string, number>;
  processing: {
    averageTimeMs: number;
    successRate: number;
    errorRate: number;
  };
}

@Controller('api/event-classifier')
export class EventClassifierController {
  constructor(
    private readonly classifierService: EventClassifierService,
    private readonly logger: LoggerService,
  ) {}

  @Post('classify')
  @HttpCode(HttpStatus.OK)
  async classifyTransaction(
    @Body() request: ClassifyTransactionRequest,
  ): Promise<{
    success: boolean;
    result: ClassificationResult | null;
    processingTime: number;
  }> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Classifying single transaction');
      
      const result = await this.classifierService.classifyTransaction(
        request.transaction,
        request.rules,
      );
      
      const processingTime = Date.now() - startTime;
      
      return {
        success: true,
        result,
        processingTime,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error(
        `Error classifying transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      return {
        success: false,
        result: null,
        processingTime,
      };
    }
  }

  @Post('classify-batch')
  @HttpCode(HttpStatus.OK)
  async classifyBatch(
    @Body() request: ClassifyBatchRequest,
  ): Promise<{
    success: boolean;
    results: Array<ClassificationResult | null>;
    summary: {
      total: number;
      classified: number;
      rejected: number;
      averageConfidence: number;
      processingTime: number;
    };
  }> {
    const startTime = Date.now();
    
    try {
      this.logger.debug(`Classifying batch of ${request.transactions.length} transactions`);
      
      const results = await this.classifierService.classifyBatch(
        request.transactions,
        request.rules,
      );
      
      const processingTime = Date.now() - startTime;
      
      // Calculate summary statistics
      const classified = results.filter(r => r !== null).length;
      const rejected = results.length - classified;
      const confidenceValues = results
        .filter(r => r !== null)
        .map(r => r!.confidence);
      const averageConfidence = confidenceValues.length > 0 
        ? confidenceValues.reduce((a, b) => a + b, 0) / confidenceValues.length 
        : 0;
      
      const summary = {
        total: results.length,
        classified,
        rejected,
        averageConfidence,
        processingTime,
      };
      
      return {
        success: true,
        results,
        summary,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      this.logger.error(
        `Error classifying batch: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      return {
        success: false,
        results: [],
        summary: {
          total: request.transactions.length,
          classified: 0,
          rejected: request.transactions.length,
          averageConfidence: 0,
          processingTime,
        },
      };
    }
  }

  @Get('stats')
  async getClassificationStats(
    @Query('period') _period?: string,
  ): Promise<ClassificationStatsResponse> {
    try {
      const stats = this.classifierService.getClassificationStats();
      
      return {
        totalClassified: stats.totalClassified,
        averageConfidence: stats.averageConfidence,
        qualityDistribution: stats.qualityDistribution,
        processing: {
          averageTimeMs: 0, // TODO: Implement timing metrics
          successRate: 0.95, // TODO: Implement success rate tracking
          errorRate: 0.05, // TODO: Implement error rate tracking
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting classification stats: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      return {
        totalClassified: 0,
        averageConfidence: 0,
        qualityDistribution: {},
        processing: {
          averageTimeMs: 0,
          successRate: 0,
          errorRate: 1,
        },
      };
    }
  }

  @Get('health')
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: {
      service: boolean;
      performance: boolean;
      accuracy: boolean;
    };
    details: {
      uptime: number;
      memoryUsage: number;
      averageResponseTime: number;
      errorRate: number;
    };
  }> {
    try {
      const stats = this.classifierService.getClassificationStats();
      
      // Simple health checks
      const checks = {
        service: true, // Service is responding
        performance: true, // TODO: Check if average response time is acceptable
        accuracy: stats.averageConfidence > 0.7, // TODO: Check classification accuracy
      };
      
      const healthyChecks = Object.values(checks).filter(Boolean).length;
      const totalChecks = Object.values(checks).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
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
          uptime: process.uptime(),
          memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
          averageResponseTime: 0, // TODO: Implement response time tracking
          errorRate: 0, // TODO: Implement error rate tracking
        },
      };
    } catch (error) {
      this.logger.error(
        `Error getting health status: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      return {
        status: 'unhealthy',
        checks: {
          service: false,
          performance: false,
          accuracy: false,
        },
        details: {
          uptime: 0,
          memoryUsage: 0,
          averageResponseTime: 0,
          errorRate: 1,
        },
      };
    }
  }

  @Post('validate-rules')
  @HttpCode(HttpStatus.OK)
  async validateRules(
    @Body() rules: ClassificationRules,
  ): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    try {
      const errors = this.classifierService.validateClassificationRules(rules);
      
      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error(
        `Error validating rules: ${error instanceof Error ? error.message : String(error)}`,
      );
      
      return {
        valid: false,
        errors: [error instanceof Error ? error.message : String(error)],
      };
    }
  }
}