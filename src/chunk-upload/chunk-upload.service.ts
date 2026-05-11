import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { InitChunkUploadDto } from './dto/init-chunk-upload.dto';
import { CheckFastUploadDto } from './dto/check-fast-upload.dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as sharp from 'sharp';

interface ChunkUploadMetadata {
  uploadId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  md5: string;
  userId: string;
  folderId?: string;
  uploadedChunks: number[];
  createdAt: number;
}

@Injectable()
export class ChunkUploadService {
  private uploadDir: string;
  private chunkDir: string;
  private filesDir: string;
  private thumbnailDir: string;
  private readonly REDIS_KEY_PREFIX = 'chunk-upload:';
  private readonly REDIS_TTL = 24 * 60 * 60;

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
    this.chunkDir = path.join(this.uploadDir, 'chunks');
    this.filesDir = path.join(this.uploadDir, 'files');
    this.thumbnailDir = this.configService.get<string>('THUMBNAIL_DIR', 'thumbnails');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = [this.uploadDir, this.chunkDir, this.filesDir, this.thumbnailDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private getRedisKey(uploadId: string): string {
    return `${this.REDIS_KEY_PREFIX}${uploadId}`;
  }

  async checkFastUpload(userId: string, checkFastUploadDto: CheckFastUploadDto) {
    const { md5, fileName, folderId } = checkFastUploadDto;

    const existingFile = await this.prisma.file.findFirst({
      where: { md5 },
    });

    if (!existingFile) {
      return {
        status: 'notExist',
        message: '文件不存在，需要正常上传',
      };
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const fileSize = existingFile.size;
    if (user.storageUsed + fileSize > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    const actualFileName = fileName || existingFile.name;
    const extension = path.extname(actualFileName);

    let folderPath = '/';
    if (folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId, userId },
      });
      if (folder) {
        folderPath = folder.path;
      }
    }

    const fullPath = folderPath === '/' ? `/${actualFileName}` : `${folderPath}/${actualFileName}`;

    const newFile = await this.prisma.$transaction(async (prisma) => {
      await prisma.file.update({
        where: { id: existingFile.id },
        data: { referenceCount: { increment: 1 } },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: fileSize } },
      });

      return prisma.file.create({
        data: {
          name: actualFileName,
          originalName: actualFileName,
          path: fullPath,
          size: fileSize,
          mimeType: existingFile.mimeType,
          extension: extension || null,
          md5,
          referenceCount: 1,
          isPublic: false,
          accessControl: 'private',
          thumbnailPath: existingFile.thumbnailPath,
          userId,
          folderId: folderId || null,
        },
      });
    });

    return {
      status: 'success',
      fileId: newFile.id,
      file: newFile,
      message: '秒传成功，已复用现有文件',
    };
  }

  async initChunkUpload(userId: string, initChunkUploadDto: InitChunkUploadDto) {
    const { fileName, totalSize, totalChunks, md5, folderId } = initChunkUploadDto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const fileSize = BigInt(totalSize);
    if (user.storageUsed + fileSize > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    const uploadId = uuidv4();
    const metadata: ChunkUploadMetadata = {
      uploadId,
      fileName,
      totalSize,
      totalChunks,
      md5,
      userId,
      folderId,
      uploadedChunks: [],
      createdAt: Date.now(),
    };

    await this.redisService.set(
      this.getRedisKey(uploadId),
      JSON.stringify(metadata),
      this.REDIS_TTL,
    );

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    if (!fs.existsSync(uploadChunkDir)) {
      fs.mkdirSync(uploadChunkDir, { recursive: true });
    }

    return {
      uploadId,
      fileName,
      totalSize,
      totalChunks,
      uploadedChunks: [],
    };
  }

  async uploadChunk(userId: string, uploadId: string, index: number, chunkBuffer: Buffer) {
    const redisKey = this.getRedisKey(uploadId);
    const metadataStr = await this.redisService.get(redisKey);

    if (!metadataStr) {
      throw new NotFoundException('上传任务不存在或已过期');
    }

    const metadata: ChunkUploadMetadata = JSON.parse(metadataStr);

    if (metadata.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    if (index < 0 || index >= metadata.totalChunks) {
      throw new BadRequestException('分片索引无效');
    }

    if (metadata.uploadedChunks.includes(index)) {
      return {
        message: '分片已上传',
        uploadId,
        uploadedChunks: metadata.uploadedChunks,
        totalChunks: metadata.totalChunks,
      };
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const chunkPath = path.join(uploadChunkDir, index.toString());
    fs.writeFileSync(chunkPath, chunkBuffer);

    metadata.uploadedChunks.push(index);
    metadata.uploadedChunks.sort((a, b) => a - b);

    await this.redisService.set(redisKey, JSON.stringify(metadata), this.REDIS_TTL);

    return {
      message: '分片上传成功',
      uploadId,
      uploadedChunks: metadata.uploadedChunks,
      totalChunks: metadata.totalChunks,
    };
  }

  async getUploadStatus(userId: string, uploadId: string) {
    const redisKey = this.getRedisKey(uploadId);
    const metadataStr = await this.redisService.get(redisKey);

    if (!metadataStr) {
      throw new NotFoundException('上传任务不存在或已过期');
    }

    const metadata: ChunkUploadMetadata = JSON.parse(metadataStr);

    if (metadata.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    return {
      uploadId,
      fileName: metadata.fileName,
      totalSize: metadata.totalSize,
      totalChunks: metadata.totalChunks,
      uploadedChunks: metadata.uploadedChunks,
      progress: (metadata.uploadedChunks.length / metadata.totalChunks) * 100,
    };
  }

  async completeUpload(userId: string, uploadId: string) {
    const redisKey = this.getRedisKey(uploadId);
    const metadataStr = await this.redisService.get(redisKey);

    if (!metadataStr) {
      throw new NotFoundException('上传任务不存在或已过期');
    }

    const metadata: ChunkUploadMetadata = JSON.parse(metadataStr);

    if (metadata.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    if (metadata.uploadedChunks.length !== metadata.totalChunks) {
      throw new BadRequestException('分片未全部上传');
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const extension = path.extname(metadata.fileName);
    const uniqueName = `${uuidv4()}${extension}`;
    const finalPath = path.join(this.filesDir, uniqueName);

    const writeStream = fs.createWriteStream(finalPath);
    const hash = crypto.createHash('md5');

    for (let i = 0; i < metadata.totalChunks; i++) {
      const chunkPath = path.join(uploadChunkDir, i.toString());
      if (fs.existsSync(chunkPath)) {
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        hash.update(chunkData);
        fs.unlinkSync(chunkPath);
      }
    }

    writeStream.end();

    if (fs.existsSync(uploadChunkDir)) {
      fs.rmdirSync(uploadChunkDir);
    }

    const calculatedMd5 = hash.digest('hex');
    if (calculatedMd5 !== metadata.md5) {
      fs.unlinkSync(finalPath);
      await this.redisService.del(redisKey);
      throw new BadRequestException('文件 MD5 校验失败');
    }

    const existingFile = await this.prisma.file.findFirst({
      where: { md5: metadata.md5 },
    });

    if (existingFile) {
      fs.unlinkSync(finalPath);
      await this.redisService.del(redisKey);

      const result = await this.checkFastUpload(userId, {
        md5: metadata.md5,
        fileName: metadata.fileName,
        folderId: metadata.folderId,
      });

      return {
        fileId: (result as any).fileId,
        file: (result as any).file,
        message: '文件已存在，合并成功（复用现有文件）',
      };
    }

    let folderPath = '/';
    if (metadata.folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: metadata.folderId, userId },
      });
      if (folder) {
        folderPath = folder.path;
      }
    }

    const mimeType = this.getMimeType(extension);
    const fileName = metadata.fileName;
    const fullPath = folderPath === '/' ? `/${fileName}` : `${folderPath}/${fileName}`;

    const fileBuffer = fs.readFileSync(finalPath);
    let thumbnailPath: string | null = null;
    if (mimeType.startsWith('image/')) {
      thumbnailPath = await this.createThumbnail(fileBuffer, userId, fileName);
    }

    const newFile = await this.prisma.$transaction(async (prisma) => {
      const file = await prisma.file.create({
        data: {
          name: fileName,
          originalName: fileName,
          path: fullPath,
          size: BigInt(metadata.totalSize),
          mimeType,
          extension: extension || null,
          md5: metadata.md5,
          referenceCount: 1,
          isPublic: false,
          accessControl: 'private',
          thumbnailPath,
          userId,
          folderId: metadata.folderId || null,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: BigInt(metadata.totalSize) } },
      });

      return file;
    });

    await this.redisService.del(redisKey);

    return {
      fileId: newFile.id,
      file: newFile,
      message: '文件合并成功',
    };
  }

  async cancelUpload(userId: string, uploadId: string) {
    const redisKey = this.getRedisKey(uploadId);
    const metadataStr = await this.redisService.get(redisKey);

    if (!metadataStr) {
      throw new NotFoundException('上传任务不存在或已过期');
    }

    const metadata: ChunkUploadMetadata = JSON.parse(metadataStr);

    if (metadata.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    if (fs.existsSync(uploadChunkDir)) {
      const files = fs.readdirSync(uploadChunkDir);
      for (const file of files) {
        const filePath = path.join(uploadChunkDir, file);
        if (fs.statSync(filePath).isFile()) {
          fs.unlinkSync(filePath);
        }
      }
      fs.rmdirSync(uploadChunkDir);
    }

    await this.redisService.del(redisKey);

    return {
      message: '上传已取消，临时文件已清理',
    };
  }

  private getMimeType(extension: string): string {
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.bmp': 'image/bmp',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.ppt': 'application/vnd.ms-powerpoint',
      '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      '.txt': 'text/plain',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
      '.rar': 'application/vnd.rar',
      '.7z': 'application/x-7z-compressed',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.mp4': 'video/mp4',
      '.avi': 'video/x-msvideo',
      '.mkv': 'video/x-matroska',
    };
    return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
  }

  private async createThumbnail(
    buffer: Buffer,
    userId: string,
    fileName: string,
  ): Promise<string> {
    const thumbnailWidth = this.configService.get<number>('THUMBNAIL_WIDTH', 200);
    const thumbnailHeight = this.configService.get<number>('THUMBNAIL_HEIGHT', 200);

    const userThumbnailDir = path.join(this.thumbnailDir, userId);
    if (!fs.existsSync(userThumbnailDir)) {
      fs.mkdirSync(userThumbnailDir, { recursive: true });
    }

    const thumbnailName = `thumb_${uuidv4()}.webp`;
    const thumbnailPath = path.join(userThumbnailDir, thumbnailName);

    await sharp(buffer)
      .resize(thumbnailWidth, thumbnailHeight, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toFile(thumbnailPath);

    return thumbnailPath;
  }
}
