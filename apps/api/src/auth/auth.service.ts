import {
  Injectable,
  Logger,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private mail: MailService,
  ) {}

  async sendMagicLink(email: string): Promise<void> {
    // Generate 6-digit code
    const code = Math.floor(100_000 + Math.random() * 900_000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await this.prisma.magicLink.create({
      data: { email, code, expiresAt },
    });

    await this.mail.sendMagicLinkEmail(email, code);
    this.logger.log(`Magic link sent to ${email}`);
  }

  async verifyMagicLink(code: string): Promise<{ token: string }> {
    const link = await this.prisma.magicLink.findFirst({
      where: {
        code,
        used: false,
        expiresAt: { gt: new Date() },
      },
    });

    if (!link) {
      throw new BadRequestException('Invalid or expired code');
    }

    // Mark as used
    await this.prisma.magicLink.update({
      where: { id: link.id },
      data: { used: true },
    });

    // Find or create user
    const user = await this.prisma.user.upsert({
      where: { email: link.email },
      update: {},
      create: { email: link.email, authProvider: 'email' },
    });

    return { token: this.issueJwt(user) };
  }

  async handleOAuthCallback(profile: {
    providerId: string;
    email: string;
    name: string | null;
    provider: string;
  }): Promise<string> {
    // Try to find user by email first — upgrade provider if needed
    let user = await this.prisma.user.findUnique({
      where: { email: profile.email },
    });

    if (user) {
      // Upgrade auth provider if currently email-only
      if (user.authProvider === 'email') {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            authProvider: profile.provider,
            providerId: profile.providerId,
            name: user.name || profile.name,
          },
        });
      }
    } else {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          name: profile.name,
          authProvider: profile.provider,
          providerId: profile.providerId,
        },
      });
    }

    return this.issueJwt(user);
  }

  async refreshToken(userId: string): Promise<{ token: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return { token: this.issueJwt(user) };
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      authProvider: user.authProvider,
      anchorCount: user.anchorCount,
      createdAt: user.createdAt,
    };
  }

  private issueJwt(user: { id: string; email: string; name: string | null; authProvider: string }): string {
    return this.jwt.sign({
      sub: user.id,
      email: user.email,
      name: user.name,
      trust: user.authProvider,
      verified: true,
    });
  }
}
