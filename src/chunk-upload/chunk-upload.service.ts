import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { InitChunkUploadDto } from './dto/init-chunk-upload.dto';
import { CheckFastUploadDto } from './dto/check-fast-upload.dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

interface ChunkUploadMeta {
  fileName: string;
  totalSize: number;
  totalChunks: number;
  md5: string;
  userId: string;
  folderId: string | null;
  uploadedIndexes: number[];
}

@Injectable()
export class ChunkUploadService {
  private chunkDir: string;
  private uploadDir: string;
  private readonly REDIS_KEY_PREFIX = 'chunk-upload:';
  private readonly REDIS_TTL = 24 * 60 * 60;

  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
    private configService: ConfigService,
  ) {
    this.chunkDir = this.configService.get<string>('CHUNK_DIR', 'uploads/chunks');
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads/files');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = [this.chunkDir, this.uploadDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  private redisKey(uploadId: string): string {
    return `${this.REDIS_KEY_PREFIX}${uploadId}`;
  }

  async init(userId: string, dto: InitChunkUploadDto) {
    const { fileName, totalSize, totalChunks, md5, folderId } = dto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const fileSize = BigInt(totalSize);
    if (user.storageUsed + fileSize > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    if (folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId, userId },
      });
      if (!folder) {
        throw new NotFoundException('目标文件夹不存在');
      }
    }

    const uploadId = uuidv4();
    const meta: ChunkUploadMeta = {
      fileName,
      totalSize,
      totalChunks,
      md5,
      userId,
      folderId: folderId || null,
      uploadedIndexes: [],
    };

    await this.redisService.set(
      this.redisKey(uploadId),
      JSON.stringify(meta),
      this.REDIS_TTL,
    );

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    if (!fs.existsSync(uploadChunkDir)) {
      fs.mkdirSync(uploadChunkDir, { recursive: true });
    }

    return {
      uploadId,
      totalChunks,
      uploadedIndexes: [],
    };
  }

  async uploadChunk(
    userId: string,
    uploadId: string,
    index: number,
    chunkBuffer: Buffer,
  ) {
    const meta = await this.getMetaOrThrow(uploadId, userId);

    if (index < 0 || index >= meta.totalChunks) {
      throw new BadRequestException(`分片索引超出范围，有效范围: 0-${meta.totalChunks - 1}`);
    }

    if (meta.uploadedIndexes.includes(index)) {
      return {
        message: '分片已上传，跳过',
        uploadedIndexes: meta.uploadedIndexes,
      };
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    if (!fs.existsSync(uploadChunkDir)) {
      fs.mkdirSync(uploadChunkDir, { recursive: true });
    }

    const chunkPath = path.join(uploadChunkDir, String(index));
    fs.writeFileSync(chunkPath, chunkBuffer);

    meta.uploadedIndexes.push(index);
    meta.uploadedIndexes.sort((a, b) => a - b);

    await this.redisService.set(
      this.redisKey(uploadId),
      JSON.stringify(meta),
      this.REDIS_TTL,
    );

    return {
      message: '分片上传成功',
      uploadedIndexes: meta.uploadedIndexes,
    };
  }

  async getStatus(userId: string, uploadId: string) {
    const meta = await this.getMetaOrThrow(uploadId, userId);

    return {
      uploadId,
      fileName: meta.fileName,
      totalSize: meta.totalSize,
      totalChunks: meta.totalChunks,
      md5: meta.md5,
      uploadedIndexes: meta.uploadedIndexes,
      progress: (meta.uploadedIndexes.length / meta.totalChunks) * 100,
    };
  }

  async complete(userId: string, uploadId: string, folderId?: string) {
    const meta = await this.getMetaOrThrow(uploadId, userId);

    if (meta.uploadedIndexes.length !== meta.totalChunks) {
      throw new BadRequestException(
        `分片未全部上传，已上传 ${meta.uploadedIndexes.length}/${meta.totalChunks}`,
      );
    }

    const targetFolderId = folderId || meta.folderId;

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const extension = path.extname(meta.fileName);
    const uniqueName = `${uuidv4()}${extension}`;

    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }

    const finalPath = path.join(this.uploadDir, uniqueName);

    const writeStream = fs.createWriteStream(finalPath);
    for (let i = 0; i < meta.totalChunks; i++) {
      const chunkPath = path.join(uploadChunkDir, String(i));
      if (fs.existsSync(chunkPath)) {
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
      } else {
        writeStream.close();
        if (fs.existsSync(finalPath)) {
          fs.unlinkSync(finalPath);
        }
        throw new BadRequestException(`分片 ${i} 文件缺失，合并失败`);
      }
    }

    await new Promise<void>((resolve, reject) => {
      writeStream.end((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const fileBuffer = fs.readFileSync(finalPath);
    const actualMd5 = this.calculateMd5(fileBuffer);

    if (actualMd5 !== meta.md5) {
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }
      throw new BadRequestException('文件MD5校验失败，合并终止');
    }

    const existingFile = await this.prisma.file.findFirst({
      where: { md5: meta.md5 },
    });

    if (existingFile) {
      if (fs.existsSync(finalPath)) {
        fs.unlinkSync(finalPath);
      }

      let folderPath = '/';
      if (targetFolderId) {
        const folder = await this.prisma.folder.findUnique({
          where: { id: targetFolderId, userId },
        });
        if (folder) folderPath = folder.path;
      }

      const fullPath = folderPath === '/' ? `/${meta.fileName}` : `${folderPath}/${meta.fileName}`;

      const newFile = await this.prisma.$transaction(async (prisma) => {
        await prisma.file.update({
          where: { id: existingFile.id },
          data: { referenceCount: { increment: 1 } },
        });

        const created = await prisma.file.create({
          data: {
            name: meta.fileName,
            originalName: meta.fileName,
            path: fullPath,
            size: BigInt(meta.totalSize),
            mimeType: this.getMimeType(extension),
            extension: extension || null,
            md5: meta.md5,
            referenceCount: 1,
            isPublic: false,
            accessControl: 'private',
            userId,
            folderId: targetFolderId || null,
          },
        });

        await prisma.user.update({
          where: { id: userId },
          data: { storageUsed: { increment: BigInt(meta.totalSize) } },
        });

        return created;
      });

      await this.cleanup(uploadId, uploadChunkDir);

      return {
        file: newFile,
        message: '文件合并成功（复用已有物理文件）',
      };
    }

    let folderPath = '/';
    if (targetFolderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: targetFolderId, userId },
      });
      if (folder) folderPath = folder.path;
    }

    const fullPath = folderPath === '/' ? `/${meta.fileName}` : `${folderPath}/${meta.fileName}`;

    const newFile = await this.prisma.$transaction(async (prisma) => {
      const created = await prisma.file.create({
        data: {
          name: meta.fileName,
          originalName: meta.fileName,
          path: fullPath,
          size: BigInt(meta.totalSize),
          mimeType: this.getMimeType(extension),
          extension: extension || null,
          md5: meta.md5,
          referenceCount: 1,
          isPublic: false,
          accessControl: 'private',
          userId,
          folderId: targetFolderId || null,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: BigInt(meta.totalSize) } },
      });

      return created;
    });

    await this.cleanup(uploadId, uploadChunkDir);

    return {
      file: newFile,
      message: '文件合并成功',
    };
  }

  async cancel(userId: string, uploadId: string) {
    const raw = await this.redisService.get(this.redisKey(uploadId));
    if (!raw) {
      throw new NotFoundException('上传任务不存在或已过期');
    }

    const meta: ChunkUploadMeta = JSON.parse(raw);
    if (meta.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    if (fs.existsSync(uploadChunkDir)) {
      fs.rmSync(uploadChunkDir, { recursive: true, force: true });
    }

    await this.redisService.del(this.redisKey(uploadId));

    return { message: '上传任务已取消，临时文件已清理' };
  }

  async checkFast(userId: string, dto: CheckFastUploadDto) {
    const { md5, fileName, folderId } = dto;

    const existingFile = await this.prisma.file.findFirst({
      where: { md5 },
    });

    if (!existingFile) {
      return { exists: false, message: '文件不存在，需要正常上传' };
    }

    let folderPath = '/';
    if (folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId, userId },
      });
      if (folder) folderPath = folder.path;
    }

    const fullPath = folderPath === '/' ? `/${fileName}` : `${folderPath}/${fileName}`;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (user.storageUsed + existingFile.size > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    const newFile = await this.prisma.$transaction(async (prisma) => {
      await prisma.file.update({
        where: { id: existingFile.id },
        data: { referenceCount: { increment: 1 } },
      });

      const created = await prisma.file.create({
        data: {
          name: fileName,
          originalName: fileName,
          path: fullPath,
          size: existingFile.size,
          mimeType: existingFile.mimeType,
          extension: existingFile.extension,
          md5: existingFile.md5,
          referenceCount: 1,
          isPublic: false,
          accessControl: 'private',
          userId,
          folderId: folderId || null,
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: existingFile.size } },
      });

      return created;
    });

    return {
      exists: true,
      fileId: newFile.id,
      file: newFile,
      message: '秒传成功，文件已复用',
    };
  }

  private async getMetaOrThrow(uploadId: string, userId: string): Promise<ChunkUploadMeta> {
    const raw = await this.redisService.get(this.redisKey(uploadId));
    if (!raw) {
      throw new NotFoundException('上传任务不存在或已过期');
    }

    const meta: ChunkUploadMeta = JSON.parse(raw);
    if (meta.userId !== userId) {
      throw new NotFoundException('上传任务不存在');
    }

    return meta;
  }

  private async cleanup(uploadId: string, uploadChunkDir: string) {
    await this.redisService.del(this.redisKey(uploadId));

    if (fs.existsSync(uploadChunkDir)) {
      fs.rmSync(uploadChunkDir, { recursive: true, force: true });
    }
  }

  private calculateMd5(buffer: Buffer): string {
    return crypto.createHash('md5').update(buffer).digest('hex');
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
