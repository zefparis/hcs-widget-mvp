import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const BUNKER_SECRET = process.env.BUNKER_SIGNING_SECRET;

export async function POST(request: NextRequest) {
  if (!BUNKER_SECRET) {
    return NextResponse.json({ valid: false, reason: 'bunker_signing_not_configured' });
  }

  let token: string | undefined;
  try {
    const body = await request.json();
    token = body?.token;
  } catch {
    return NextResponse.json({ valid: false, reason: 'invalid_json' });
  }

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ valid: false, reason: 'missing_token' });
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return NextResponse.json({ valid: false, reason: 'malformed' });
  }

  const [jti, expStr, clientSig] = parts;
  const exp = parseInt(expStr, 10);

  if (isNaN(exp) || exp < Math.floor(Date.now() / 1000)) {
    return NextResponse.json({ valid: false, reason: 'expired' });
  }

  const payload = `${jti}.${expStr}`;
  const expectedSig = createHmac('sha256', BUNKER_SECRET).update(payload).digest('hex');

  try {
    const clientBuf = Buffer.from(clientSig, 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (clientBuf.length !== expectedBuf.length) {
      return NextResponse.json({ valid: false, reason: 'invalid_signature' });
    }
    const valid = timingSafeEqual(clientBuf, expectedBuf);
    return NextResponse.json({ valid }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ valid: false, reason: 'invalid_signature' });
  }
}
