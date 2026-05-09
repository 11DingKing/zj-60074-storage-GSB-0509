import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from '../common/decorators/user.decorator';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: '用户登录', description: '使用用户名和密码登录，返回 JWT token' })
  @ApiResponse({ status: 200, description: '登录成功，返回 token 和用户信息' })
  @ApiResponse({ status: 401, description: '用户名或密码错误' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @ApiOperation({ summary: '用户注册', description: '注册新用户，自动创建默认文件夹' })
  @ApiResponse({ status: 201, description: '注册成功，返回用户信息' })
  @ApiResponse({ status: 409, description: '用户名或邮箱已存在' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息', description: '获取当前登录用户的详细信息' })
  @ApiResponse({ status: 200, description: '返回用户信息' })
  @ApiResponse({ status: 401, description: '未授权' })
  getProfile(@CurrentUser() user: any) {
    return user;
  }
}
