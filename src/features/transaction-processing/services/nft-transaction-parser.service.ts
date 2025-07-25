import { Injectable } from '@nestjs/common';
import { LoggerService } from '../../../core/logger/logger.service';
import {
  NFTTransactionData,
  NFTActivityType,
  NFTTransactionType,
  NFT_TRANSACTION_TYPES,
} from '../interfaces/transaction.interface';
import { TRANSACTION_ERRORS } from '../constants/transaction.constants';
import { 
  XRPLTransactionStreamMessage,
  Transaction,
  TransactionMetadata,
  isTransactionStreamMessage
} from '../../../shared/types/xrpl-stream.types';

@Injectable()
export class NFTTransactionParserService {
  constructor(private readonly logger: LoggerService) {}

  isNFTTransaction(transaction: Transaction | unknown): boolean {
    // Handle both direct transaction objects and wrapped ones
    const tx = (transaction as any)?.tx_json || transaction;
    const txType = (tx as any)?.TransactionType || (tx as any)?.transaction_type;
    const isNFT = NFT_TRANSACTION_TYPES.includes(txType as NFTTransactionType);
    
    // Debug logging for NFT detection
    if (txType?.startsWith('NFToken')) {
      this.logger.debug(`NFT Transaction Check: ${txType} -> ${isNFT ? 'ACCEPTED' : 'REJECTED'}`);
    }
    
    return isNFT;
  }

