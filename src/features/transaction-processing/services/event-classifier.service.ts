import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../core/logger/logger.service';
import { NFTTransactionParserService } from './nft-transaction-parser.service';
import {
  NFTActivityType,
  NFT_TRANSACTION_TYPES,
  NFTTransactionType,
} from '../interfaces/transaction.interface';
import { 
  XRPLTransactionStreamMessage, 
  isTransactionStreamMessage 
} from '../../../shared/types/xrpl-stream.types';

export interface ClassificationResult {
  activityType: NFTActivityType;
  confidence: number; // 0-1 score
  isNFTRelated: boolean;
  dataQuality: DataQualityScore;
  metadata: {
    transactionType: string;
    primaryIndicators: string[];
    secondaryIndicators: string[];
    anomalies: string[];
  };
}

export interface DataQualityScore {
  completeness: number; // 0-1 score for required fields
  validity: number; // 0-1 score for data format validity
  consistency: number; // 0-1 score for logical consistency
  overall: number; // Overall quality score
  issues: string[]; // List of quality issues found
}

export interface ClassificationRules {
  minConfidenceThreshold: number;
  requireMetadata: boolean;
  allowAmbiguousTransactions: boolean;
  strictValidation: boolean;
}

@Injectable()
export class EventClassifierService {
  private readonly defaultRules: ClassificationRules = {
    minConfidenceThreshold: 0.8,
    requireMetadata: true,
    allowAmbiguousTransactions: false,
    strictValidation: true,
  };

  constructor(
    private readonly logger: LoggerService,
    private readonly nftParser: NFTTransactionParserService,
  ) {}

