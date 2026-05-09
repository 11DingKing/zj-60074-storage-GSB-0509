import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { FileService } from './file.service';
import { RenameFileDto } from './dto/rename-file.dto';
import { MoveFileDto } from './dto/move-file.dto';
import { CopyFileDto } from './dto/copy-file.dto';
import { UpdateAccessDto } from './dto/update-access.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';
import { LogService, OperationType } from '../log/log.service';
import { Request } from '@nestjs/common';

@ApiTags('文件管理')
@Controller('files')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class FileController {
  constructor(
    private readonly fileService: FileService,
    private readonly logService: LogService,
  ) {}

  @Get()
  @ApiOperation({ summary: '获取文件列表', description: '获取指定文件夹下的所有文件' })
  @ApiQuery({ name: 'folderId', required: false, description: '文件夹ID，不填则获取根目录' })
  @ApiResponse({ status: 200, description: '返回文件列表' })
  async listFiles(
    @CurrentUser() user: any,
    @Query('folderId') folderId?: string,
  ) {
    return this.fileService.listFiles(user.id, folderId);
  }

  @Get(':id')
  @ApiOperation({ summary: '获取文件详情', description: '获取文件的详细信息' })
  @ApiResponse({ status: 200, description: '返回文件详情' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async getFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.fileService.getFileById(user.id, id);
  }

  @Put(':id/rename')
  @ApiOperation({ summary: '重命名文件', description: '重命名指定的文件' })
  @ApiResponse({ status: 200, description: '重命名成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  @ApiResponse({ status: 409, description: '名称已存在' })
  async renameFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() renameFileDto: RenameFileDto,
    @Request() req: any,
  ) {
    const file = await this.fileService.renameFile(user.id, id, renameFileDto);
    await this.logService.log(user.id, OperationType.RENAME, file.id, file.name, file.path, req);
    return file;
  }

  @Put(':id/move')
  @ApiOperation({ summary: '移动文件', description: '将文件移动到目标位置' })
  @ApiResponse({ status: 200, description: '移动成功' })
  @ApiResponse({ status: 404, description: '文件或目标文件夹不存在' })
  @ApiResponse({ status: 409, description: '目标位置已存在同名文件' })
  async moveFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() moveFileDto: MoveFileDto,
    @Request() req: any,
  ) {
    const file = await this.fileService.moveFile(user.id, id, moveFileDto);
    await this.logService.log(user.id, OperationType.MOVE, file.id, file.name, file.path, req);
    return file;
  }

  @Post(':id/copy')
  @ApiOperation({ summary: '复制文件', description: '将文件复制到目标位置' })
  @ApiResponse({ status: 201, description: '复制成功' })
  @ApiResponse({ status: 404, description: '文件或目标文件夹不存在' })
  @ApiResponse({ status: 409, description: '目标位置已存在同名文件或存储空间不足' })
  async copyFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() copyFileDto: CopyFileDto,
    @Request() req: any,
  ) {
    const file = await this.fileService.copyFile(user.id, id, copyFileDto);
    await this.logService.log(user.id, OperationType.COPY, file.id, file.name, file.path, req);
    return file;
  }

  @Put(':id/access')
  @ApiOperation({ summary: '更新文件访问权限', description: '设置文件为私有或公开访问' })
  @ApiResponse({ status: 200, description: '更新成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async updateAccessControl(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateAccessDto: UpdateAccessDto,
    @Request() req: any,
  ) {
    const file = await this.fileService.updateAccessControl(user.id, id, updateAccessDto);
    return file;
  }

  @Delete(':id')
  @ApiOperation({ summary: '删除文件', description: '将文件移动到回收站' })
  @ApiResponse({ status: 200, description: '删除成功' })
  @ApiResponse({ status: 404, description: '文件不存在' })
  async deleteFile(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Request() req: any,
  ) {
    const file = await this.fileService.getFileById(user.id, id);
    await this.fileService.deleteFile(user.id, id);
    await this.logService.log(user.id, OperationType.DELETE, file.id, file.name, file.path, req);
    return { message: '文件已移动到回收站' };
  }
}
