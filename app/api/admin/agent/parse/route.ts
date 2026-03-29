import { NextResponse } from 'next/server';
import { verifyAdminRequest } from '@/lib/admin-auth';
import { parseInstruction } from '@/app/lib/agent/parseInstruction';

type Body = { instruction?: string };

export async function POST(request: Request) {
  if (!verifyAdminRequest(request)) {
    return NextResponse.json(
      {
        error:
          '認可に失敗しました。/admin/login でセッションを開始するか、ADMIN_API_SECRET を未設定の開発環境で利用してください。',
      },
      { status: 401 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const instruction = typeof body.instruction === 'string' ? body.instruction : '';
  if (!instruction.trim()) {
    return NextResponse.json({ error: 'instruction は必須です。' }, { status: 400 });
  }

  try {
    const parsed = await parseInstruction(instruction);
    return NextResponse.json({ parsed });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[agent] parse failed', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
