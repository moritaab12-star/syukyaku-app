import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase';

const geminiKey = process.env.GEMINI_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { contractor_id, seed_date, generated_content } = body as {
      contractor_id?: string;
      seed_date?: string;
      generated_content?: string;
    };

    if (!generated_content || !contractor_id || !seed_date) {
      return NextResponse.json(
        { error: 'contractor_id, seed_date, generated_content が必要です' },
        { status: 400 },
      );
    }

    let self_score: number | null = null;
    let feedback_notes: string | null = null;

    if (geminiKey) {
      const prompt = `あなたはLPの採点者です。以下のLPテキストを1〜10で採点し、改善点を3つ以内で簡潔にフィードバックしてください。
必ず次のJSON形式のみで返してください（他に文章は書かないでください）:
{"self_score": 数字1-10, "feedback_notes": "改善点を箇条書きで"}

LPテキスト:
${generated_content.slice(0, 8000)}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
        },
      );

      if (res.ok) {
        const data = await res.json();
        const text =
          data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text) as {
            self_score?: number;
            feedback_notes?: string;
          };
          self_score = typeof parsed.self_score === 'number' ? parsed.self_score : null;
          feedback_notes =
            typeof parsed.feedback_notes === 'string' ? parsed.feedback_notes : null;
        } catch {
          feedback_notes = text.slice(0, 500);
        }
      }
    }

    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.from('generated_lps').insert({
      contractor_id,
      seed_date,
      generated_content: generated_content.slice(0, 50000),
      self_score: self_score ?? undefined,
      feedback_notes: feedback_notes ?? undefined,
    });

    if (error) {
      console.error('generated_lps insert error', error);
      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      self_score: self_score ?? undefined,
      feedback_notes: feedback_notes ?? undefined,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 },
    );
  }
}
