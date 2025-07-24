import { IsString, IsEnum, IsDate, IsOptional, IsObject, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { EventType } from '../interfaces/queue.interface';

export class BaseEventDto {
  @IsString()
  eventId!: string;

  @IsEnum(EventType)
  eventType!: EventType;

  @Type(() => Date)
  @IsDate()
  timestamp!: Date;

  @IsOptional()
  @IsString()
  correlationId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class LedgerDataDto {
  @IsNumber()
  ledgerIndex!: number;

  @IsString()
  ledgerHash!: string;

  @IsNumber()
  ledgerTime!: number;

  @IsNumber()
  txnCount!: number;

  @IsNumber()
  validatedLedgerIndex!: number;
}

export class LedgerEventDto extends BaseEventDto {
  @IsEnum(EventType)
  override eventType: EventType.LEDGER_CLOSED = EventType.LEDGER_CLOSED;

  @ValidateNested()
  @Type(() => LedgerDataDto)
  data!: LedgerDataDto;
}

export class TransactionDataDto {
  @IsObject()
  transaction!: any;

  @IsObject()
  meta!: any;

  @IsNumber()
  ledgerIndex!: number;

  @IsString()
  ledgerHash!: string;

  @IsBoolean()
  validated!: boolean;
}

export class TransactionEventDto extends BaseEventDto {
  @IsEnum(EventType)
  override eventType: EventType.TRANSACTION_VALIDATED = EventType.TRANSACTION_VALIDATED;

  @ValidateNested()
  @Type(() => TransactionDataDto)
  data!: TransactionDataDto;
}

export class NFTDataDto {
  @IsString()
  nftokenId!: string;

  @IsOptional()
  @IsString()
  issuer?: string;

  @IsOptional()
  @IsString()
  owner?: string;

  @IsOptional()
  @IsString()
  buyer?: string;

  @IsOptional()
  @IsString()
  seller?: string;

  @IsOptional()
  @IsString()
  amount?: string;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsString()
  transactionHash!: string;

  @IsNumber()
  ledgerIndex!: number;

  @IsOptional()
  @IsObject()
  metadata?: any;
}

export class NFTEventDto extends BaseEventDto {
  @IsEnum(EventType)
  declare eventType: EventType.NFT_MINTED | EventType.NFT_BURNED | 
    EventType.NFT_OFFER_CREATED | EventType.NFT_OFFER_CANCELLED | 
    EventType.NFT_OFFER_ACCEPTED;

  @ValidateNested()
  @Type(() => NFTDataDto)
  data!: NFTDataDto;
}