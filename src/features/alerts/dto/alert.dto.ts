import {
  IsString,
  IsArray,
  IsOptional,
  IsBoolean,
  IsUUID,
  MinLength,
  MaxLength,
  IsIn,
  IsObject,
  ValidateNested,
  IsNumber,
  IsUrl,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export class TraitFilterDto {
  @IsString()
  @MinLength(1, { message: 'Trait type must not be empty' })
  @MaxLength(100, { message: 'Trait type must not exceed 100 characters' })
  traitType!: string;

  @IsString()
  @MaxLength(200, { message: 'Trait value must not exceed 200 characters' })
  value!: string | number;

  @IsString()
  @IsIn(['equals', 'not_equals', 'greater_than', 'less_than', 'contains'], {
    message: 'Operator must be one of: equals, not_equals, greater_than, less_than, contains',
  })
  operator!: 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'contains';
}

export class NotificationChannelConfigDto {
  @IsOptional()
  @IsUrl({}, { message: 'Discord webhook URL must be a valid URL' })
  discordWebhookUrl?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @IsOptional()
  @IsUrl({}, { message: 'Webhook URL must be a valid URL' })
  webhookUrl?: string;

  @IsOptional()
  @IsObject()
  webhookHeaders?: Record<string, string>;
}

export class NotificationChannelDto {
  @IsString()
  @IsIn(['discord', 'email', 'webhook'], {
    message: 'Notification type must be one of: discord, email, webhook',
  })
  type!: 'discord' | 'email' | 'webhook';

  @IsBoolean()
  enabled!: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationChannelConfigDto)
  config?: NotificationChannelConfigDto;
}

export class CreateAlertConfigDto {
  @IsString()
  @MinLength(1, { message: 'Alert name must not be empty' })
  @MaxLength(255, { message: 'Alert name must not exceed 255 characters' })
  name!: string;

  @IsOptional()
  @IsUUID(4, { message: 'Collection ID must be a valid UUID' })
  collectionId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsIn(['mint', 'sell', 'buy', 'transfer', 'burn'], { each: true, message: 'Invalid activity type' })
  activityTypes!: string[];

  @IsOptional()
  @IsString()
  minPriceDrops?: string;

  @IsOptional()
  @IsString()
  maxPriceDrops?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraitFilterDto)
  traitFilters?: TraitFilterDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationChannelDto)
  notificationChannels!: NotificationChannelDto[];
}

export class UpdateAlertConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1, { message: 'Alert name must not be empty' })
  @MaxLength(255, { message: 'Alert name must not exceed 255 characters' })
  name?: string;

  @IsOptional()
  @IsUUID(4, { message: 'Collection ID must be a valid UUID' })
  collectionId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['mint', 'sell', 'buy', 'transfer', 'burn'], { each: true, message: 'Invalid activity type' })
  activityTypes?: string[];

  @IsOptional()
  @IsString()
  minPriceDrops?: string;

  @IsOptional()
  @IsString()
  maxPriceDrops?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraitFilterDto)
  traitFilters?: TraitFilterDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationChannelDto)
  notificationChannels?: NotificationChannelDto[];

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AlertConfigQueryDto {
  @IsOptional()
  @IsUUID(4, { message: 'Collection ID must be a valid UUID' })
  collectionId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}