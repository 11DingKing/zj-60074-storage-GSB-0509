import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsIn } from 'class-validator';

export class UpdateAccessDto {
  @ApiProperty({ description: '访问控制类型', enum: ['private', 'public'] })
  @IsString()
  @IsIn(['private', 'public'])
  accessControl: 'private' | 'public';
}
