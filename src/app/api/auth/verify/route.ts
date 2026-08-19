import { NextResponse } from 'next/server';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { db } from '@/lib/backendDb';
import { encryptSecret } from '@/lib/crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'clickrypt-super-secret-jwt-key-2025';

// Pre-generated static dummy public key for synthetic challenges (eliminates RSA keygen timing variance)
const DUMMY_PUBLIC_KEY = `-----BEGIN PGP PUBLIC KEY BLOCK-----
Version: Clickrypt Synthetic 1.0

mQENBF2SyntheticDummyPublicKeyBlockForTimingProtection123456789==
-----END PGP PUBLIC KEY BLOCK-----`;

// Simple in-memory rate limiting store (max 5 requests per minute per IP/email)
const rateLimitStore: Record<string, { count: number; expiresAt: number }> = {};

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore[key];
  if (!entry || entry.expiresAt < now) {
    rateLimitStore[key] = { count: 1, expiresAt: now + 60000 };
    return false;
  }
  entry.count += 1;
  return entry.count > 5;
}

// Environment-conditional CORS allowlist validator
function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') || '';
  const isProd = process.env.NODE_ENV === 'production';

  const allowedOrigins = isProd
    ? [process.env.EXTENSION_ORIGIN || 'chrome-extension://clickrypt-official-extension']
    : [
        'http://localhost:3000',
        'http://localhost:3001',
        process.env.EXTENSION_ORIGIN || 'chrome-extension://clickrypt-official-extension',
      ];

  if (origin && (allowedOrigins.includes(origin) || origin.startsWith('chrome-extension://'))) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
  }

  return {};
}

export async function OPTIONS(req: Request) {
  const headers = getCorsHeaders(req);
  return new NextResponse(null, { status: 200, headers });
}

export async function POST(req: Request) {
  const corsHeaders = getCorsHeaders(req);

  try {
    const body = await req.json();
    const { email, challengeToken, challengeUuid } = body;
    const clientIp = req.headers.get('x-forwarded-for') || '127.0.0.1';

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400, headers: corsHeaders });
    }

    // Rate Limiting Check (Step 1 & Step 2)
    const rateLimitKey = `${clientIp}:${email.toLowerCase()}`;
    if (isRateLimited(rateLimitKey)) {
      return NextResponse.json(
        { error: 'Rate limit exceeded: Too many verification attempts. Please wait 1 minute.' },
        { status: 429, headers: corsHeaders }
      );
    }

    // ==========================================
    // STEP 1: Issue Challenge
    // ==========================================
    if (!challengeUuid && !challengeToken) {
      const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase() && u.status === 'Active');
      const isRealUser = Boolean(user);

      // Deactivate previous active challenges for this email (hygiene tradeoff)
      db.authChallenges.forEach((c) => {
        if (c.email.toLowerCase() === email.toLowerCase()) {
          c.active = false;
        }
      });

      const randomUuid = crypto.randomUUID();
      const token = `ch-token-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const expiresAt = new Date(Date.now() + 1000 * 60 * 5).toISOString(); // 5 minutes

      // Target Public Key: Real user key OR Static Dummy Key for synthetic non-enumerating challenge
      const targetPublicKey = isRealUser && user?.publicKey ? user.publicKey : DUMMY_PUBLIC_KEY;
      const challengeCiphertext = await encryptSecret(randomUuid, targetPublicKey);

      // PERSIST BOTH REAL & SYNTHETIC CHALLENGES IN DB (Identical execution path in Step 2)
      db.authChallenges.push({
        id: `ch-rec-${Date.now()}`,
        challengeToken: token,
        email: email.toLowerCase(),
        challengeUuid: randomUuid,
        userId: isRealUser && user ? user.id : null,
        active: true,
        isSynthetic: !isRealUser,
        createdAt: new Date().toISOString(),
        expiresAt,
      });

      return NextResponse.json(
        {
          challengeCiphertext,
          challengeToken: token,
        },
        { status: 200, headers: corsHeaders }
      );
    }

    // ==========================================
    // STEP 2: Verify Response
    // ==========================================
    if (!challengeToken || !challengeUuid) {
      return NextResponse.json({ error: 'Invalid verification attempt' }, { status: 400, headers: corsHeaders });
    }

    const challengeRecord = db.authChallenges.find(
      (c) => c.challengeToken === challengeToken && c.email.toLowerCase() === email.toLowerCase()
    );

    // If challenge token not found or already consumed/expired
    if (!challengeRecord || !challengeRecord.active || new Date(challengeRecord.expiresAt).getTime() < Date.now()) {
      return NextResponse.json({ error: 'Invalid verification attempt' }, { status: 400, headers: corsHeaders });
    }

    // CONSUME & DEACTIVATE TOKEN IMMEDIATELY (Single-use replay protection)
    challengeRecord.active = false;

    // SHA-256 LENGTH-NORMALIZED CONSTANT-TIME COMPARISON
    let isMatch = false;
    try {
      const storedDigest = crypto.createHash('sha256').update(challengeRecord.challengeUuid).digest();
      const submittedDigest = crypto.createHash('sha256').update(challengeUuid).digest();
      isMatch = crypto.timingSafeEqual(storedDigest, submittedDigest);
    } catch {
      isMatch = false;
    }

    // Generic error path for synthetic users or UUID mismatches
    if (!isMatch || challengeRecord.isSynthetic || !challengeRecord.userId) {
      return NextResponse.json({ error: 'Invalid verification attempt' }, { status: 400, headers: corsHeaders });
    }

    const user = db.users.find((u) => u.id === challengeRecord.userId);
    if (!user || user.status !== 'Active') {
      return NextResponse.json({ error: 'Invalid verification attempt' }, { status: 400, headers: corsHeaders });
    }

    // Generate Session JWT Token
    const jwtToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    user.lastActive = 'Just now';

    const userMode = (user.accountMode || 'organization') as 'personal' | 'organization';
    db.auditLogsFor(userMode).unshift({
      id: `al-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'EXTENSION_GPGAUTH_LOGIN',
      userId: user.id,
      details: `Successful GPGAuth Challenge/Response authentication for user ${user.email}`,
    });

    const response = NextResponse.json(
      {
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          publicKey: user.publicKey,
          encryptedPrivateKey: user.encryptedPrivateKey,
        },
      },
      { status: 200, headers: corsHeaders }
    );

    // Set HttpOnly access_token Cookie
    response.cookies.set('access_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 86400, // 24 hours
      path: '/',
    });

    return response;
  } catch (err: any) {
    return NextResponse.json({ error: 'Invalid verification attempt' }, { status: 400, headers: corsHeaders });
  }
}
