import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  ValidationPipe,
  UsePipes,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger';
import { AlertConfigService } from '../services/alert-config.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { CreateAlertConfigDto, UpdateAlertConfigDto, AlertConfigQueryDto } from '../dto/alert.dto';

@ApiTags('Alerts')
@ApiBearerAuth('JWT-auth')
@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertConfigController {
  constructor(private readonly alertConfigService: AlertConfigService) {}

  @ApiOperation({
    summary: 'Create a new alert configuration',
    description: 'Create a new NFT activity alert with custom filters and notification channels',
  })
  @ApiBody({ type: CreateAlertConfigDto })
  @ApiResponse({
    status: 201,
    description: 'Alert configuration created successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Alert configuration created successfully' },
        alert: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            activityTypes: { type: 'array', items: { type: 'string' } },
            isActive: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid alert configuration data' })
  @ApiUnauthorizedResponse({ description: 'JWT token is missing or invalid' })
  @Post()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async createAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Body() createAlertDto: CreateAlertConfigDto,
  ) {
    const alert = await this.alertConfigService.create(user.id, createAlertDto);
    
    return {
      message: 'Alert configuration created successfully',
      alert,
    };
  }

  @ApiOperation({
    summary: 'Get user\'s alert configurations',
    description: 'Retrieve all alert configurations for the authenticated user with optional filtering',
  })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, description: 'Filter by active status' })
  @ApiQuery({ name: 'collectionId', required: false, type: String, description: 'Filter by collection ID' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number for pagination' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Items per page (max 100)' })
  @ApiResponse({
    status: 200,
    description: 'Alert configurations retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Alert configurations retrieved successfully' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              activityTypes: { type: 'array', items: { type: 'string' } },
              isActive: { type: 'boolean' },
            },
          },
        },
        pagination: {
          type: 'object',
          properties: {
            page: { type: 'number' },
            limit: { type: 'number' },
            total: { type: 'number' },
            totalPages: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'JWT token is missing or invalid' })
  @Get()
  async getAlerts(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ValidationPipe({ transform: true, whitelist: true })) query: AlertConfigQueryDto,
  ) {
    const queryOptions: Parameters<typeof this.alertConfigService.findByUserId>[1] = {};
    
    if (query.isActive !== undefined) {
      queryOptions.isActive = query.isActive;
    }
    if (query.collectionId) {
      queryOptions.collectionId = query.collectionId;
    }
    if (query.page) {
      queryOptions.page = query.page;
    }
    if (query.limit) {
      queryOptions.limit = query.limit;
    }

    const result = await this.alertConfigService.findByUserId(user.id, queryOptions);

    return {
      message: 'Alert configurations retrieved successfully',
      data: result.alerts,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
      },
    };
  }

  @Get('summary')
  async getAlertsSummary(@CurrentUser() user: AuthenticatedUser) {
    const alerts = await this.alertConfigService.findSummaryByUserId(user.id);

    return {
      message: 'Alert configurations summary retrieved successfully',
      alerts,
    };
  }

  @Get('stats')
  async getAlertStats(@CurrentUser() user: AuthenticatedUser) {
    const stats = await this.alertConfigService.getAlertStats(user.id);

    return {
      message: 'Alert statistics retrieved successfully',
      stats,
    };
  }

  @Get(':id')
  async getAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const alert = await this.alertConfigService.findById(id, user.id);

    return {
      message: 'Alert configuration retrieved successfully',
      alert,
    };
  }

  @Put(':id')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async updateAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateAlertDto: UpdateAlertConfigDto,
  ) {
    const alert = await this.alertConfigService.update(id, user.id, updateAlertDto);

    return {
      message: 'Alert configuration updated successfully',
      alert,
    };
  }

  @Patch(':id/toggle')
  @HttpCode(HttpStatus.OK)
  async toggleAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const alert = await this.alertConfigService.toggleActive(id, user.id);

    return {
      message: `Alert configuration ${alert.isActive ? 'activated' : 'deactivated'} successfully`,
      alert,
    };
  }

  @ApiOperation({
    summary: 'Delete an alert configuration',
    description: 'Permanently delete an alert configuration. This action cannot be undone.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid', description: 'Alert configuration ID' })
  @ApiResponse({
    status: 204,
    description: 'Alert configuration deleted successfully',
  })
  @ApiNotFoundResponse({ description: 'Alert configuration not found' })
  @ApiForbiddenResponse({ description: 'Access denied to this alert configuration' })
  @ApiUnauthorizedResponse({ description: 'JWT token is missing or invalid' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAlert(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.alertConfigService.delete(id, user.id);
    
    // No response body for 204 No Content
  }
}