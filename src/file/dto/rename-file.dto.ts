import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class RenameFileDto {
  @ApiProperty({ description: '新文件名', example: 'new_name.jpg' })
  @IsString()
  @IsNotEmpty()
  newName: string;
}
