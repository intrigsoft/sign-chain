import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(config: ConfigService) {
    const clientID = config.get<string>('MICROSOFT_CLIENT_ID', '');
    const clientSecret = config.get<string>('MICROSOFT_CLIENT_SECRET', '');
    const callbackURL = config.get<string>(
      'MICROSOFT_CALLBACK_URL',
      'http://localhost:3000/api/auth/microsoft/callback',
    );

    super({
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL,
      scope: ['user.read'],
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: { id: string; emails?: { value: string }[]; displayName?: string },
    done: (err: Error | null, user?: unknown) => void,
  ) {
    const email = profile.emails?.[0]?.value;
    if (!email) {
      return done(new Error('No email returned from Microsoft'));
    }
    done(null, {
      providerId: profile.id,
      email,
      name: profile.displayName || null,
      provider: 'microsoft',
    });
  }
}
