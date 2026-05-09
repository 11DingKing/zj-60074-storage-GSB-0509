import { Controller, Post, Get, Delete, Body, Param, Query, UseGuards, Request, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { ShareService } from './share.service';
import { DownloadService } from '../download/download.service';
import { CreateShareLinkDto } from '../download/dto/create-share-link.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';
import { Response } from 'express';

@ApiTags('文件下载')
@Controller('share')
export class ShareController {
  constructor(
    private readonly shareService: ShareService,
    private readonly downloadService: DownloadService,
    private readonly logService: LogService,
  ) {}

  @Post('create')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '创建分享链接', description: '生成带过期时间的临时分享链接' })
  @ApiResponse({ status: 201, description: '分享链接创建成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async createShareLink(
    @CurrentUser() user: any,
    @Body() createShareLinkDto: CreateShareLinkDto,
    @Request() req: any,
  ) {
    const result = await this.shareService.createShareLink(user.id, createShareLinkDto);
    await this.logService.log(user.id, OperationType.SHARE, result.file.id, result.file.name, undefined, req);
    return result;
  }

  @Get(':token')
  @ApiOperation({ summary: '获取分享文件信息', description: '通过分享链接 token 获取文件信息（不下载）' })
  @ApiResponse({ status: 200, description: '返回文件信息' })
  @ApiResponse({ status: 404, description: '分享链接不存在' })
  @ApiResponse({ status: 403, description: '分享链接已过期或达到访问次数上限' })
  async getShareLink(@Param('token') token: string) {
    return this.shareService.getShareLink(token);
  }

  @Get(':token/download')
  @ApiOperation({ summary: '通过分享链接下载文件', description: '通过分享链接 token 下载文件' })
  @ApiResponse({ status: 200, description: '文件下载成功' })
  @ApiResponse({ status: 404, description: '分享链接不存在或文件不存在' })
  @ApiResponse({ status: 403, description: '分享链接已过期或达到访问次数上限' })
  async downloadByShareLink(
    @Param('token') token: string,
    @Res() res: Response,
    @Request() req: any,
  ) {
    const file = await this.shareService.accessShareLink(token);
    await this.downloadService.downloadFile(file.userId, file.id, res);
    await this.logService.log(file.userId, OperationType.DOWNLOAD, file.id, file.name, file.path, req);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取用户分享链接列表', description: '获取当前用户创建的所有分享链接' })
  @ApiQuery({ name: 'page', required: false, description: '页码，默认1' })
  @ApiQuery({ name: 'pageSize', required: false, description: '每页条数，默认20' })
  @ApiResponse({ status: 200, description: '返回分享链接列表' })
  async getUserShareLinks(
    @CurrentUser() user: any,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.shareService.getUserShareLinks(user.id, page || 1, pageSize || 20);
  }

  @Delete(':shareId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '删除分享链接', description: '删除指定的分享链接使其失效' })
  @ApiResponse({ status: 200, description: '分享链接已删除' })
  @ApiResponse({ status: 404, description: '分享链接不存在' })
  async deleteShareLink(
    @CurrentUser() user: any,
    @Param('shareId') shareId: string,
  ) {
    return this.shareService.deleteShareLink(user.id, shareId);
  }
}
