import { Injectable, ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(username: string, password: string): Promise<any> {
    const user = await this.prisma.user.findUnique({
      where: { username },
    });
    
    if (user && await bcrypt.compare(password, user.password)) {
      const { password: _, ...result } = user;
      return result;
    }
    
    return null;
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.username, loginDto.password);
    
    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }
    
    const payload = { username: user.username, sub: user.id };
    
    return {
      access_token: this.jwtService.sign(payload),
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        isAdmin: user.isAdmin,
        storageQuota: user.storageQuota,
        storageUsed: user.storageUsed,
      },
    };
  }

  async register(registerDto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { username: registerDto.username },
    });
    
    if (existingUser) {
      throw new ConflictException('用户名已存在');
    }
    
    if (registerDto.email) {
      const existingEmail = await this.prisma.user.findUnique({
        where: { email: registerDto.email },
      });
      
      if (existingEmail) {
        throw new ConflictException('邮箱已被使用');
      }
    }
    
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);
    
    const user = await this.prisma.user.create({
      data: {
        username: registerDto.username,
        password: hashedPassword,
        email: registerDto.email,
        storageQuota: this.configService.get<bigint>('DEFAULT_STORAGE_QUOTA', BigInt(10737418240)),
      },
      select: {
        id: true,
        username: true,
        email: true,
        isAdmin: true,
        storageQuota: true,
        storageUsed: true,
      },
    });
    
    await this.createDefaultFolders(user.id);
    
    return user;
  }

  private async createDefaultFolders(userId: string) {
    const defaultFolders = ['文档', '图片', '视频', '音乐'];
    
    for (const folderName of defaultFolders) {
      await this.prisma.folder.create({
        data: {
          name: folderName,
          path: `/${folderName}`,
          userId,
        },
      });
    }
  }
}
