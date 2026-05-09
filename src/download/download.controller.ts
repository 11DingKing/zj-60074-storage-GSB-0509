import { Controller, Get, Post, Body, Param, Query, Res, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { DownloadService } from './download.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';
import { Response } from 'express';
import * as fs from 'fs';

@ApiTags('文件下载')
@Controller('download')
export class DownloadController {
  constructor(
    private readonly downloadService: DownloadService,
    private readonly logService: LogService,
  ) {}

  @Get('file/:fileId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '下载单个文件', description: '下载指定的文件' })
  @ApiResponse({ status: 200, description: '文件下载成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  @ApiResponse({ status: 403, description: '无权限访问' })
  async downloadFile(
    @CurrentUser() user: any,
    @Param('fileId') fileId: string,
    @Res() res: Response,
    @Request() req: any,
  ) {
    const file = await this.downloadService.downloadFile(user.id, fileId, res);
    await this.logService.log(user.id, OperationType.DOWNLOAD, file.id, file.name, file.path, req);
  }

  @Post('multiple')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '批量下载文件', description: '将多个文件打包成 ZIP 下载' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        fileIds: { type: 'array', items: { type: 'string' } },
      },
    },
  })
  @ApiResponse({ status: 200, description: '打包下载成功' })
  @ApiResponse({ status: 400, description: '请选择至少一个文件' })
  @ApiResponse({ status: 404, description: '未找到可下载的文件' })
  async downloadMultipleFiles(
    @CurrentUser() user: any,
    @Body('fileIds') fileIds: string[],
    @Res() res: Response,
    @Request() req: any,
  ) {
    const files = await this.downloadService.downloadMultipleFiles(user.id, fileIds, res);
    for (const file of files) {
      await this.logService.log(user.id, OperationType.DOWNLOAD, file.id, file.name, file.path, req);
    }
  }

  @Get('public/:fileId')
  @ApiOperation({ summary: '下载公开文件', description: '下载公开访问的文件，无需认证' })
  @ApiResponse({ status: 200, description: '文件下载成功' })
  @ApiResponse({ status: 404, description: '文件不存在或不是公开文件' })
  @ApiResponse({ status: 403, description: '文件不是公开的' })
  async downloadPublicFile(
    @Param('fileId') fileId: string,
    @Res() res: Response,
    @Request() req: any,
  ) {
    const file = await this.downloadService.downloadFile(null, fileId, res);
    if (file.userId) {
      await this.logService.log(file.userId, OperationType.DOWNLOAD, file.id, file.name, file.path, req);
    }
  }
}
