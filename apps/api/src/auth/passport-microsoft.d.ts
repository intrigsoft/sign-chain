declare module 'passport-microsoft' {
  import { Strategy as PassportStrategy } from 'passport';

  interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string[];
  }

  type VerifyCallback = (
    accessToken: string,
    refreshToken: string,
    profile: {
      id: string;
      displayName?: string;
      emails?: { value: string }[];
    },
    done: (err: Error | null, user?: unknown) => void,
  ) => void;

  export class Strategy extends PassportStrategy {
    constructor(options: StrategyOptions, verify: VerifyCallback);
  }
}