  async classifyTransaction(
    transactionMessage: XRPLTransactionStreamMessage | unknown,
    rules: Partial<ClassificationRules> = {},
  ): Promise<ClassificationResult | null> {
    const effectiveRules = { ...this.defaultRules, ...rules };

    try {
      // First check if this is potentially NFT-related
      const isNFTRelated = this.assessNFTRelevance(transactionMessage);
      
      if (!isNFTRelated) {
        return {
          activityType: NFTActivityType.TRANSFER, // Default
          confidence: 0,
          isNFTRelated: false,
          dataQuality: this.assessDataQuality(transactionMessage, false),
          metadata: {
            transactionType: (transactionMessage as any)?.transaction?.TransactionType || 'unknown',
            primaryIndicators: [],
            secondaryIndicators: [],
            anomalies: ['not_nft_related'],
          },
        };
      }

      // Use the existing parser to get base classification
      const parsedTransaction = this.nftParser.parseNFTTransaction(transactionMessage);
      
      if (!parsedTransaction) {
        return null;
      }

      // Enhance with confidence scoring and validation
      const confidence = this.calculateConfidence(transactionMessage);
      const dataQuality = this.assessDataQuality(transactionMessage, true);
      const metadata = this.extractClassificationMetadata(transactionMessage);

      // Apply rules to determine if we should accept this classification
      if (confidence < effectiveRules.minConfidenceThreshold) {
        this.logger.warn(
          `Low confidence classification (${confidence}) for transaction ${parsedTransaction.transactionHash}`,
        );
        
        if (!effectiveRules.allowAmbiguousTransactions) {
          return null;
        }
      }

      if (effectiveRules.strictValidation && dataQuality.overall < 0.7) {
        this.logger.warn(
          `Low data quality (${dataQuality.overall}) for transaction ${parsedTransaction.transactionHash}`,
        );
        return null;
      }

      return {
        activityType: parsedTransaction.activityType,
        confidence,
        isNFTRelated: true,
        dataQuality,
        metadata,
      };
    } catch (error) {
      this.logger.error(
        `Error classifying transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  async classifyBatch(
    transactions: Array<XRPLTransactionStreamMessage | unknown>,
    rules: Partial<ClassificationRules> = {},
  ): Promise<Array<ClassificationResult | null>> {
    const results = await Promise.allSettled(
      transactions.map((tx) => this.classifyTransaction(tx, rules)),
    );

    return results.map((result) => 
      result.status === 'fulfilled' ? result.value : null
    );
  }

  private assessNFTRelevance(transactionMessage: XRPLTransactionStreamMessage | unknown): boolean {
    // Validate and extract transaction data
    const txData = isTransactionStreamMessage(transactionMessage) 
      ? transactionMessage 
      : (transactionMessage as any);
    
    const tx = txData?.transaction || txData;
    
    // Direct NFT transaction types
    if (NFT_TRANSACTION_TYPES.includes(tx.TransactionType as NFTTransactionType)) {
      return true;
    }

    // Check for NFT-related metadata in other transaction types
    if (tx?.TransactionType === 'Payment') {
      // Look for NFT transfers in metadata
      const meta = txData?.meta || txData?.metaData;
      if (meta?.AffectedNodes) {
        return meta.AffectedNodes.some((node: any) => 
          node.CreatedNode?.LedgerEntryType === 'NFToken' ||
          node.ModifiedNode?.LedgerEntryType === 'NFToken' ||
          node.DeletedNode?.LedgerEntryType === 'NFToken'
        );
      }
    }

    return false;
  }

  private calculateConfidence(transactionMessage: XRPLTransactionStreamMessage | unknown): number {
    const txData = isTransactionStreamMessage(transactionMessage) 
      ? transactionMessage 
      : (transactionMessage as any);
    
    const tx = txData?.transaction || txData;
    const meta = txData?.meta || txData?.metaData;
    
    let confidence = 0;
    let factors = 0;

    // Factor 1: Transaction type certainty (40% weight)
    if (NFT_TRANSACTION_TYPES.includes(tx.TransactionType as NFTTransactionType)) {
      const directNFTTypes = ['NFTokenMint', 'NFTokenBurn', 'NFTokenCreateOffer', 'NFTokenAcceptOffer'];
      confidence += directNFTTypes.includes(tx.TransactionType) ? 0.4 : 0.3;
    }
    factors += 0.4;

    // Factor 2: Metadata completeness (25% weight)
    if (meta && meta.AffectedNodes) {
      const hasNFTNodes = meta.AffectedNodes.some((node: any) => 
        node.CreatedNode?.LedgerEntryType === 'NFToken' ||
        node.ModifiedNode?.LedgerEntryType === 'NFToken' ||
        node.DeletedNode?.LedgerEntryType === 'NFToken'
      );
      
      if (hasNFTNodes) {
        confidence += 0.25;
      } else {
        confidence += 0.1;
      }
    }
    factors += 0.25;

    // Factor 3: Transaction result success (20% weight)
    if (txData?.engine_result === 'tesSUCCESS') {
      confidence += 0.2;
    } else if (txData?.engine_result?.startsWith('tes')) {
      confidence += 0.1;
    }
    factors += 0.2;

    // Factor 4: Data consistency (15% weight)
    const consistency = this.checkDataConsistency(txData);
    confidence += consistency * 0.15;
    factors += 0.15;

    return Math.min(confidence / factors, 1.0);
  }

  private assessDataQuality(transactionMessage: XRPLTransactionStreamMessage | unknown, isNFTRelated: boolean): DataQualityScore {
    const txData = isTransactionStreamMessage(transactionMessage) 
      ? transactionMessage 
      : (transactionMessage as any);
    
    const tx = txData?.transaction || txData;
    // const meta = txData?.meta || txData?.metaData; // Available if needed
    
    let completeness = 0;
    let validity = 0;
    let consistency = 0;
    const issues: string[] = [];

    // Completeness check
    const requiredFields = ['hash', 'TransactionType', 'Account'];
    const nftRequiredFields = isNFTRelated ? ['ledger_index', 'timestamp'] : [];
    const allRequired = [...requiredFields, ...nftRequiredFields];
    
    const presentFields = allRequired.filter(field => 
      tx?.[field] !== undefined || txData?.[field] !== undefined
    );
    completeness = presentFields.length / allRequired.length;
    
    if (completeness < 1) {
      issues.push(`missing_fields: ${allRequired.filter(f => !presentFields.includes(f)).join(', ')}`);
    }

    // Validity check
    let validFields = 0;
    let totalChecked = 0;

    // Check hash format
    const hash = tx.hash || tx.Hash;
    if (hash) {
      totalChecked++;
      if (/^[A-F0-9]{64}$/i.test(hash)) {
        validFields++;
      } else {
        issues.push('invalid_hash_format');
      }
    }

    // Check account address format
    if (tx.Account) {
      totalChecked++;
      if (/^r[a-zA-Z0-9]{24,34}$/.test(tx.Account)) {
        validFields++;
      } else {
        issues.push('invalid_account_format');
      }
    }

    // Check ledger index
    const ledgerIndex = txData?.ledger_index;
    if (ledgerIndex !== undefined) {
      totalChecked++;
      if (Number.isInteger(ledgerIndex) && ledgerIndex > 0) {
        validFields++;
      } else {
        issues.push('invalid_ledger_index');
      }
    }

    validity = totalChecked > 0 ? validFields / totalChecked : 1;

    // Consistency check
    consistency = this.checkDataConsistency(txData);
    
    const overall = (completeness + validity + consistency) / 3;

    return {
      completeness,
      validity,
      consistency,
      overall,
      issues,
    };
  }

  private checkDataConsistency(transactionMessage: XRPLTransactionStreamMessage | unknown): number {
    const txData = isTransactionStreamMessage(transactionMessage) 
      ? transactionMessage 
      : (transactionMessage as any);
    
    const tx = txData?.transaction || txData;
    const meta = txData?.meta || txData?.metaData;
    
    let consistencyScore = 1.0;

    // Check if transaction result matches metadata
    if (txData?.engine_result === 'tesSUCCESS' && meta) {
      // Successful transactions should have affected nodes
      if (!meta.AffectedNodes || meta.AffectedNodes.length === 0) {
        consistencyScore -= 0.3;
      }
    }

    // Check timestamp consistency
    const txDate = tx?.date || tx?.Date;
    const ledgerIndex = txData?.ledger_index;
    if (txDate && ledgerIndex) {
      // Basic sanity check: newer ledgers should have newer timestamps
      // This is a simplified check - in reality, you'd need historical ledger data
      if (txDate < 0 || ledgerIndex < 0) {
        consistencyScore -= 0.2;
      }
    }

    // Check NFT-specific consistency
    if (tx?.TransactionType === 'NFTokenMint' && meta?.AffectedNodes) {
      const hasNFTCreation = meta.AffectedNodes.some((node: any) =>
        node.CreatedNode?.LedgerEntryType === 'NFToken'
      );
      if (!hasNFTCreation) {
        consistencyScore -= 0.4;
      }
    }

    return Math.max(consistencyScore, 0);
  }

  private extractClassificationMetadata(transactionMessage: XRPLTransactionStreamMessage | unknown): {
    transactionType: string;
    primaryIndicators: string[];
    secondaryIndicators: string[];
    anomalies: string[];
  } {
    const txData = isTransactionStreamMessage(transactionMessage) 
      ? transactionMessage 
      : (transactionMessage as any);
    
    const tx = txData?.transaction || txData;
    const meta = txData?.meta || txData?.metaData;

    const primaryIndicators: string[] = [];
    const secondaryIndicators: string[] = [];
    const anomalies: string[] = [];

    // Primary indicators
    if (NFT_TRANSACTION_TYPES.includes(tx?.TransactionType as NFTTransactionType)) {
      primaryIndicators.push(`transaction_type:${tx?.TransactionType}`);
    }

    if (meta?.AffectedNodes) {
      const nftNodes = meta.AffectedNodes.filter((node: any) =>
        node.CreatedNode?.LedgerEntryType === 'NFToken' ||
        node.ModifiedNode?.LedgerEntryType === 'NFToken' ||
        node.DeletedNode?.LedgerEntryType === 'NFToken'
      );
      
      if (nftNodes.length > 0) {
        primaryIndicators.push(`nft_affected_nodes:${nftNodes.length}`);
      }
    }

    // Secondary indicators
    if (tx?.Fee) {
      secondaryIndicators.push(`fee:${tx.Fee}`);
    }

    if (tx?.Flags) {
      secondaryIndicators.push(`flags:${tx.Flags}`);
    }

    // Anomalies
    if (txData?.engine_result !== 'tesSUCCESS') {
      anomalies.push(`failed_transaction:${txData?.engine_result}`);
    }

    if (tx?.TransactionType === 'Payment' && !meta?.AffectedNodes?.some((node: any) =>
      node.CreatedNode?.LedgerEntryType === 'NFToken' ||
      node.ModifiedNode?.LedgerEntryType === 'NFToken'
    )) {
      anomalies.push('payment_without_nft_transfer');
    }

    return {
      transactionType: tx?.TransactionType || 'unknown',
      primaryIndicators,
      secondaryIndicators,
      anomalies,
    };
  }

  // Public utility methods
  getClassificationStats(): {
    totalClassified: number;
    averageConfidence: number;
    qualityDistribution: Record<string, number>;
  } {
    // This would be implemented with actual usage tracking
    return {
      totalClassified: 0,
      averageConfidence: 0,
      qualityDistribution: {},
    };
  }

  validateClassificationRules(rules: ClassificationRules): string[] {
    const errors: string[] = [];

    if (rules.minConfidenceThreshold < 0 || rules.minConfidenceThreshold > 1) {
      errors.push('minConfidenceThreshold must be between 0 and 1');
    }

    return errors;
  }
}