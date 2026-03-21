import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

export interface RequestUser {
  id: string;
  email: string;
  walletAddress: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

@Injectable()
export class DevUserMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    req.user = {
      id: 'dev-user-id',
      email: 'dev@signchain.local',
      walletAddress: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    };
    next();
  }
}