  parseNFTTransaction(transactionMessage: XRPLTransactionStreamMessage | unknown): NFTTransactionData | null {
    try {
      // Type-safe data extraction
      const txData = isTransactionStreamMessage(transactionMessage) 
        ? transactionMessage 
        : (transactionMessage as any);
      
      const rawTx = txData?.transaction || txData;
      const tx = (rawTx as any)?.tx_json || rawTx; // The actual transaction data is in tx_json
      const meta = txData?.meta || (rawTx as any)?.meta || txData?.metaData;

      if (!this.isNFTTransaction(tx)) {
        return null;
      }

      const baseData: Partial<NFTTransactionData> = {
        transactionHash: (rawTx as any)?.hash || (tx as any)?.hash || (tx as any)?.Hash || (rawTx as any)?.Hash,
        ledgerIndex: txData?.ledger_index || (rawTx as any)?.ledger_index || (tx as any)?.ledger_index,
        timestamp: this.parseTimestamp((tx as any)?.date || (tx as any)?.Date || (rawTx as any)?.close_time_iso),
        fromAddress: (tx as any)?.Account,
        metadata: {
          transactionType: (tx as any)?.TransactionType,
          fee: (tx as any)?.Fee,
          flags: (tx as any)?.Flags,
          engineResult: (rawTx as any)?.engine_result || txData?.engine_result,
        },
      };

      // Parse specific NFT transaction types
      switch ((tx as any)?.TransactionType) {
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
          this.logger.warn(`Unhandled NFT transaction type: ${(tx as any)?.TransactionType}`);
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
    tx: Transaction | unknown,
    meta: TransactionMetadata | unknown,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    const nftTokenID = this.extractNFTTokenIDFromMeta(meta, tx);

    // Decode URI from hex if present
    const uriHex = (tx as any)?.URI;
    const uriDecoded = uriHex ? this.decodeHexString(uriHex) : null;

    return {
      ...baseData,
      activityType: NFTActivityType.MINT,
      nftTokenID,
      toAddress: (tx as any)?.Account, // Minter becomes initial owner
      metadata: {
        ...baseData.metadata,
        taxon: (tx as any)?.NFTokenTaxon,
        transferFee: (tx as any)?.TransferFee,
        uri: uriDecoded,
        uriHex: uriHex,
        minter: (tx as any)?.Account,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenBurn(
    tx: Transaction | unknown,
    _meta: TransactionMetadata | unknown,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    return {
      ...baseData,
      activityType: NFTActivityType.BURN,
      nftTokenID: (tx as any)?.NFTokenID,
      metadata: {
        ...baseData.metadata,
        burner: (tx as any)?.Account,
        owner: (tx as any)?.Owner,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenCreateOffer(
    tx: Transaction | unknown,
    _meta: TransactionMetadata | unknown,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    const amount = this.parseAmount((tx as any)?.Amount);

    return {
      ...baseData,
      activityType: NFTActivityType.OFFER_CREATED,
      nftTokenID: (tx as any)?.NFTokenID,
      priceDrops: amount.value,
      currency: amount.currency,
      issuer: amount.issuer,
      toAddress: (tx as any)?.Destination,
      metadata: {
        ...baseData.metadata,
        owner: (tx as any)?.Owner,
        destination: (tx as any)?.Destination,
        expiration: (tx as any)?.Expiration,
        flags: (tx as any)?.Flags,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenAcceptOffer(
    tx: Transaction | unknown,
    meta: TransactionMetadata | unknown,
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
        buyOfferID: (tx as any)?.NFTokenBuyOffer,
        sellOfferID: (tx as any)?.NFTokenSellOffer,
        broker: (tx as any)?.Account,
        brokerFee: (tx as any)?.BrokerFee,
      },
    } as NFTTransactionData;
  }

  private parseNFTokenCancelOffer(
    tx: Transaction | unknown,
    _meta: TransactionMetadata | unknown,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData {
    return {
      ...baseData,
      activityType: NFTActivityType.OFFER_CANCELLED,
      metadata: {
        ...baseData.metadata,
        cancelledOffers: (tx as any)?.NFTokenOffers,
      },
    } as NFTTransactionData;
  }

  private parseNFTPayment(
    tx: Transaction | unknown,
    meta: TransactionMetadata | unknown,
    baseData: Partial<NFTTransactionData>,
  ): NFTTransactionData | null {
    // Check if this payment involves NFT transfer
    const nftTokenID = this.extractNFTTokenIDFromMeta(meta);
    if (!nftTokenID) {
      return null; // Not an NFT payment
    }

    const amount = this.parseAmount((tx as any)?.Amount);

    return {
      ...baseData,
      activityType: NFTActivityType.SALE,
      nftTokenID,
      toAddress: (tx as any)?.Destination,
      priceDrops: amount.value,
      currency: amount.currency,
      issuer: amount.issuer,
      metadata: {
        ...baseData.metadata,
        destination: (tx as any)?.Destination,
        destinationTag: (tx as any)?.DestinationTag,
        sourceTag: (tx as any)?.SourceTag,
        memos: (tx as any)?.Memos,
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

  private parseAmount(amount: unknown): { value: string; currency: string; issuer?: string } {
    if (typeof amount === 'string') {
      // XRP amount in drops
      return {
        value: amount,
        currency: 'XRP',
      };
    } else if (typeof amount === 'object' && amount && (amount as any).value) {
      // IOU amount
      return {
        value: (amount as any).value,
        currency: (amount as any).currency,
        issuer: (amount as any).issuer,
      };
    }

    return {
      value: '0',
      currency: 'XRP',
    };
  }

  private extractNFTTokenIDFromMeta(meta: TransactionMetadata | unknown, tx?: Transaction | unknown): string | undefined {
    // First check if CLIO provided the NFT ID directly
    if ((meta as any)?.nftoken_id) {
      this.logger.debug(`Found NFT Token ID from CLIO: ${(meta as any).nftoken_id}`);
      return (meta as any).nftoken_id;
    }

    if (!meta || !(meta as any).AffectedNodes) {
      return undefined;
    }

    // Look for NFTokenPage modifications (where NFTs are actually stored)
    for (const node of (meta as any).AffectedNodes) {
      // Check for NFTokenPage modifications
      if (node.ModifiedNode?.LedgerEntryType === 'NFTokenPage') {
        const previousTokens = node.ModifiedNode.PreviousFields?.NFTokens || [];
        const finalTokens = node.ModifiedNode.FinalFields?.NFTokens || [];
        
        // For minting, find the new token (in final but not in previous)
        if (finalTokens.length > previousTokens.length) {
          const previousIds = new Set(previousTokens.map((t: any) => t.NFToken?.NFTokenID).filter(Boolean));
          for (const token of finalTokens) {
            const tokenId = token.NFToken?.NFTokenID;
            if (tokenId && !previousIds.has(tokenId)) {
              this.logger.debug(`Found newly minted NFT Token ID: ${tokenId}`);
              return tokenId;
            }
          }
        }
        
        // For burning, find the removed token (in previous but not in final)
        if (finalTokens.length < previousTokens.length) {
          const finalIds = new Set(finalTokens.map((t: any) => t.NFToken?.NFTokenID).filter(Boolean));
          for (const token of previousTokens) {
            const tokenId = token.NFToken?.NFTokenID;
            if (tokenId && !finalIds.has(tokenId)) {
              this.logger.debug(`Found burned NFT Token ID: ${tokenId}`);
              return tokenId;
            }
          }
        }
      }

      // Check NFTokenOffer nodes for offer-related transactions
      if (node.CreatedNode?.LedgerEntryType === 'NFTokenOffer') {
        const tokenId = node.CreatedNode.NewFields?.NFTokenID;
        if (tokenId) {
          this.logger.debug(`Found NFT Token ID from created offer: ${tokenId}`);
          return tokenId;
        }
      }
      
      if (node.DeletedNode?.LedgerEntryType === 'NFTokenOffer') {
        const tokenId = node.DeletedNode.FinalFields?.NFTokenID;
        if (tokenId) {
          this.logger.debug(`Found NFT Token ID from deleted offer: ${tokenId}`);
          return tokenId;
        }
      }
    }

    // Fallback: For NFTokenBurn transactions, the NFT ID is in the transaction itself
    if ((tx as any)?.TransactionType === 'NFTokenBurn' && (tx as any)?.NFTokenID) {
      return (tx as any).NFTokenID;
    }

    return undefined;
  }

  private extractOfferDetailsFromMeta(
    meta: TransactionMetadata | unknown,
    tx: Transaction | unknown,
  ): {
    nftTokenID?: string | undefined;
    amount?: { value: string; currency: string; issuer?: string } | undefined;
    seller?: string | undefined;
    buyer?: string | undefined;
  } {
    if (!meta || !(meta as any).AffectedNodes) {
      return {};
    }

    let nftTokenID: string | undefined;
    let amount: { value: string; currency: string; issuer?: string } | undefined;
    let seller: string | undefined;
    let buyer: string | undefined;

    // Extract details from affected nodes
    for (const node of (meta as any).AffectedNodes) {
      if (node.DeletedNode?.LedgerEntryType === 'NFTokenOffer') {
        const offer = node.DeletedNode.FinalFields;
        nftTokenID = offer.NFTokenID;
        amount = this.parseAmount(offer.Amount);
        
        if (offer.Flags & 1) {
          // Sell offer
          seller = offer.Owner;
          buyer = (tx as any)?.Account;
        } else {
          // Buy offer
          buyer = offer.Owner;
          seller = (tx as any)?.Account;
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

  private decodeHexString(hexString: string): string {
    try {
      // Remove any spaces and ensure even length
      const cleanHex = hexString.replace(/\s/g, '');
      if (cleanHex.length % 2 !== 0) {
        this.logger.warn(`Invalid hex string length: ${hexString}`);
        return hexString; // Return original if invalid
      }

      // Convert hex to UTF-8
      const decoded = Buffer.from(cleanHex, 'hex').toString('utf8');
      
      // Validate the decoded string is valid UTF-8
      if (decoded.includes('\ufffd')) {
        this.logger.warn(`Invalid UTF-8 in decoded hex: ${hexString}`);
        return hexString; // Return original if invalid UTF-8
      }

      this.logger.debug(`Decoded hex URI: ${hexString} -> ${decoded}`);
      return decoded;
    } catch (error) {
      this.logger.error(`Failed to decode hex string: ${error instanceof Error ? error.message : String(error)}`);
      return hexString; // Return original on error
    }
  }
}