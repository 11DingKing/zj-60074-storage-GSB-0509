import { Injectable, NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { MoveFolderDto } from './dto/move-folder.dto';

@Injectable()
export class FolderService {
  constructor(private prisma: PrismaService) {}

  async createFolder(userId: string, createFolderDto: CreateFolderDto) {
    const { name, parentId } = createFolderDto;

    let parentPath = '/';
    if (parentId) {
      const parentFolder = await this.prisma.folder.findUnique({
        where: { id: parentId, userId },
      });
      
      if (!parentFolder) {
        throw new NotFoundException('父文件夹不存在');
      }
      
      parentPath = parentFolder.path;
    }

    const fullPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;

    const existingFolder = await this.prisma.folder.findFirst({
      where: {
        userId,
        path: fullPath,
      },
    });

    if (existingFolder) {
      throw new ConflictException('文件夹已存在');
    }

    return this.prisma.folder.create({
      data: {
        name,
        path: fullPath,
        userId,
        parentId: parentId || null,
      },
    });
  }

  async getFolderById(userId: string, folderId: string) {
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

    return folder;
  }

  async listFolders(userId: string, parentId?: string) {
    return this.prisma.folder.findMany({
      where: {
        userId,
        parentId: parentId || null,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async renameFolder(userId: string, folderId: string, renameFolderDto: RenameFolderDto) {
    const { newName } = renameFolderDto;

    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw new NotFoundException('文件夹不存在');
    }

    const parentPath = folder.path.substring(0, folder.path.lastIndexOf('/'));
    const newPath = parentPath === '' ? `/${newName}` : `${parentPath}/${newName}`;

    const existingFolder = await this.prisma.folder.findFirst({
      where: {
        userId,
        path: newPath,
        id: { not: folderId },
      },
    });

    if (existingFolder) {
      throw new ConflictException('文件夹名称已存在');
    }

    return this.prisma.folder.update({
      where: { id: folderId },
      data: {
        name: newName,
        path: newPath,
      },
    });
  }

  async moveFolder(userId: string, folderId: string, moveFolderDto: MoveFolderDto) {
    const { targetFolderId } = moveFolderDto;

    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId, userId },
    });

    if (!folder) {
      throw new NotFoundException('文件夹不存在');
    }

    if (folderId === targetFolderId) {
      throw new ConflictException('不能将文件夹移动到自身');
    }

    let targetPath = '/';
    if (targetFolderId) {
      const targetFolder = await this.prisma.folder.findUnique({
        where: { id: targetFolderId, userId },
      });

      if (!targetFolder) {
        throw new NotFoundException('目标文件夹不存在');
      }

      if (targetFolder.path.startsWith(folder.path + '/')) {
        throw new ConflictException('不能将文件夹移动到其子文件夹中');
      }

      targetPath = targetFolder.path;
    }

    const newPath = targetPath === '/' ? `/${folder.name}` : `${targetPath}/${folder.name}`;

    const existingFolder = await this.prisma.folder.findFirst({
      where: {
        userId,
        path: newPath,
        id: { not: folderId },
      },
    });

    if (existingFolder) {
      throw new ConflictException('目标位置已存在同名文件夹');
    }

    return this.prisma.$transaction(async (prisma) => {
      const oldPathPrefix = folder.path;

      await prisma.folder.update({
        where: { id: folderId },
        data: {
          path: newPath,
          parentId: targetFolderId || null,
        },
      });

      const childFolders = await prisma.folder.findMany({
        where: {
          userId,
          path: { startsWith: oldPathPrefix + '/' },
        },
      });

      for (const childFolder of childFolders) {
        const childNewPath = childFolder.path.replace(oldPathPrefix, newPath);
        await prisma.folder.update({
          where: { id: childFolder.id },
          data: { path: childNewPath },
        });
      }

      const childFiles = await prisma.file.findMany({
        where: {
          userId,
          path: { startsWith: oldPathPrefix + '/' },
        },
      });

      for (const childFile of childFiles) {
        const childNewPath = childFile.path.replace(oldPathPrefix, newPath);
        await prisma.file.update({
          where: { id: childFile.id },
          data: { path: childNewPath },
        });
      }

      return prisma.folder.findUnique({ where: { id: folderId } });
    });
  }
}
