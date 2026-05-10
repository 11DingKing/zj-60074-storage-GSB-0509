import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { ChunkUploadService } from './chunk-upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { InitChunkUploadDto } from './dto/init-chunk-upload.dto';
import { CheckFastUploadDto } from './dto/check-fast-upload.dto';
import { CompleteChunkUploadDto } from './dto/complete-chunk-upload.dto';
import { LogService, OperationType } from '../log/log.service';
import { Request } from 'express';

@ApiTags('分片上传')
@Controller('chunk-upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class ChunkUploadController {
  constructor(
    private readonly chunkUploadService: ChunkUploadService,
    private readonly logService: LogService,
  ) {}

  @Post('init')
  @ApiOperation({ summary: '初始化分片上传', description: '创建分片上传任务，分配uploadId，元数据存入Redis（TTL 24小时）' })
  @ApiResponse({ status: 201, description: '创建成功，返回uploadId' })
  @ApiResponse({ status: 404, description: '用户不存在或目标文件夹不存在' })
  @ApiResponse({ status: 409, description: '存储空间不足' })
  async init(
    @CurrentUser() user: any,
    @Body() dto: InitChunkUploadDto,
  ) {
    return this.chunkUploadService.init(user.id, dto);
  }

  @Put(':uploadId/:index')
  @ApiOperation({ summary: '上传分片', description: '上传指定分片，body为binary数据，支持断点续传（已上传的分片索引会被跳过）' })
  @ApiConsumes('application/octet-stream')
  @ApiBody({
    schema: {
      type: 'string',
      format: 'binary',
    },
  })
  @ApiResponse({ status: 200, description: '分片上传成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在或已过期' })
  @ApiResponse({ status: 400, description: '分片索引超出范围' })
  async uploadChunk(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
    @Param('index') index: number,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const chunkBuffer: Buffer = req.rawBody || req.body;
    return this.chunkUploadService.uploadChunk(user.id, uploadId, Number(index), chunkBuffer);
  }

  @Get(':uploadId/status')
  @ApiOperation({ summary: '查询上传状态', description: '获取已上传分片索引列表，用于断点续传判断' })
  @ApiResponse({ status: 200, description: '返回上传状态和已上传分片索引' })
  @ApiResponse({ status: 404, description: '上传任务不存在或已过期' })
  async getStatus(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.getStatus(user.id, uploadId);
  }

  @Post(':uploadId/complete')
  @ApiOperation({ summary: '合并分片', description: '所有分片上传完成后调用，按顺序合并分片到目标路径，校验总MD5，成功后写入file表记录并清理临时文件' })
  @ApiResponse({ status: 200, description: '合并成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在或已过期' })
  @ApiResponse({ status: 400, description: '分片未全部上传或MD5校验失败' })
  async complete(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
    @Body() dto: CompleteChunkUploadDto,
    @Req() req: any,
  ) {
    const result = await this.chunkUploadService.complete(user.id, uploadId, dto.folderId);
    await this.logService.log(user.id, OperationType.UPLOAD, result.file.id, result.file.name, result.file.path, req);
    return result;
  }

  @Delete(':uploadId')
  @ApiOperation({ summary: '取消上传', description: '取消分片上传任务，清理Redis元数据和临时分片文件' })
  @ApiResponse({ status: 200, description: '取消成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在或已过期' })
  async cancel(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.chunkUploadService.cancel(user.id, uploadId);
  }

  @Post('check-fast')
  @ApiOperation({ summary: '秒传检查', description: '上传前检查文件MD5是否已存在，存在则为当前用户创建新file记录（复用物理文件，refCount++），避免真实上传' })
  @ApiResponse({ status: 200, description: '返回检查结果，exists=true时附带fileId' })
  @ApiResponse({ status: 404, description: '用户不存在' })
  @ApiResponse({ status: 409, description: '存储空间不足' })
  async checkFast(
    @CurrentUser() user: any,
    @Body() dto: CheckFastUploadDto,
    @Req() req: any,
  ) {
    const result = await this.chunkUploadService.checkFast(user.id, dto);
    if (result.exists) {
      await this.logService.log(user.id, OperationType.UPLOAD, result.fileId, dto.fileName, '', req);
    }
    return result;
  }
}
