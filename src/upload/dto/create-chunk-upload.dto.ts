import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateChunkUploadDto {
  @ApiProperty({ description: '文件名', example: 'large_file.zip' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: '文件总大小（字节）', example: 104857600 })
  @IsNumber()
  @IsNotEmpty()
  totalSize: number;

  @ApiProperty({ description: '总分片数', example: 100 })
  @IsNumber()
  @IsNotEmpty()
  totalChunks: number;

  @ApiProperty({ description: '文件MD5（可选，用于秒传）', example: 'd41d8cd98f00b204e9800998ecf8427e', required: false })
  @IsString()
  @IsOptional()
  md5?: string;

  @ApiProperty({ description: '目标文件夹ID（可选）', example: 'uuid', required: false })
  @IsString()
  @IsOptional()
  folderId?: string;
}
