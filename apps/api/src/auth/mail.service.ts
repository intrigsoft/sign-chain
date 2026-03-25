import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'localhost'),
      port: this.config.get<number>('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.config.get<string>('SMTP_USER', ''),
        pass: this.config.get<string>('SMTP_PASS', ''),
      },
    });
  }

  async sendMagicLinkEmail(email: string, code: string): Promise<void> {
    const from = this.config.get<string>('MAIL_FROM', 'noreply@signchain.app');

    try {
      await this.transporter.sendMail({
        from,
        to: email,
        subject: 'Your SignChain login code',
        text: `Your login code is: ${code}\n\nThis code expires in 10 minutes.`,
        html: `
          <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
            <h2 style="color: #6d28d9; margin-bottom: 24px;">SignChain</h2>
            <p>Your login code is:</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111; margin: 24px 0; text-align: center;">
              ${code}
            </div>
            <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
          </div>
        `,
      });
      this.logger.log(`Magic link email sent to ${email}`);
    } catch (err) {
      this.logger.error(`Failed to send magic link email to ${email}`, err);
      throw err;
    }
  }
}
