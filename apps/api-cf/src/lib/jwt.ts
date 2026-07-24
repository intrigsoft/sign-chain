import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface TokenPayload extends JWTPayload {
  sub: string;
  email: string;
  name: string | null;
  trust: string;
}

function key(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function signToken(
  payload: Omit<TokenPayload, 'iat' | 'exp'>,
  secret: string
): Promise<string> {
  return new SignJWT(payload as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key(secret));
}

export async function verifyToken(
  token: string,
  secret: string
): Promise<TokenPayload> {
  const { payload } = await jwtVerify(token, key(secret));
  return payload as TokenPayload;
}
