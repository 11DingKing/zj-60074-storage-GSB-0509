import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RenameFolderDto {
  @ApiProperty({ description: '新文件夹名称', example: '新文件夹名' })
  @IsString()
  @IsNotEmpty()
  newName: string;
}
