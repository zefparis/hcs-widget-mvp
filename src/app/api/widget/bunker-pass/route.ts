import { NextRequest, NextResponse } from 'next/server';
import { createHmac, randomUUID } from 'crypto';

const BUNKER_SECRET = process.env.BUNKER_SIGNING_SECRET;
const MAX_TTL = 3600;

export async function POST(request: NextRequest) {
  if (!BUNKER_SECRET) {
    return NextResponse.json({ error: 'bunker_signing_not_configured' }, { status: 503 });
  }

  let ttl = 900;
  try {
    const body = await request.json();
    if (typeof body?.ttl === 'number' && body.ttl > 0) {
      ttl = Math.min(body.ttl, MAX_TTL);
    }
  } catch { /* use default ttl */ }

  const jti = randomUUID().replace(/-/g, '');
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${jti}.${exp}`;
  const sig = createHmac('sha256', BUNKER_SECRET).update(payload).digest('hex');
  const token = `${payload}.${sig}`;

  return NextResponse.json({ token, exp }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}
