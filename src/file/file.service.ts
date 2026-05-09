import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { CopyFileDto } from './dto/copy-file.dto';
import { UpdateAccessDto } from './dto/update-access.dto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FileService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async getFileById(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    return file;
  }

  async listFiles(userId: string, folderId?: string) {
    return this.prisma.file.findMany({
      where: {
        userId,
        folderId: folderId || null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async renameFile(userId: string, fileId: string, renameFileDto: RenameFileDto) {
    const { newName } = renameFileDto;

    const file = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    const extension = path.extname(file.originalName);
    const baseName = path.basename(newName, extension);
    const finalName = baseName + extension;

    const folderPath = file.folderId 
      ? (await this.prisma.folder.findUnique({ where: { id: file.folderId } }))?.path || '/'
      : '/';

    const newPath = folderPath === '/' ? `/${finalName}` : `${folderPath}/${finalName}`;

    const existingFile = await this.prisma.file.findFirst({
      where: {
        userId,
        path: newPath,
        id: { not: fileId },
      },
    });

    if (existingFile) {
      throw new ConflictException('文件名已存在');
    }

    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        name: finalName,
        originalName: finalName,
        path: newPath,
      },
    });
  }

  async moveFile(userId: string, fileId: string, moveFileDto: MoveFileDto) {
    const { targetFolderId } = moveFileDto;

    const file = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    let targetPath = '/';
    if (targetFolderId) {
      const targetFolder = await this.prisma.folder.findUnique({
        where: { id: targetFolderId, userId },
      });

      if (!targetFolder) {
        throw new NotFoundException('目标文件夹不存在');
      }

      targetPath = targetFolder.path;
    }

    const newPath = targetPath === '/' ? `/${file.name}` : `${targetPath}/${file.name}`;

    const existingFile = await this.prisma.file.findFirst({
      where: {
        userId,
        path: newPath,
        id: { not: fileId },
      },
    });

    if (existingFile) {
      throw new ConflictException('目标位置已存在同名文件');
    }

    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        path: newPath,
        folderId: targetFolderId || null,
      },
    });
  }

  async copyFile(userId: string, fileId: string, copyFileDto: CopyFileDto) {
    const { targetFolderId, newName } = copyFileDto;

    const sourceFile = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!sourceFile) {
      throw new NotFoundException('文件不存在');
    }

    let targetPath = '/';
    if (targetFolderId) {
      const targetFolder = await this.prisma.folder.findUnique({
        where: { id: targetFolderId, userId },
      });

      if (!targetFolder) {
        throw new NotFoundException('目标文件夹不存在');
      }

      targetPath = targetFolder.path;
    }

    const fileName = newName || sourceFile.name;
    const newPath = targetPath === '/' ? `/${fileName}` : `${targetPath}/${fileName}`;

    const existingFile = await this.prisma.file.findFirst({
      where: {
        userId,
        path: newPath,
      },
    });

    if (existingFile) {
      throw new ConflictException('目标位置已存在同名文件');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user.storageUsed + sourceFile.size > user.storageQuota) {
      throw new ConflictException('存储空间不足');
    }

    return this.prisma.$transaction(async (prisma) => {
      const newFile = await prisma.file.create({
        data: {
          id: uuidv4(),
          name: fileName,
          originalName: fileName,
          path: newPath,
          size: sourceFile.size,
          mimeType: sourceFile.mimeType,
          extension: sourceFile.extension,
          md5: sourceFile.md5,
          referenceCount: 1,
          isPublic: sourceFile.isPublic,
          accessControl: sourceFile.accessControl,
          userId,
          folderId: targetFolderId || null,
        },
      });

      await prisma.file.update({
        where: { id: fileId },
        data: {
          referenceCount: { increment: 1 },
        },
      });

      await prisma.user.update({
        where: { id: userId },
        data: {
          storageUsed: { increment: sourceFile.size },
        },
      });

      return newFile;
    });
  }

  async updateAccessControl(userId: string, fileId: string, updateAccessDto: UpdateAccessDto) {
    const { accessControl } = updateAccessDto;

    const file = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    return this.prisma.file.update({
      where: { id: fileId },
      data: {
        accessControl,
        isPublic: accessControl === 'public',
      },
    });
  }

  async deleteFile(userId: string, fileId: string) {
    const file = await this.prisma.file.findUnique({
      where: { id: fileId, userId },
    });

    if (!file) {
      throw new NotFoundException('文件不存在');
    }

    const retentionDays = this.configService.get<number>('RECYCLE_BIN_RETENTION_DAYS', 30);
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + retentionDays);

    return this.prisma.$transaction(async (prisma) => {
      await prisma.recycleBin.create({
        data: {
          itemType: 'file',
          itemId: file.id,
          itemName: file.name,
          itemPath: file.path,
          itemSize: file.size,
          userId,
          expireAt,
        },
      });

      return prisma.file.delete({
        where: { id: fileId },
      });
    });
  }

  async deleteFolder(userId: string, folderId: string) {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId, userId },
      include: {
        children: true,
        files: true,
      },
    });

    if (!folder) {
      throw new NotFoundException('文件夹不存在');
    }

    const retentionDays = this.configService.get<number>('RECYCLE_BIN_RETENTION_DAYS', 30);
    const expireAt = new Date();
    expireAt.setDate(expireAt.getDate() + retentionDays);

    return this.prisma.$transaction(async (prisma) => {
      const allFiles = await this.getAllFilesInFolder(prisma, userId, folderId);
      let totalSize = BigInt(0);
      for (const file of allFiles) {
        totalSize += file.size;
      }

      await prisma.recycleBin.create({
        data: {
          itemType: 'folder',
          itemId: folder.id,
          itemName: folder.name,
          itemPath: folder.path,
          itemSize: totalSize,
          userId,
          expireAt,
        },
      });

      for (const file of allFiles) {
        await prisma.file.delete({ where: { id: file.id } });
      }

      const allFolders = await this.getAllFoldersInFolder(prisma, userId, folderId);
      for (const f of [...allFolders, folder]) {
        await prisma.folder.delete({ where: { id: f.id } });
      }

      return folder;
    });
  }

  private async getAllFilesInFolder(prisma: any, userId: string, folderId: string): Promise<any[]> {
    const files = await prisma.file.findMany({
      where: { userId, folderId },
    });

    const childFolders = await prisma.folder.findMany({
      where: { userId, parentId: folderId },
    });

    let allFiles = [...files];
    for (const childFolder of childFolders) {
      const childFiles = await this.getAllFilesInFolder(prisma, userId, childFolder.id);
      allFiles = [...allFiles, ...childFiles];
    }

    return allFiles;
  }

  private async getAllFoldersInFolder(prisma: any, userId: string, folderId: string): Promise<any[]> {
    const childFolders = await prisma.folder.findMany({
      where: { userId, parentId: folderId },
    });

    let allFolders = [...childFolders];
    for (const childFolder of childFolders) {
      const grandchildren = await this.getAllFoldersInFolder(prisma, userId, childFolder.id);
      allFolders = [...allFolders, ...grandchildren];
    }

    return allFolders;
  }
}
