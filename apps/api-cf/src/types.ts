export type Bindings = {
  DB: D1Database;
  // Secrets
  JWT_SECRET: string;
  RELAYER_PRIVATE_KEY: string;
  RPC_URL: string;
  SIGNCHAIN_CONTRACT_ADDRESS: string;
  RESEND_API_KEY: string;
  // Vars
  MAIL_FROM: string;
  ANCHOR_QUOTA: string;
  APP_DEEP_LINK: string;
  // Comma-separated allowlist of browser origins; "*" allows any.
  CORS_ALLOWED_ORIGINS: string;
  // OAuth
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_CALLBACK_URL: string;
  MICROSOFT_CLIENT_ID: string;
  MICROSOFT_CLIENT_SECRET: string;
  MICROSOFT_CALLBACK_URL: string;
};

export type Variables = {
  userId: string;
};
