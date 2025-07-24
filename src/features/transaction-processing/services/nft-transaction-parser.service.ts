import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../core/logger/logger.service';
import {
  NFTTransactionData,
  NFTActivityType,
  NFTTransactionType,
  NFT_TRANSACTION_TYPES,
} from '../interfaces/transaction.interface';
import { TRANSACTION_ERRORS } from '../constants/transaction.constants';

@Injectable()
export class NFTTransactionParserService {
  constructor(private readonly logger: LoggerService) {}

  isNFTTransaction(transaction: any): boolean {
    const txType = transaction.TransactionType || transaction.transaction_type;
    const isNFT = NFT_TRANSACTION_TYPES.includes(txType as NFTTransactionType);
    
    // Debug logging for NFT detection
    if (txType?.startsWith('NFToken')) {
      this.logger.debug(`NFT Transaction Check: ${txType} -> ${isNFT ? 'ACCEPTED' : 'REJECTED'}`);
    }
    
    return isNFT;
  }

  parseNFTTransaction(transactionMessage: any): NFTTransactionData | null {
    try {
      const tx = transactionMessage.transaction || transactionMessage;
      const meta = transactionMessage.meta || transactionMessage.metaData;

      if (!this.isNFTTransaction(tx)) {
        return null;
      }

      const baseData: Partial<NFTTransactionData> = {
        transactionHash: tx.hash || tx.Hash,
        ledgerIndex: transactionMessage.ledger_index || tx.ledger_index,
        timestamp: this.parseTimestamp(tx.date || tx.Date),
        fromAddress: tx.Account,
        metadata: {
          transactionType: tx.TransactionType,
          fee: tx.Fee,
          sequence: tx.Sequence,
          flags: tx.Flags,
          engineResult: transactionMessage.engine_result,
          meta: meta,
        },
      };

      // Parse specific NFT transaction types
      switch (tx.TransactionType) {
        case 'NFTokenMint':
          return this.parseNFTokenMint(tx, meta, baseData);

        case 'NFTokenBurn':
          return this.parseNFTokenBurn(tx, meta, baseData);

        case 'NFTokenCreateOffer':
          return this.parseNFTokenCreateOffer(tx, meta, baseData);

        case 'NFTokenAcceptOffer':
          return this.parseNFTokenAcceptOffer(tx, meta, baseData);

        case 'NFTokenCancelOffer':
          return this.parseNFTokenCancelOffer(tx, meta, baseData);

        case 'Payment':
          return this.parseNFTPayment(tx, meta, baseData);

        default:
          this.logger.warn(`Unhandled NFT transaction type: ${tx.TransactionType}`);
          return null;
      }
    } catch (error) {
      this.logger.error(
        `Error parsing NFT transaction: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new Error(TRANSACTION_ERRORS.NFT_PARSING_FAILED);
    }
  }

  private parseNFTokenMint(
    tx: any,
    meta: any,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    const nftTokenID = this.extractNFTTokenIDFromMeta(meta);

    return {
      ...baseData,
      activityType: NFTActivityType.MINT,
      nftTokenID,
      toAddress: tx.Account, // Minter becomes initial owner
      metadata: {
        ...baseData.metadata,
        taxon: tx.NFTokenTaxon,
        transferFee: tx.TransferFee,
        flags: tx.Flags,
        uri: tx.URI,
        minter: tx.Account,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenBurn(
    tx: any,
    _meta: any,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    return {
      ...baseData,
      activityType: NFTActivityType.BURN,
      nftTokenID: tx.NFTokenID,
      metadata: {
        ...baseData.metadata,
        burner: tx.Account,
        owner: tx.Owner,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenCreateOffer(
    tx: any,
    _meta: any,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    const amount = this.parseAmount(tx.Amount);

    return {
      ...baseData,
      activityType: NFTActivityType.OFFER_CREATED,
      nftTokenID: tx.NFTokenID,
      priceDrops: amount.value,
      currency: amount.currency,
      issuer: amount.issuer,
      toAddress: tx.Destination,
      metadata: {
        ...baseData.metadata,
        owner: tx.Owner,
        destination: tx.Destination,
        expiration: tx.Expiration,
        flags: tx.Flags,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenAcceptOffer(
    tx: any,
    meta: any,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    // Extract offer details from metadata
    const offerDetails = this.extractOfferDetailsFromMeta(meta, tx);

    return {
      ...baseData,
      activityType: NFTActivityType.OFFER_ACCEPTED,
      nftTokenID: offerDetails.nftTokenID,
      priceDrops: offerDetails.amount?.value,
      currency: offerDetails.amount?.currency,
      issuer: offerDetails.amount?.issuer,
      fromAddress: offerDetails.seller,
      toAddress: offerDetails.buyer,
      metadata: {
        ...baseData.metadata,
        buyOfferID: tx.NFTokenBuyOffer,
        sellOfferID: tx.NFTokenSellOffer,
        broker: tx.Account,
        brokerFee: tx.BrokerFee,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenCancelOffer(
    tx: any,
    _meta: any,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    return {
      ...baseData,
      activityType: NFTActivityType.OFFER_CANCELLED,
      metadata: {
        ...baseData.metadata,
        cancelledOffers: tx.NFTokenOffers,
      },
    } as NFTTransactionData;
  }

  private parseNFTPayment(
    tx: any,
    meta: any,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData | null {
    // Check if this payment involves NFT transfer
    const nftTokenID = this.extractNFTTokenIDFromMeta(meta);
    if (!nftTokenID) {
      return null; // Not an NFT payment
    }

    const amount = this.parseAmount(tx.Amount);

    return {
      ...baseData,
      activityType: NFTActivityType.SALE,
      nftTokenID,
      toAddress: tx.Destination,
      priceDrops: amount.value,
      currency: amount.currency,
      issuer: amount.issuer,
      metadata: {
        ...baseData.metadata,
        destination: tx.Destination,
        destinationTag: tx.DestinationTag,
        sourceTag: tx.SourceTag,
        memos: tx.Memos,
      },
    } as NFTTransactionData;
  }

  private parseTimestamp(date: number | string): Date {
    if (typeof date === 'number') {
      // XRPL timestamp is seconds since January 1, 2000 (00:00:00) UTC
      // Convert to JavaScript timestamp (milliseconds since January 1, 1970)
      const rippleEpoch = new Date('2000-01-01T00:00:00.000Z').getTime();
      return new Date(rippleEpoch + date * 1000);
    }
    return new Date(date);
  }

  private parseAmount(amount: any): { value: string; currency: string; issuer?: string } {
    if (typeof amount === 'string') {
      // XRP amount in drops
      return {
        value: amount,
        currency: 'XRP',
      };
    } else if (typeof amount === 'object' && amount.value) {
      // IOU amount
      return {
        value: amount.value,
        currency: amount.currency,
        issuer: amount.issuer,
      };
    }

    return {
      value: '0',
      currency: 'XRP',
    };
  }

  private extractNFTTokenIDFromMeta(meta: any): string | undefined {
    if (!meta || !meta.AffectedNodes) {
      return undefined;
    }

    // Look for NFToken object creation or modification
    for (const node of meta.AffectedNodes) {
      if (node.CreatedNode?.LedgerEntryType === 'NFToken') {
        return node.CreatedNode.NewFields?.NFTokenID;
      }
      if (node.ModifiedNode?.LedgerEntryType === 'NFToken') {
        return node.ModifiedNode.FinalFields?.NFTokenID;
      }
      if (node.DeletedNode?.LedgerEntryType === 'NFToken') {
        return node.DeletedNode.FinalFields?.NFTokenID;
      }
    }

    return undefined;
  }

  private extractOfferDetailsFromMeta(
    meta: any,
    tx: any,
  ): {
    nftTokenID?: string | undefined;
    amount?: { value: string; currency: string; issuer?: string } | undefined;
    seller?: string | undefined;
    buyer?: string | undefined;
  } {
    if (!meta || !meta.AffectedNodes) {
      return {};
    }

    let nftTokenID: string | undefined;
    let amount: { value: string; currency: string; issuer?: string } | undefined;
    let seller: string | undefined;
    let buyer: string | undefined;

    // Extract details from affected nodes
    for (const node of meta.AffectedNodes) {
      if (node.DeletedNode?.LedgerEntryType === 'NFTokenOffer') {
        const offer = node.DeletedNode.FinalFields;
        nftTokenID = offer.NFTokenID;
        amount = this.parseAmount(offer.Amount);
        
        if (offer.Flags & 1) {
          // Sell offer
          seller = offer.Owner;
          buyer = tx.Account;
        } else {
          // Buy offer
          buyer = offer.Owner;
          seller = tx.Account;
        }
      }
    }

    return { 
      nftTokenID: nftTokenID || undefined, 
      amount: amount || undefined, 
      seller: seller || undefined, 
      buyer: buyer || undefined 
    };
  }
}