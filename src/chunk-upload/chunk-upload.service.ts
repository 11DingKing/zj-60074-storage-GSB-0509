import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface ChunkUploadMetadata {
  uploadId: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  md5: string;
  userId: string;
  uploadedChunks: number[];
  createdAt: number;
}

@Injectable()
export class ChunkUploadService {
  private chunkDir: string;
  private filesDir: string;
  private readonly REDIS_TTL = 24 * 60 * 60;
  private readonly REDIS_PREFIX = 'chunk-upload:';

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.chunkDir = this.configService.get<string>('CHUNK_DIR', 'uploads/chunks');
    this.filesDir = this.configService.get<string>('FILES_DIR', 'uploads/files');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    if (!fs.existsSync(this.chunkDir)) {
      fs.mkdirSync(this.chunkDir, { recursive: true });
    }
    if (!fs.existsSync(this.filesDir)) {
      fs.mkdirSync(this.filesDir, { recursive: true });
    }
  }

  private getRedisKey(uploadId: string): string {
    return `${this.REDIS_PREFIX}${uploadId}`;
  }

  private getChunkDir(uploadId: string): string {
    return path.join(this.chunkDir, uploadId);
  }

  private getChunkPath(uploadId: string, index: number): string {
    return path.join(this.getChunkDir(uploadId), index.toString());
  }

  async initChunkUpload(
    userId: string,
    fileName: string,
    totalSize: number,
    totalChunks: number,
    md5: string,
  ): Promise<{ uploadId: string }> {
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
      uploadedChunks: [],
      createdAt: Date.now(),
    };

    await this.redis.set(
      this.getRedisKey(uploadId),
      JSON.stringify(metadata),
      this.REDIS_TTL,
    );

    const uploadChunkDir = this.getChunkDir(uploadId);
    if (!fs.existsSync(uploadChunkDir)) {
      fs.mkdirSync(uploadChunkDir, { recursive: true });
    }

    return { uploadId };
  }

  async checkFastUpload(
    userId: string,
    md5: string,
  ): Promise<{ exist: boolean; fileId?: string }> {
    const existingFiles = await this.prisma.file.findMany({
      where: { md5 },
      take: 1,
    });

    if (existingFiles.length > 0) {
      const existingFile = existingFiles[0];
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      if (user.storageUsed + existingFile.size > user.storageQuota) {
        throw new ConflictException('存储空间不足');
      }

      const newFile = await this.prisma.$transaction(async (prisma) => {
        await prisma.file.updateMany({
          where: { md5 },
          data: { referenceCount: { increment: 1 } },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { storageUsed: { increment: existingFile.size } },
        });

        return prisma.file.create({
          data: {
            id: uuidv4(),
            name: existingFile.name,
            originalName: existingFile.originalName,
            path: existingFile.path,
            size: existingFile.size,
            mimeType: existingFile.mimeType,
            extension: existingFile.extension,
            md5: existingFile.md5,
            referenceCount: existingFile.referenceCount + 1,
            isPublic: existingFile.isPublic,
            accessControl: existingFile.accessControl,
            thumbnailPath: existingFile.thumbnailPath,
            userId,
          },
        });
      });

      return { exist: true, fileId: newFile.id };
    }

    return { exist: false };
  }

  async uploadChunk(
    userId: string,
    uploadId: string,
    index: number,
    chunkBuffer: Buffer,
  ): Promise<{ uploadedChunks: number[]; totalChunks: number }> {
    const metadata = await this.getMetadata(uploadId, userId);

    if (index < 0 || index >= metadata.totalChunks) {
      throw new BadRequestException('分片索引无效');
    }

    if (metadata.uploadedChunks.includes(index)) {
      return {
        uploadedChunks: metadata.uploadedChunks,
        totalChunks: metadata.totalChunks,
      };
    }

    const chunkPath = this.getChunkPath(uploadId, index);
    fs.writeFileSync(chunkPath, chunkBuffer);

    metadata.uploadedChunks.push(index);
    metadata.uploadedChunks.sort((a, b) => a - b);

    await this.redis.set(
      this.getRedisKey(uploadId),
      JSON.stringify(metadata),
      this.REDIS_TTL,
    );

    return {
      uploadedChunks: metadata.uploadedChunks,
      totalChunks: metadata.totalChunks,
    };
  }

  async getUploadStatus(
    userId: string,
    uploadId: string,
  ): Promise<{
    uploadId: string;
    fileName: string;
    totalSize: number;
    totalChunks: number;
    uploadedChunks: number[];
    progress: number;
  }> {
    const metadata = await this.getMetadata(uploadId, userId);

    return {
      uploadId: metadata.uploadId,
      fileName: metadata.fileName,
      totalSize: metadata.totalSize,
      totalChunks: metadata.totalChunks,
      uploadedChunks: metadata.uploadedChunks,
      progress: (metadata.uploadedChunks.length / metadata.totalChunks) * 100,
    };
  }

  async completeUpload(
    userId: string,
    uploadId: string,
  ): Promise<{ fileId: string }> {
    const metadata = await this.getMetadata(uploadId, userId);

    if (metadata.uploadedChunks.length !== metadata.totalChunks) {
      throw new BadRequestException('分片未全部上传');
    }

    const uploadChunkDir = this.getChunkDir(uploadId);
    const extension = path.extname(metadata.fileName);
    const uniqueName = `${uuidv4()}${extension}`;
    const finalPath = path.join(this.filesDir, uniqueName);

    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < metadata.totalChunks; i++) {
      const chunkPath = this.getChunkPath(uploadId, i);
      if (!fs.existsSync(chunkPath)) {
        throw new BadRequestException(`分片 ${i} 不存在`);
      }
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    writeStream.end();

    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    const fileBuffer = fs.readFileSync(finalPath);
    const calculatedMd5 = crypto.createHash('md5').update(fileBuffer).digest('hex');

    if (calculatedMd5 !== metadata.md5) {
      fs.unlinkSync(finalPath);
      this.cleanupUpload(uploadId);
      throw new BadRequestException('文件 MD5 校验失败');
    }

    const mimeType = this.getMimeType(extension);

    const newFile = await this.prisma.$transaction(async (prisma) => {
      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: BigInt(metadata.totalSize) } },
      });

      return prisma.file.create({
        data: {
          id: uuidv4(),
          name: metadata.fileName,
          originalName: metadata.fileName,
          path: finalPath,
          size: BigInt(metadata.totalSize),
          mimeType,
          extension: extension || null,
          md5: metadata.md5,
          referenceCount: 1,
          isPublic: false,
          accessControl: 'private',
          userId,
        },
      });
    });

    this.cleanupUpload(uploadId);

    return { fileId: newFile.id };
  }

  async cancelUpload(
    userId: string,
    uploadId: string,
  ): Promise<{ success: boolean }> {
    const metadata = await this.getMetadata(uploadId, userId);
    this.cleanupUpload(uploadId);
    return { success: true };
  }

  private async getMetadata(
    uploadId: string,
    userId: string,
  ): Promise<ChunkUploadMetadata> {
    const data = await this.redis.get(this.getRedisKey(uploadId));
    if (!data) {
      throw new NotFoundException('上传任务不存在');
    }

    const metadata: ChunkUploadMetadata = JSON.parse(data);
    if (metadata.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    return metadata;
  }

  private cleanupUpload(uploadId: string): void {
    this.redis.del(this.getRedisKey(uploadId));

    const uploadChunkDir = this.getChunkDir(uploadId);
    if (fs.existsSync(uploadChunkDir)) {
      const files = fs.readdirSync(uploadChunkDir);
      for (const file of files) {
        const filePath = path.join(uploadChunkDir, file);
        try {
          fs.unlinkSync(filePath);
        } catch (e) {
          console.error('删除分片文件失败:', e);
        }
      }
      try {
        fs.rmdirSync(uploadChunkDir);
      } catch (e) {
        console.error('删除分片目录失败:', e);
      }
    }
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
}
