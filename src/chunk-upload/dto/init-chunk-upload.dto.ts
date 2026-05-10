import { IsString, IsNumber, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class InitChunkUploadDto {
  @ApiProperty({ description: '文件名' })
  @IsString()
  fileName: string;

  @ApiProperty({ description: '文件总大小（字节）' })
  @IsNumber()
  @Min(1)
  totalSize: number;

  @ApiProperty({ description: '总分片数' })
  @IsInt()
  @Min(1)
  totalChunks: number;

  @ApiProperty({ description: '文件 MD5 哈希值' })
  @IsString()
  md5: string;
}
