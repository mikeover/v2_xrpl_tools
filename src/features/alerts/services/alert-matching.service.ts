import { Injectable } from '@nestjs/common';
import { AlertConfigRepository } from '../repositories/alert-config.repository';
import { LoggerService } from '../../../core/logger/logger.service';
import { AlertConfigEntity } from '../../../database/entities/alert-config.entity';
import { AlertMatchResult, TraitFilter } from '../interfaces/alert.interface';

export interface NFTActivity {
  id: string;
  nftId: string;
  transactionHash: string;
  ledgerIndex: number;
  activityType: string;
  fromAddress?: string;
  toAddress?: string;
  priceDrops?: string;
  currency?: string;
  issuer?: string;
  timestamp: Date;
  nft?: {
    id: string;
    nftId: string;
    collectionId?: string;
    ownerAddress: string;
    metadata?: any;
    traits?: any;
    imageUrl?: string;
    collection?: {
      id: string;
      issuerAddress: string;
      taxon: number;
      name?: string;
    };
  };
}

@Injectable()
export class AlertMatchingService {
  constructor(
    private readonly alertConfigRepository: AlertConfigRepository,
    private readonly logger: LoggerService,
  ) {}

  async findMatchingAlerts(activity: NFTActivity): Promise<AlertMatchResult[]> {
    try {
      // Get alerts that might match this activity
      const potentialAlerts = await this.alertConfigRepository.findAlertsMatchingActivity(
        activity.activityType,
        activity.nft?.collectionId,
      );

      const results: AlertMatchResult[] = [];

      for (const alert of potentialAlerts) {
        const matchResult = this.evaluateAlertMatch(alert, activity);
        results.push(matchResult);

        if (matchResult.matched) {
          this.logger.debug(
            `Alert ${alert.id} matched activity ${activity.id}: ${matchResult.reasons?.join(', ')}`,
          );
        }
      }

      return results;
    } catch (error) {
      this.logger.error(
        `Error finding matching alerts for activity ${activity.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }

  private evaluateAlertMatch(alert: AlertConfigEntity, activity: NFTActivity): AlertMatchResult {
    const reasons: string[] = [];
    let matched = true;

    // Check if alert is active
    if (!alert.isActive) {
      return {
        alertConfigId: alert.id,
        matched: false,
        reasons: ['Alert is not active'],
      };
    }

    // Check activity type (already filtered in query, but double-check)
    if (!alert.activityTypes.includes(activity.activityType)) {
      return {
        alertConfigId: alert.id,
        matched: false,
        reasons: ['Activity type does not match'],
      };
    }
    reasons.push(`Activity type matches: ${activity.activityType}`);

    // Check collection (if alert is collection-specific)
    if (alert.collectionId) {
      if (!activity.nft?.collectionId || alert.collectionId !== activity.nft.collectionId) {
        return {
          alertConfigId: alert.id,
          matched: false,
          reasons: ['Collection does not match'],
        };
      }
      reasons.push(`Collection matches: ${alert.collectionId}`);
    } else {
      reasons.push('Alert applies to all collections');
    }

    // Check price filters (if activity has price information)
    if (activity.priceDrops && (alert.minPriceDrops || alert.maxPriceDrops)) {
      const activityPrice = BigInt(activity.priceDrops);

      if (alert.minPriceDrops) {
        const minPrice = BigInt(alert.minPriceDrops);
        if (activityPrice < minPrice) {
          return {
            alertConfigId: alert.id,
            matched: false,
            reasons: [`Price ${activity.priceDrops} is below minimum ${alert.minPriceDrops}`],
          };
        }
        reasons.push(`Price is above minimum: ${activity.priceDrops} >= ${alert.minPriceDrops}`);
      }

      if (alert.maxPriceDrops) {
        const maxPrice = BigInt(alert.maxPriceDrops);
        if (activityPrice > maxPrice) {
          return {
            alertConfigId: alert.id,
            matched: false,
            reasons: [`Price ${activity.priceDrops} is above maximum ${alert.maxPriceDrops}`],
          };
        }
        reasons.push(`Price is below maximum: ${activity.priceDrops} <= ${alert.maxPriceDrops}`);
      }
    } else if (alert.minPriceDrops || alert.maxPriceDrops) {
      // Alert has price filters but activity has no price information
      return {
        alertConfigId: alert.id,
        matched: false,
        reasons: ['Alert has price filters but activity has no price information'],
      };
    }

    // Check trait filters (if alert has trait filters and NFT has traits)
    if (alert.traitFilters && Array.isArray(alert.traitFilters) && alert.traitFilters.length > 0) {
      if (!activity.nft?.traits) {
        return {
          alertConfigId: alert.id,
          matched: false,
          reasons: ['Alert has trait filters but NFT has no trait information'],
        };
      }

      const traitMatchResults = this.evaluateTraitFilters(
        alert.traitFilters as TraitFilter[],
        activity.nft.traits,
      );

      if (!traitMatchResults.matched) {
        return {
          alertConfigId: alert.id,
          matched: false,
          reasons: traitMatchResults.reasons,
        };
      }

      reasons.push(...traitMatchResults.reasons);
    }

    return {
      alertConfigId: alert.id,
      matched,
      reasons,
    };
  }

  private evaluateTraitFilters(
    filters: TraitFilter[],
    nftTraits: any,
  ): { matched: boolean; reasons: string[] } {
    const reasons: string[] = [];

    for (const filter of filters) {
      const traitValue = this.findTraitValue(nftTraits, filter.traitType);

      if (traitValue === null || traitValue === undefined) {
        return {
          matched: false,
          reasons: [`NFT does not have trait: ${filter.traitType}`],
        };
      }

      const filterResult = this.evaluateTraitFilter(filter, traitValue);
      if (!filterResult.matched) {
        return {
          matched: false,
          reasons: filterResult.reasons,
        };
      }

      reasons.push(...filterResult.reasons);
    }

    return {
      matched: true,
      reasons,
    };
  }

  private findTraitValue(nftTraits: any, traitType: string): any {
    // Handle different trait data structures
    if (Array.isArray(nftTraits)) {
      // Standard NFT metadata format
      const trait = nftTraits.find(
        (t: any) => t.trait_type === traitType || t.type === traitType || t.name === traitType,
      );
      return trait?.value;
    } else if (typeof nftTraits === 'object' && nftTraits !== null) {
      // Object format
      return nftTraits[traitType];
    }

    return null;
  }

  private evaluateTraitFilter(
    filter: TraitFilter,
    traitValue: any,
  ): { matched: boolean; reasons: string[] } {
    const filterValue = filter.value;
    const operator = filter.operator;

    switch (operator) {
      case 'equals':
        if (traitValue == filterValue) {
          return {
            matched: true,
            reasons: [`Trait ${filter.traitType} equals ${filterValue}`],
          };
        }
        return {
          matched: false,
          reasons: [`Trait ${filter.traitType} (${traitValue}) does not equal ${filterValue}`],
        };

      case 'not_equals':
        if (traitValue != filterValue) {
          return {
            matched: true,
            reasons: [`Trait ${filter.traitType} does not equal ${filterValue}`],
          };
        }
        return {
          matched: false,
          reasons: [`Trait ${filter.traitType} (${traitValue}) equals ${filterValue} (should not)`],
        };

      case 'greater_than':
        const numericValue = Number(traitValue);
        const numericFilter = Number(filterValue);
        
        if (isNaN(numericValue) || isNaN(numericFilter)) {
          return {
            matched: false,
            reasons: [`Cannot compare non-numeric values: ${traitValue} > ${filterValue}`],
          };
        }
        
        if (numericValue > numericFilter) {
          return {
            matched: true,
            reasons: [`Trait ${filter.traitType} (${numericValue}) > ${numericFilter}`],
          };
        }
        return {
          matched: false,
          reasons: [`Trait ${filter.traitType} (${numericValue}) is not > ${numericFilter}`],
        };

      case 'less_than':
        const numValue = Number(traitValue);
        const numFilter = Number(filterValue);
        
        if (isNaN(numValue) || isNaN(numFilter)) {
          return {
            matched: false,
            reasons: [`Cannot compare non-numeric values: ${traitValue} < ${filterValue}`],
          };
        }
        
        if (numValue < numFilter) {
          return {
            matched: true,
            reasons: [`Trait ${filter.traitType} (${numValue}) < ${numFilter}`],
          };
        }
        return {
          matched: false,
          reasons: [`Trait ${filter.traitType} (${numValue}) is not < ${numFilter}`],
        };

      case 'contains':
        const stringValue = String(traitValue).toLowerCase();
        const stringFilter = String(filterValue).toLowerCase();
        
        if (stringValue.includes(stringFilter)) {
          return {
            matched: true,
            reasons: [`Trait ${filter.traitType} contains "${filterValue}"`],
          };
        }
        return {
          matched: false,
          reasons: [`Trait ${filter.traitType} (${traitValue}) does not contain "${filterValue}"`],
        };

      default:
        return {
          matched: false,
          reasons: [`Unknown operator: ${operator}`],
        };
    }
  }

  async getAlertMatchingStats(_alertId: string): Promise<{
    totalActivities: number;
    matchedActivities: number;
    matchingRate: number;
  }> {
    // TODO: Implement when we have the notifications system
    // This would query the notifications table to get matching statistics
    return {
      totalActivities: 0,
      matchedActivities: 0,
      matchingRate: 0,
    };
  }
}