import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CreateChunkUploadDto } from './dto/create-chunk-upload.dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import * as sharp from 'sharp';

@Injectable()
export class UploadService {
  private uploadDir: string;
  private chunkDir: string;
  private thumbnailDir: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
    this.chunkDir = this.configService.get<string>('CHUNK_DIR', 'chunks');
    this.thumbnailDir = this.configService.get<string>('THUMBNAIL_DIR', 'thumbnails');
    this.ensureDirectories();
  }

  private ensureDirectories() {
    const dirs = [this.uploadDir, this.chunkDir, this.thumbnailDir];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  async uploadSingleFile(
    userId: string,
    file: Express.Multer.File,
    folderId?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    const fileSize = BigInt(file.size);
    if (user.storageUsed + fileSize > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    const md5 = this.calculateMd5(file.buffer);

    const existingFile = await this.prisma.file.findFirst({
      where: { md5, userId },
    });

    let filePath: string;
    let savedFile = file;

    if (existingFile) {
      await this.prisma.file.update({
        where: { id: existingFile.id },
        data: { referenceCount: { increment: 1 } },
      });
      filePath = existingFile.path;
    } else {
      const extension = path.extname(file.originalname);
      const uniqueName = `${uuidv4()}${extension}`;
      const userUploadDir = path.join(this.uploadDir, userId);
      
      if (!fs.existsSync(userUploadDir)) {
        fs.mkdirSync(userUploadDir, { recursive: true });
      }

      filePath = path.join(userUploadDir, uniqueName);
      fs.writeFileSync(filePath, file.buffer);
    }

    let folderPath = '/';
    if (folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId, userId },
      });
      if (folder) {
        folderPath = folder.path;
      }
    }

    const extension = path.extname(file.originalname);
    const mimeType = file.mimetype;
    const fileName = file.originalname;
    const fullPath = folderPath === '/' ? `/${fileName}` : `${folderPath}/${fileName}`;

    let thumbnailPath: string | null = null;
    if (mimeType.startsWith('image/')) {
      thumbnailPath = await this.createThumbnail(file.buffer, userId, fileName);
    }

    const newFile = await this.prisma.file.create({
      data: {
        name: fileName,
        originalName: fileName,
        path: fullPath,
        size: fileSize,
        mimeType,
        extension: extension || null,
        md5,
        referenceCount: existingFile ? 1 : 1,
        isPublic: false,
        accessControl: 'private',
        thumbnailPath,
        userId,
        folderId: folderId || null,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { storageUsed: { increment: fileSize } },
    });

    return newFile;
  }

  async uploadMultipleFiles(
    userId: string,
    files: Express.Multer.File[],
    folderId?: string,
  ) {
    const results = [];
    const errors = [];

    for (const file of files) {
      try {
        const result = await this.uploadSingleFile(userId, file, folderId);
        results.push(result);
      } catch (error) {
        errors.push({
          fileName: file.originalname,
          error: error.message,
        });
      }
    }

    return {
      success: results,
      errors,
    };
  }

  async createChunkUpload(
    userId: string,
    createChunkUploadDto: CreateChunkUploadDto,
  ) {
    const { fileName, totalSize, totalChunks, md5, folderId } = createChunkUploadDto;

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    if (md5) {
      const existingFile = await this.prisma.file.findFirst({
        where: { md5, userId },
      });

      if (existingFile) {
        return {
          type: 'instant',
          file: existingFile,
          message: '文件已存在，秒传成功',
        };
      }
    }

    const fileSize = BigInt(totalSize);
    if (user.storageUsed + fileSize > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    const uploadId = uuidv4();
    const chunkUpload = await this.prisma.chunkUpload.create({
      data: {
        uploadId,
        fileName,
        totalSize: fileSize,
        totalChunks,
        uploadedChunks: 0,
        chunkHashes: [],
        md5,
        userId,
      },
    });

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    if (!fs.existsSync(uploadChunkDir)) {
      fs.mkdirSync(uploadChunkDir, { recursive: true });
    }

    return {
      type: 'new',
      uploadId: chunkUpload.uploadId,
      totalChunks: chunkUpload.totalChunks,
      uploadedChunks: chunkUpload.uploadedChunks,
    };
  }

  async uploadChunk(
    userId: string,
    uploadId: string,
    chunkIndex: number,
    chunkHash: string,
    file: Express.Multer.File,
  ) {
    const chunkUpload = await this.prisma.chunkUpload.findUnique({
      where: { uploadId, userId },
    });

    if (!chunkUpload) {
      throw new NotFoundException('上传任务不存在');
    }

    const calculatedHash = this.calculateMd5(file.buffer);
    if (calculatedHash !== chunkHash) {
      throw new BadRequestException('分片校验失败');
    }

    if (chunkUpload.chunkHashes.includes(chunkHash)) {
      return {
        message: '分片已上传',
        uploadedChunks: chunkUpload.uploadedChunks,
        totalChunks: chunkUpload.totalChunks,
      };
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const chunkPath = path.join(uploadChunkDir, `chunk-${chunkIndex}`);
    fs.writeFileSync(chunkPath, file.buffer);

    const updatedChunkUpload = await this.prisma.chunkUpload.update({
      where: { uploadId },
      data: {
        uploadedChunks: { increment: 1 },
        chunkHashes: { push: chunkHash },
      },
    });

    return {
      message: '分片上传成功',
      uploadedChunks: updatedChunkUpload.uploadedChunks,
      totalChunks: updatedChunkUpload.totalChunks,
    };
  }

  async getUploadStatus(userId: string, uploadId: string) {
    const chunkUpload = await this.prisma.chunkUpload.findUnique({
      where: { uploadId, userId },
    });

    if (!chunkUpload) {
      throw new NotFoundException('上传任务不存在');
    }

    return {
      uploadId: chunkUpload.uploadId,
      fileName: chunkUpload.fileName,
      totalSize: chunkUpload.totalSize,
      totalChunks: chunkUpload.totalChunks,
      uploadedChunks: chunkUpload.uploadedChunks,
      progress: (chunkUpload.uploadedChunks / chunkUpload.totalChunks) * 100,
    };
  }

  async mergeChunks(
    userId: string,
    uploadId: string,
    folderId?: string,
  ) {
    const chunkUpload = await this.prisma.chunkUpload.findUnique({
      where: { uploadId, userId },
    });

    if (!chunkUpload) {
      throw new NotFoundException('上传任务不存在');
    }

    if (chunkUpload.uploadedChunks !== chunkUpload.totalChunks) {
      throw new BadRequestException('分片未全部上传');
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const extension = path.extname(chunkUpload.fileName);
    const uniqueName = `${uuidv4()}${extension}`;
    const userUploadDir = path.join(this.uploadDir, userId);

    if (!fs.existsSync(userUploadDir)) {
      fs.mkdirSync(userUploadDir, { recursive: true });
    }

    const finalPath = path.join(userUploadDir, uniqueName);
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < chunkUpload.totalChunks; i++) {
      const chunkPath = path.join(uploadChunkDir, `chunk-${i}`);
      if (fs.existsSync(chunkPath)) {
        const chunkData = fs.readFileSync(chunkPath);
        writeStream.write(chunkData);
        fs.unlinkSync(chunkPath);
      }
    }

    writeStream.end();

    if (fs.existsSync(uploadChunkDir)) {
      fs.rmdirSync(uploadChunkDir);
    }

    const fileBuffer = fs.readFileSync(finalPath);
    const md5 = this.calculateMd5(fileBuffer);

    const existingFile = await this.prisma.file.findFirst({
      where: { md5, userId },
    });

    if (existingFile) {
      fs.unlinkSync(finalPath);
      await this.prisma.chunkUpload.delete({ where: { uploadId } });
      
      await this.prisma.file.update({
        where: { id: existingFile.id },
        data: { referenceCount: { increment: 1 } },
      });

      await this.prisma.user.update({
        where: { id: userId },
        data: { storageUsed: { increment: chunkUpload.totalSize } },
      });

      return {
        file: existingFile,
        message: '文件已存在，合并成功',
      };
    }

    let folderPath = '/';
    if (folderId) {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId, userId },
      });
      if (folder) {
        folderPath = folder.path;
      }
    }

    const mimeType = this.getMimeType(extension);
    const fileName = chunkUpload.fileName;
    const fullPath = folderPath === '/' ? `/${fileName}` : `${folderPath}/${fileName}`;

    let thumbnailPath: string | null = null;
    if (mimeType.startsWith('image/')) {
      thumbnailPath = await this.createThumbnail(fileBuffer, userId, fileName);
    }

    const newFile = await this.prisma.file.create({
      data: {
        name: fileName,
        originalName: fileName,
        path: fullPath,
        size: chunkUpload.totalSize,
        mimeType,
        extension: extension || null,
        md5,
        referenceCount: 1,
        isPublic: false,
        accessControl: 'private',
        thumbnailPath,
        userId,
        folderId: folderId || null,
      },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { storageUsed: { increment: chunkUpload.totalSize } },
    });

    await this.prisma.chunkUpload.delete({ where: { uploadId } });

    return {
      file: newFile,
      message: '文件合并成功',
    };
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
