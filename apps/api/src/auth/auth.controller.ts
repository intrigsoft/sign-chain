import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { MagicLinkDto } from './dto/magic-link.dto';
import { MagicLinkVerifyDto } from './dto/magic-link-verify.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('magic-link')
  async sendMagicLink(@Body() dto: MagicLinkDto) {
    await this.authService.sendMagicLink(dto.email);
    return { message: 'Magic link sent' };
  }

  @Post('magic-link/verify')
  async verifyMagicLink(@Body() dto: MagicLinkVerifyDto) {
    return this.authService.verifyMagicLink(dto.code);
  }

  // ── Google OAuth ────────────────────────────────────────────────
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin() {
    // Passport redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: Request, @Res() res: Response) {
    const token = await this.authService.handleOAuthCallback(req.user as {
      providerId: string;
      email: string;
      name: string | null;
      provider: string;
    });
    res.redirect(`signchain://auth/callback?token=${token}`);
  }

  // ── Microsoft OAuth ─────────────────────────────────────────────
  @Get('microsoft')
  @UseGuards(AuthGuard('microsoft'))
  microsoftLogin() {
    // Passport redirects to Microsoft
  }

  @Get('microsoft/callback')
  @UseGuards(AuthGuard('microsoft'))
  async microsoftCallback(@Req() req: Request, @Res() res: Response) {
    const token = await this.authService.handleOAuthCallback(req.user as {
      providerId: string;
      email: string;
      name: string | null;
      provider: string;
    });
    res.redirect(`signchain://auth/callback?token=${token}`);
  }

  // ── Protected routes ────────────────────────────────────────────
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Req() req: Request) {
    return this.authService.getMe((req.user as { id: string }).id);
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refresh(@Req() req: Request) {
    return this.authService.refreshToken((req.user as { id: string }).id);
  }
}
