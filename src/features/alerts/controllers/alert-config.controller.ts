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
import { AlertConfigService } from '../services/alert-config.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/interfaces/auth.interface';
import { CreateAlertConfigDto, UpdateAlertConfigDto, AlertConfigQueryDto } from '../dto/alert.dto';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertConfigController {
  constructor(private readonly alertConfigService: AlertConfigService) {}

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