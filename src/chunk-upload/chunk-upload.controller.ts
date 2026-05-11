import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { ChunkUploadService } from './chunk-upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';
import { InitChunkUploadDto } from './dto/init-chunk-upload.dto';
import { CheckFastUploadDto } from './dto/check-fast-upload.dto';

@ApiTags('分片上传')
@Controller('chunk-upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChunkUploadController {
  constructor(
    private readonly chunkUploadService: ChunkUploadService,
    private readonly logService: LogService,
  ) {}

  @Post('check-fast')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: '秒传检查',
    description:
      '上传前检查文件是否已存在。如果存在则直接创建文件记录（复用现有物理文件），返回 fileId；如果不存在则返回 notExist 让前端走正常上传流程。',
  })
  @ApiResponse({ status: 200, description: '检查完成' })
  @ApiResponse({ status: 409, description: '存储空间不足' })
  async checkFastUpload(
    @CurrentUser() user: any,
    @Body() checkFastUploadDto: CheckFastUploadDto,
    @Request() req?: any,
  ) {
    const result = await this.chunkUploadService.checkFastUpload(
      user.id,
      checkFastUploadDto,
    );

    if ((result as any).status === 'success') {
      await this.logService.log(
        user.id,
        OperationType.UPLOAD,
        (result as any).fileId,
        (result as any).file.name,
        (result as any).file.path,
        req,
      );
    }

    return result;
  }

  @Post('init')
  @ApiOperation({
    summary: '初始化分片上传',
    description:
      '创建分片上传任务，返回 uploadId。uploadId 存储在 Redis 中，TTL 为 24 小时。',
  })
  @ApiResponse({ status: 201, description: '初始化成功' })
  @ApiResponse({ status: 409, description: '存储空间不足' })
  async initChunkUpload(
    @CurrentUser() user: any,
    @Body() initChunkUploadDto: InitChunkUploadDto,
  ) {
    return this.chunkUploadService.initChunkUpload(user.id, initChunkUploadDto);
  }

  @Put(':uploadId/:index')
  @ApiConsumes('application/octet-stream')
  @ApiOperation({
    summary: '上传分片',
    description:
      '按分片索引上传文件分片。请求体为二进制数据。支持断点续传，已上传的分片不会重复处理。',
  })
  @ApiBody({
    description: '分片二进制数据',
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiParam({ name: 'uploadId', description: '上传任务 ID' })
  @ApiParam({ name: 'index', description: '分片索引（从 0 开始）' })
  @ApiResponse({ status: 200, description: '分片上传成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  @ApiResponse({ status: 400, description: '分片索引无效' })
  async uploadChunk(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
    @Param('index') index: number,
    @Request() req: any,
  ) {
    return this.chunkUploadService.uploadChunk(
      user.id,
      uploadId,
      Number(index),
      req.body,
    );
  }

  @Get(':uploadId/status')
  @ApiOperation({
    summary: '获取上传状态',
    description: '获取分片上传任务的进度，包括已上传的分片索引列表。用于断点续传。',
  })
  @ApiParam({ name: 'uploadId', description: '上传任务 ID' })
  @ApiResponse({ status: 200, description: '返回上传状态' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  async getUploadStatus(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.getUploadStatus(user.id, uploadId);
  }

  @Post(':uploadId/complete')
  @ApiOperation({
    summary: '完成并合并分片',
    description:
      '所有分片上传完成后调用此接口。后端按顺序合并分片，校验文件 MD5，写入数据库。合并成功后删除 Redis 记录和临时分片文件。',
  })
  @ApiParam({ name: 'uploadId', description: '上传任务 ID' })
  @ApiResponse({ status: 200, description: '合并成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  @ApiResponse({ status: 400, description: '分片未全部上传或 MD5 校验失败' })
  async completeUpload(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
    @Request() req?: any,
  ) {
    const result = await this.chunkUploadService.completeUpload(user.id, uploadId);
    await this.logService.log(
      user.id,
      OperationType.UPLOAD,
      result.fileId,
      result.file.name,
      result.file.path,
      req,
    );
    return result;
  }

  @Delete(':uploadId')
  @ApiOperation({
    summary: '取消上传',
    description: '取消上传任务，清理 Redis 记录和临时分片文件。',
  })
  @ApiParam({ name: 'uploadId', description: '上传任务 ID' })
  @ApiResponse({ status: 200, description: '取消成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  async cancelUpload(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.cancelUpload(user.id, uploadId);
  }
}
