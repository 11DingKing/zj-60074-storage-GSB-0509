import { Controller, Post, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FolderService } from './folder.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { RenameFolderDto } from './dto/rename-folder.dto';
import { MoveFolderDto } from './dto/move-folder.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';
import { Request } from '@nestjs/common';

@ApiTags('文件管理')
@Controller('folders')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FolderController {
  constructor(
    private readonly folderService: FolderService,
    private readonly logService: LogService,
  ) {}

  @Post()
  @ApiOperation({ summary: '创建文件夹', description: '在指定位置创建新文件夹' })
  @ApiResponse({ status: 201, description: '文件夹创建成功' })
  @ApiResponse({ status: 404, description: '父文件夹不存在' })
  @ApiResponse({ status: 409, description: '文件夹已存在' })
  async createFolder(
    @CurrentUser() user: any,
    @Body() createFolderDto: CreateFolderDto,
    @Request() req: any,
  ) {
    const folder = await this.folderService.createFolder(user.id, createFolderDto);
    await this.logService.log(user.id, OperationType.CREATE_FOLDER, undefined, folder.name, folder.path, req);
    return folder;
  }

  @Get()
  @ApiOperation({ summary: '获取文件夹列表', description: '获取指定父文件夹下的所有子文件夹' })
  @ApiQuery({ name: 'parentId', required: false, description: '父文件夹ID，不填则获取根目录' })
  @ApiResponse({ status: 200, description: '返回文件夹列表' })
  async listFolders(
    @CurrentUser() user: any,
    @Query('parentId') parentId?: string,
  ) {
    return this.folderService.listFolders(user.id, parentId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取文件夹详情', description: '获取文件夹的详细信息，包括子文件夹和文件' })
  @ApiResponse({ status: 200, description: '返回文件夹详情' })
  @ApiResponse({ status: 404, description: '文件夹不存在' })
  async getFolder(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.folderService.getFolderById(user.id, id);
  }

  @Put(':id/rename')
  @ApiOperation({ summary: '重命名文件夹', description: '重命名指定的文件夹' })
  @ApiResponse({ status: 200, description: '重命名成功' })
  @ApiResponse({ status: 404, description: '文件夹不存在' })
  @ApiResponse({ status: 409, description: '名称已存在' })
  async renameFolder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() renameFolderDto: RenameFolderDto,
    @Request() req: any,
  ) {
    const folder = await this.folderService.renameFolder(user.id, id, renameFolderDto);
    await this.logService.log(user.id, OperationType.RENAME, undefined, folder.name, folder.path, req);
    return folder;
  }

  @Put(':id/move')
  @ApiOperation({ summary: '移动文件夹', description: '将文件夹移动到目标位置' })
  @ApiResponse({ status: 200, description: '移动成功' })
  @ApiResponse({ status: 404, description: '文件夹或目标文件夹不存在' })
  @ApiResponse({ status: 409, description: '无法移动到自身或子文件夹' })
  async moveFolder(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() moveFolderDto: MoveFolderDto,
    @Request() req: any,
  ) {
    const folder = await this.folderService.moveFolder(user.id, id, moveFolderDto);
    await this.logService.log(user.id, OperationType.MOVE, undefined, folder.name, folder.path, req);
    return folder;
  }
}
