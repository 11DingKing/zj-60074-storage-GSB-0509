import { Controller, Get, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { LogService, OperationType } from './log.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('操作日志')
@Controller('logs')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get()
  @ApiOperation({ summary: '获取用户操作日志', description: '分页获取当前用户的操作日志，支持筛选' })
  @ApiQuery({ name: 'page', required: false, description: '页码，默认1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数，默认20' })
  @ApiQuery({ name: 'operation', required: false, description: '操作类型筛选' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期' })
  @ApiResponse({ status: 200, description: '返回操作日志列表' })
  async getLogs(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('operation') operation?: OperationType,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.logService.getUserLogs(user.id, page, pageSize, operation, start, end);
  }
}
