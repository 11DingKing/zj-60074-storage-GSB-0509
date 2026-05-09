import { Controller, Post, Get, Body, Param, Query, UseGuards, UseInterceptors, UploadedFile, UploadedFiles, Request } from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';
import { CreateChunkUploadDto } from './dto/create-chunk-upload.dto';
import { UploadChunkDto } from './dto/upload-chunk.dto';

@ApiTags('文件上传')
@Controller('upload')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UploadController {
  constructor(
    private readonly uploadService: UploadService,
    private readonly logService: LogService,
  ) {}

  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '单文件上传', description: '上传单个文件，支持存储配额检查和文件去重' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        folderId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '文件上传成功' })
  @ApiResponse({ status: 409, description: '存储空间不足' })
  async uploadSingleFile(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('folderId') folderId?: string,
    @Request() req?: any,
  ) {
    const result = await this.uploadService.uploadSingleFile(user.id, file, folderId);
    await this.logService.log(user.id, OperationType.UPLOAD, result.id, result.name, result.path, req);
    return result;
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '多文件上传', description: '同时上传多个文件' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        folderId: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 201, description: '文件上传完成' })
  async uploadMultipleFiles(
    @CurrentUser() user: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body('folderId') folderId?: string,
    @Request() req?: any,
  ) {
    const result = await this.uploadService.uploadMultipleFiles(user.id, files, folderId);
    
    for (const file of result.success) {
      await this.logService.log(user.id, OperationType.UPLOAD, file.id, file.name, file.path, req);
    }
    
    return result;
  }

  @Post('chunk/init')
  @ApiOperation({ summary: '初始化分片上传', description: '创建分片上传任务，支持秒传（如果文件已存在）' })
  @ApiResponse({ status: 201, description: '创建成功，返回上传任务信息' })
  @ApiResponse({ status: 409, description: '存储空间不足' })
  async createChunkUpload(
    @CurrentUser() user: any,
    @Body() createChunkUploadDto: CreateChunkUploadDto,
  ) {
    return this.uploadService.createChunkUpload(user.id, createChunkUploadDto);
  }

  @Post('chunk')
  @UseInterceptors(FileInterceptor('chunk'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: '上传分片', description: '上传文件分片，支持断点续传（已上传的分片不重复传）' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        uploadId: { type: 'string' },
        chunkIndex: { type: 'number' },
        chunkHash: { type: 'string' },
        chunk: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: '分片上传成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  @ApiResponse({ status: 400, description: '分片校验失败' })
  async uploadChunk(
    @CurrentUser() user: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('uploadId') uploadId: string,
    @Body('chunkIndex') chunkIndex: number,
    @Body('chunkHash') chunkHash: string,
  ) {
    return this.uploadService.uploadChunk(user.id, uploadId, chunkIndex, chunkHash, file);
  }

  @Get('chunk/status/:uploadId')
  @ApiOperation({ summary: '获取上传状态', description: '获取分片上传任务的进度状态' })
  @ApiResponse({ status: 200, description: '返回上传进度' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  async getUploadStatus(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
  ) {
    return this.uploadService.getUploadStatus(user.id, uploadId);
  }

  @Post('chunk/merge/:uploadId')
  @ApiOperation({ summary: '合并分片', description: '将所有分片合并为完整文件' })
  @ApiResponse({ status: 200, description: '合并成功' })
  @ApiResponse({ status: 404, description: '上传任务不存在' })
  @ApiResponse({ status: 400, description: '分片未全部上传' })
  async mergeChunks(
    @CurrentUser() user: any,
    @Param('uploadId') uploadId: string,
    @Body('folderId') folderId?: string,
    @Request() req?: any,
  ) {
    const result = await this.uploadService.mergeChunks(user.id, uploadId, folderId);
    await this.logService.log(user.id, OperationType.UPLOAD, result.file.id, result.file.name, result.file.path, req);
    return result;
  }
}
