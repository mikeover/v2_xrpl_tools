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
    // Handle both direct transaction objects and wrapped ones
    const tx = transaction.tx_json || transaction;
    const txType = tx.TransactionType || tx.transaction_type;
    const isNFT = NFT_TRANSACTION_TYPES.includes(txType as NFTTransactionType);
    
    // Debug logging for NFT detection
    if (txType?.startsWith('NFToken')) {
      this.logger.debug(`NFT Transaction Check: ${txType} -> ${isNFT ? 'ACCEPTED' : 'REJECTED'}`);
    }
    
    return isNFT;
  }

  parseNFTTransaction(transactionMessage: any): NFTTransactionData | null {
    try {
      const rawTx = transactionMessage.transaction || transactionMessage;
      const tx = rawTx.tx_json || rawTx; // The actual transaction data is in tx_json
      const meta = transactionMessage.meta || rawTx.meta || transactionMessage.metaData;

      if (!this.isNFTTransaction(tx)) {
        return null;
      }

      const baseData: Partial<NFTTransactionData> = {
        transactionHash: rawTx.hash || tx.hash || tx.Hash || rawTx.Hash,
        ledgerIndex: transactionMessage.ledger_index || rawTx.ledger_index || tx.ledger_index,
        timestamp: this.parseTimestamp(tx.date || tx.Date || rawTx.close_time_iso),
        fromAddress: tx.Account,
        metadata: {
          transactionType: tx.TransactionType,
          fee: tx.Fee,
          flags: tx.Flags,
          engineResult: rawTx.engine_result || transactionMessage.engine_result,
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
    const nftTokenID = this.extractNFTTokenIDFromMeta(meta, tx);

    // Decode URI from hex if present
    const uriHex = tx.URI;
    const uriDecoded = uriHex ? this.decodeHexString(uriHex) : null;

    return {
      ...baseData,
      activityType: NFTActivityType.MINT,
      nftTokenID,
      toAddress: tx.Account, // Minter becomes initial owner
      metadata: {
        ...baseData.metadata,
        taxon: tx.NFTokenTaxon,
        transferFee: tx.TransferFee,
        uri: uriDecoded,
        uriHex: uriHex,
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

  private extractNFTTokenIDFromMeta(meta: any, tx?: any): string | undefined {
    // First check if CLIO provided the NFT ID directly
    if (meta?.nftoken_id) {
      this.logger.debug(`Found NFT Token ID from CLIO: ${meta.nftoken_id}`);
      return meta.nftoken_id;
    }

    if (!meta || !meta.AffectedNodes) {
      return undefined;
    }

    // Look for NFTokenPage modifications (where NFTs are actually stored)
    for (const node of meta.AffectedNodes) {
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
    if (tx?.TransactionType === 'NFTokenBurn' && tx.NFTokenID) {
      return tx.NFTokenID;
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