// This middleware is no longer applied — auth is handled by JWT.
// Keeping the Express type augmentation for backward compatibility.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        name?: string | null;
        trust?: string;
        verified?: boolean;
      };
    }
  }
}

export {};
