import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CheckFastUploadDto {
  @ApiProperty({ description: '文件MD5哈希', example: 'd41d8cd98f00b204e9800998ecf8427e' })
  @IsString()
  @IsNotEmpty()
  md5: string;

  @ApiProperty({ description: '文件名', example: 'document.pdf' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: '目标文件夹ID（可选）', required: false, example: 'uuid-folder-id' })
  @IsString()
  @IsOptional()
  folderId?: string;
}
