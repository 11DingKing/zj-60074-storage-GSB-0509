import { Controller, Get, Param, Query, UseGuards, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { SearchService } from './search.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('文件预览')
@Controller('search')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: '搜索文件', description: '按文件名模糊搜索，支持按文件类型、大小范围、上传时间范围筛选' })
  @ApiQuery({ name: 'query', required: false, description: '搜索关键词（文件名）' })
  @ApiQuery({ name: 'fileType', required: false, description: '文件类型筛选：image, video, audio, document, archive' })
  @ApiQuery({ name: 'minSize', required: false, description: '最小文件大小（字节）' })
  @ApiQuery({ name: 'maxSize', required: false, description: '最大文件大小（字节）' })
  @ApiQuery({ name: 'startDate', required: false, description: '开始日期' })
  @ApiQuery({ name: 'endDate', required: false, description: '结束日期' })
  @ApiQuery({ name: 'page', required: false, description: '页码，默认1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数，默认20' })
  @ApiResponse({ status: 200, description: '返回搜索结果' })
  async searchFiles(
    @CurrentUser() user: any,
    @Query('query') query?: string,
    @Query('fileType') fileType?: string,
    @Query('minSize') minSize?: string,
    @Query('maxSize') maxSize?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number = 20,
  ) {
    const min = minSize ? parseInt(minSize, 10) : undefined;
    const max = maxSize ? parseInt(maxSize, 10) : undefined;
    const start = startDate ? new Date(startDate) : undefined;
    const end = endDate ? new Date(endDate) : undefined;

    return this.searchService.searchFiles(
      user.id,
      query,
      fileType,
      min,
      max,
      start,
      end,
      page,
      pageSize,
    );
  }

  @Get('type/:fileType')
  @ApiOperation({ summary: '按文件类型筛选', description: '按文件类型筛选文件：图片、视频、音频、文档、压缩包' })
  @ApiQuery({ name: 'page', required: false, description: '页码，默认1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数，默认20' })
  @ApiResponse({ status: 200, description: '返回文件列表' })
  async getFilesByType(
    @CurrentUser() user: any,
    @Param('fileType') fileType: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number = 20,
  ) {
    return this.searchService.getFilesByType(user.id, fileType, page, pageSize);
  }
}
