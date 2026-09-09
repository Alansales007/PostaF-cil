import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { rateLimit } from '@/lib/rate-limit';
import { getEnv } from '@/lib/env';

const registerSchema = z.object({
  name: z.string().min(2, 'Informe seu nome').max(120),
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'A senha precisa ter no mínimo 8 caracteres'),
});

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
  const env = getEnv();
  const limit = rateLimit(`register:${ip}`, 5, env.RATE_LIMIT_WINDOW_MS);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente em instantes.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((limit.resetAt - Date.now()) / 1000)) } },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Dados inválidos' },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);

  const user = await db.user.create({
    data: { name: parsed.data.name, email, passwordHash },
    select: { id: true, email: true, name: true },
  });

  await db.auditLog.create({
    data: { userId: user.id, action: 'user.registered', entityType: 'User', entityId: user.id },
  });

  logger.info({ userId: user.id }, 'Novo usuário registrado');

  return NextResponse.json({ user }, { status: 201 });
}
