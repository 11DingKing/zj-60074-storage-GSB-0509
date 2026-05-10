import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class InitChunkUploadDto {
  @ApiProperty({ description: '文件名', example: 'large_video.mp4' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: '文件总大小（字节）', example: 1073741824 })
  @IsNumber()
  @IsNotEmpty()
  totalSize: number;

  @ApiProperty({ description: '总分片数', example: 100 })
  @IsNumber()
  @IsNotEmpty()
  totalChunks: number;

  @ApiProperty({ description: '文件MD5哈希', example: 'd41d8cd98f00b204e9800998ecf8427e' })
  @IsString()
  @IsNotEmpty()
  md5: string;

  @ApiProperty({ description: '目标文件夹ID（可选）', required: false, example: 'uuid-folder-id' })
  @IsString()
  @IsOptional()
  folderId?: string;
}
