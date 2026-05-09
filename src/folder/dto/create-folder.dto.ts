import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateFolderDto {
  @ApiProperty({ description: '文件夹名称', example: '我的文件夹' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: '父文件夹ID（可选，不填则在根目录）', example: 'uuid', required: false })
  @IsString()
  @IsOptional()
  parentId?: string;
}
