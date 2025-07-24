import { IsArray, IsNumber, IsOptional, IsUrl, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NodeConfigDto {
  @IsUrl({ protocols: ['ws', 'wss'] })
  url!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  priority?: number;
}

export class ConnectionConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NodeConfigDto)
  nodes!: NodeConfigDto[];

  @IsOptional()
  @IsNumber()
  @Min(1000)
  reconnectInterval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxReconnectAttempts?: number;

  @IsOptional()
  @IsNumber()
  @Min(5000)
  healthCheckInterval?: number;

  @IsOptional()
  @IsNumber()
  @Min(1000)
  connectionTimeout?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  maxConsecutiveFailures?: number;
}
