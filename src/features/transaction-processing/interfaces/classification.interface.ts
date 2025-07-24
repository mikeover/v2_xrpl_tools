export interface ClassificationRule {
  id: string;
  name: string;
  description: string;
  transactionTypes: string[];
  conditions: ClassificationCondition[];
  activityType: string;
  confidence: number;
  enabled: boolean;
  priority: number;
}

export interface ClassificationCondition {
  field: string;
  operator: 'equals' | 'contains' | 'exists' | 'greater_than' | 'less_than' | 'regex';
  value?: any;
  required: boolean;
}

export interface ClassificationMetrics {
  totalProcessed: number;
  classified: number;
  rejected: number;
  averageConfidence: number;
  averageProcessingTime: number;
  errorRate: number;
  qualityBreakdown: {
    high: number;     // >= 0.8
    medium: number;   // 0.5 - 0.8
    low: number;      // < 0.5
  };
  activityTypeDistribution: Record<string, number>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  score: number; // 0-1
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  recommendation: string;
  code: string;
}

export enum ClassificationConfidence {
  HIGH = 0.8,
  MEDIUM = 0.5,
  LOW = 0.2,
}

export const CLASSIFICATION_CONSTANTS = {
  DEFAULT_BATCH_SIZE: 100,
  MAX_PROCESSING_TIME: 5000, // 5 seconds
  MIN_DATA_QUALITY_SCORE: 0.6,
  CACHE_TTL: 3600, // 1 hour
  METRICS_RETENTION_DAYS: 30,
} as const;