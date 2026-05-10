import {
  Controller,
  Post,
  Put,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiBody, ApiParam } from '@nestjs/swagger';
import { Request } from 'express';
import { ChunkUploadService } from './chunk-upload.service';
import { InitChunkUploadDto } from './dto/init-chunk-upload.dto';
import { CheckFastUploadDto } from './dto/check-fast-upload.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('分片上传')
@ApiBearerAuth()
@Controller('chunk-upload')
@UseGuards(JwtAuthGuard)
export class ChunkUploadController {
  constructor(private readonly chunkUploadService: ChunkUploadService) {}

  @Post('check-fast')
  @ApiOperation({ summary: '检查是否可以秒传' })
  @ApiResponse({ status: 200, description: '返回是否存在相同文件' })
  async checkFastUpload(
    @CurrentUser() user: any,
    @Body() checkFastUploadDto: CheckFastUploadDto,
  ) {
    return this.chunkUploadService.checkFastUpload(user.id, checkFastUploadDto.md5);
  }

  @Post('init')
  @ApiOperation({ summary: '初始化分片上传' })
  @ApiResponse({ status: 201, description: '返回 uploadId' })
  async initChunkUpload(
    @CurrentUser() user: any,
    @Body() initChunkUploadDto: InitChunkUploadDto,
  ) {
    return this.chunkUploadService.initChunkUpload(
      user.id,
      initChunkUploadDto.fileName,
      initChunkUploadDto.totalSize,
      initChunkUploadDto.totalChunks,
      initChunkUploadDto.md5,
    );
  }

  @Put(':uploadId/:index')
  @ApiOperation({ summary: '上传单个分片' })
  @ApiParam({ name: 'uploadId', description: '上传任务ID' })
  @ApiParam({ name: 'index', description: '分片索引（从0开始）' })
  @ApiBody({ description: '分片二进制数据', type: 'binary' })
  @ApiResponse({ status: 200, description: '分片上传成功' })
  async uploadChunk(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
    @Param('index') index: string,
    @Req() req: Request,
  ) {
    return this.chunkUploadService.uploadChunk(
      user.id,
      uploadId,
      parseInt(index, 10),
      req.body,
    );
  }

  @Get(':uploadId/status')
  @ApiOperation({ summary: '获取上传状态' })
  @ApiParam({ name: 'uploadId', description: '上传任务ID' })
  @ApiResponse({ status: 200, description: '返回已上传分片信息' })
  async getUploadStatus(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.getUploadStatus(user.id, uploadId);
  }

  @Post(':uploadId/complete')
  @ApiOperation({ summary: '完成分片上传并合并' })
  @ApiParam({ name: 'uploadId', description: '上传任务ID' })
  @ApiResponse({ status: 200, description: '合并成功，返回文件ID' })
  async completeUpload(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.completeUpload(user.id, uploadId);
  }

  @Delete(':uploadId')
  @ApiOperation({ summary: '取消分片上传' })
  @ApiParam({ name: 'uploadId', description: '上传任务ID' })
  @ApiResponse({ status: 200, description: '取消成功' })
  async cancelUpload(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.cancelUpload(user.id, uploadId);
  }
}
