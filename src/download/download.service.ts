import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as archiver from 'archiver';
import { Response } from 'express';

@Injectable()
export class DownloadService {
  private uploadDir: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
  }

  async getFileForDownload(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    if (!file.isPublic && file.userId !== userId) {
      throw new ForbiddenException('无权限访问此文件');
    }

    const filePath = this.getActualFilePath(file);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('文件物理不存在');
    }

    return {
      file,
      filePath,
    };
  }

  async downloadFile(
    userId: string,
    fileId: string,
    res: Response,
  ) {
    const { file, filePath } = await this.getFileForDownload(userId, fileId);

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size.toString());

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

    return file;
  }

  async downloadMultipleFiles(
    userId: string,
    fileIds: string[],
    res: Response,
  ) {
    if (fileIds.length === 0) {
      throw new BadRequestException('请选择至少一个文件');
    }

    const files = await this.prisma.file.findMany({
      where: {
        id: { in: fileIds },
        userId,
      },
    });

    if (files.length === 0) {
      throw new NotFoundException('未找到可下载的文件');
    }

    const zipName = `download_${Date.now()}.zip`;
    res.setHeader('Content-Disposition', `attachment; filename=${zipName}`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', {
      zlib: { level: 6 },
    });

    archive.pipe(res);

    for (const file of files) {
      const filePath = this.getActualFilePath(file);
      if (fs.existsSync(filePath)) {
        const fileStream = fs.createReadStream(filePath);
        archive.append(fileStream, { name: file.originalName });
      }
    }

    await archive.finalize();

    return files;
  }

  async previewFile(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    if (!file.isPublic && file.userId !== userId) {
      throw new ForbiddenException('无权限访问此文件');
    }

    const previewInfo: any = {
      id: file.id,
      name: file.name,
      originalName: file.originalName,
      size: file.size,
      mimeType: file.mimeType,
      extension: file.extension,
      path: file.path,
      isPublic: file.isPublic,
      accessControl: file.accessControl,
      createdAt: file.createdAt,
    };

    if (file.mimeType.startsWith('image/') && file.thumbnailPath) {
      previewInfo.thumbnailUrl = `/api/files/thumbnail/${file.id}`;
      previewInfo.previewType = 'image';
    } else if (file.mimeType.startsWith('video/')) {
      previewInfo.previewType = 'video';
    } else if (file.mimeType.startsWith('audio/')) {
      previewInfo.previewType = 'audio';
    } else if (file.mimeType === 'application/pdf') {
      previewInfo.previewType = 'pdf';
    } else {
      previewInfo.previewType = 'document';
    }

    return previewInfo;
  }

  async getThumbnail(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    if (!file.isPublic && file.userId !== userId) {
      throw new ForbiddenException('无权限访问此文件');
    }

    if (!file.thumbnailPath) {
      throw new NotFoundException('该文件没有缩略图');
    }

    if (!fs.existsSync(file.thumbnailPath)) {
      throw new NotFoundException('缩略图文件不存在');
    }

    return file.thumbnailPath;
  }

  private getActualFilePath(file: any): string {
    const uploadDir = this.configService.get<string>('UPLOAD_DIR', 'uploads');
    const userUploadDir = path.join(uploadDir, file.userId);
    
    const files = fs.readdirSync(userUploadDir);
    for (const f of files) {
      const stat = fs.statSync(path.join(userUploadDir, f));
      if (stat.isFile() && BigInt(stat.size) === file.size) {
        return path.join(userUploadDir, f);
      }
    }
    
    const filesByMd5 = fs.readdirSync(uploadDir);
    for (const userDir of filesByMd5) {
      const userPath = path.join(uploadDir, userDir);
      if (fs.statSync(userPath).isDirectory()) {
        const userFiles = fs.readdirSync(userPath);
        for (const f of userFiles) {
          const filePath = path.join(userPath, f);
          const stat = fs.statSync(filePath);
          if (stat.isFile() && BigInt(stat.size) === file.size) {
            return filePath;
          }
        }
      }
    }
    
    throw new NotFoundException('文件物理不存在');
  }
}
