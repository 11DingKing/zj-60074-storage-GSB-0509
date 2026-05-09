import { Controller, Get, Post, Delete, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RecycleBinService } from './recycle-bin.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';

@ApiTags('文件管理')
@Controller('recycle-bin')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RecycleBinController {
  constructor(
    private readonly recycleBinService: RecycleBinService,
    private readonly logService: LogService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取回收站列表', description: '获取当前用户的回收站项目列表' })
  @ApiQuery({ name: 'page', required: false, description: '页码，默认1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数，默认20' })
  @ApiResponse({ status: 200, description: '返回回收站列表' })
  async getRecycleBin(
    @CurrentUser() user: any,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number = 20,
  ) {
    return this.recycleBinService.getRecycleBinItems(user.id, page, pageSize);
  }

  @Post('restore/:itemId')
  @ApiOperation({ summary: '恢复项目', description: '从回收站恢复文件或文件夹' })
  @ApiResponse({ status: 200, description: '恢复成功' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async restoreItem(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
  ) {
    const result = await this.recycleBinService.restoreItem(user.id, itemId);
    return result;
  }

  @Delete('permanent/:itemId')
  @ApiOperation({ summary: '永久删除', description: '永久删除回收站中的项目' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '项目不存在' })
  async permanentDelete(
    @CurrentUser() user: any,
    @Param('itemId') itemId: string,
  ) {
    return this.recycleBinService.permanentDelete(user.id, itemId);
  }

  @Delete('empty')
  @ApiOperation({ summary: '清空回收站', description: '永久删除回收站中的所有项目' })
  @ApiResponse({ status: 200, description: '清空成功' })
  async emptyRecycleBin(
    @CurrentUser() user: any,
  ) {
    return this.recycleBinService.emptyRecycleBin(user.id);
  }
}
