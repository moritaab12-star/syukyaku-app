'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { linesToStringArray } from '@/app/lib/service-persona/normalize';
import type { ServicePersonaParsed } from '@/app/lib/service-persona/parse-db-row';
import type { ServicePersonaCreateBody } from '@/app/lib/service-persona/schema';
import {
  canonicalNestedMasterFromFormBody,
  canonicalNestedMasterFromParsedRow,
  formStateFromMasterJson,
  parseMasterJsonText,
} from '@/app/lib/service-persona/master-json-mapper';

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-sky-300 focus:bg-slate-900';
const labelClass = 'text-sm font-semibold text-slate-50';

const MASTER_JSON_PLACEHOLDER = `{
  "service_key": "real_estate_rent",
  "basic": { "service_name": "不動産賃貸", "tone": "親身・安心" },
  "language_rules": { "forbidden_words": [] },
  "cta_rules": { "patterns": [] },
  "content_rules": { "pain_points": [], "faq_topics": [], "hero_angles": [] },
  "structure_rules": { "section_order": [] },
  "design_rules": {},
  "writing_rules": [],
  "compliance_rules": []
}`;

function initialMasterJsonText(r: ServicePersonaParsed): string {
  const mj = r.master_json;
  if (mj && Object.keys(mj).length > 0) {
    return JSON.stringify(mj, null, 2);
  }
  if (r.persona_json && Object.keys(r.persona_json).length > 0) {
    return JSON.stringify(r.persona_json, null, 2);
  }
  return JSON.stringify(canonicalNestedMasterFromParsedRow(r), null, 2);
}

export default function ServicePersonaEditPage() {
  const router = useRouter();
  const params = useParams();
  const idRaw = typeof params?.id === 'string' ? params.id : '';
  const [loading, setLoading] = useState(true);
  const [serviceName, setServiceName] = useState('');
  const [serviceKeyDisplay, setServiceKeyDisplay] = useState('');
  const [tone, setTone] = useState('');
  const [ctaLines, setCtaLines] = useState('');
  const [painLines, setPainLines] = useState('');
  const [faqLines, setFaqLines] = useState('');
  const [forbiddenLines, setForbiddenLines] = useState('');
  const [sectionLines, setSectionLines] = useState('');
  const [masterJsonText, setMasterJsonText] = useState('');
  const [rawJson, setRawJson] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyRow = useCallback((r: ServicePersonaParsed) => {
    setServiceName(r.service_name);
    setServiceKeyDisplay(r.service_key);
    setTone(r.tone ?? '');
    setCtaLines(r.cta_labels.join('\n'));
    setPainLines(r.pain_points.join('\n'));
    setFaqLines(r.faq_topics.join('\n'));
    setForbiddenLines(r.forbidden_words.join('\n'));
    setSectionLines(r.section_structure.join('\n'));
    setMasterJsonText(initialMasterJsonText(r));
    setRawJson(
      r.raw_json && typeof r.raw_json === 'object'
        ? JSON.stringify(r.raw_json, null, 2)
        : '',
    );
    setIsActive(r.is_active);
  }, []);

  useEffect(() => {
    if (!idRaw) {
      setLoading(false);
      setError('無効な ID です');
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/service-personas/${idRaw}`, {
          credentials: 'include',
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !j?.ok || !j.row) {
          setError(
            typeof j?.error === 'string'
              ? j.error
              : 'データの取得に失敗しました。',
          );
          return;
        }
        applyRow(j.row as ServicePersonaParsed);
      } catch {
        if (!cancelled) setError('データの取得に失敗しました。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idRaw, applyRow]);

  const handleFormToJson = () => {
    setError(null);
    try {
      if (!serviceKeyDisplay.trim() || !serviceName.trim()) {
        setError('業種名と service_key が必要です。');
        return;
      }
      const body: ServicePersonaCreateBody = {
        service_key: serviceKeyDisplay.trim(),
        service_name: serviceName.trim(),
        tone: tone.trim() || null,
        cta_labels: linesToStringArray(ctaLines),
        pain_points: linesToStringArray(painLines),
        faq_topics: linesToStringArray(faqLines),
        forbidden_words: linesToStringArray(forbiddenLines),
        section_structure: linesToStringArray(sectionLines),
        is_active: isActive,
        raw_json: null,
      };
      const obj = canonicalNestedMasterFromFormBody(body);
      setMasterJsonText(JSON.stringify(obj, null, 2));
    } catch {
      setError('フォームからの生成に失敗しました。');
    }
  };

  const handleJsonToForm = () => {
    setError(null);
    const pr = parseMasterJsonText(masterJsonText);
    if (pr._result !== 'valid') {
      setError(pr.error);
      return;
    }
    const sk =
      typeof pr.data.service_key === 'string'
        ? pr.data.service_key.trim()
        : '';
    if (sk !== serviceKeyDisplay.trim()) {
      setError(
        `JSON の service_key「${sk}」がこの行のキー「${serviceKeyDisplay}」と一致しません。`,
      );
      return;
    }
    const fs = formStateFromMasterJson(pr.data);
    setServiceName(fs.serviceName);
    setTone(fs.tone);
    setCtaLines(fs.ctaLines);
    setPainLines(fs.painLines);
    setFaqLines(fs.faqLines);
    setForbiddenLines(fs.forbiddenLines);
    setSectionLines(fs.sectionLines);
    setIsActive(fs.isActive);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!idRaw) return;
    setError(null);
    setSubmitting(true);
    try {
      const useMasterJson = masterJsonText.trim().length > 0;

      if (useMasterJson) {
        const pr = parseMasterJsonText(masterJsonText);
        if (pr._result !== 'valid') {
          setError(pr.error);
          setSubmitting(false);
          return;
        }
        const sk =
          typeof pr.data.service_key === 'string'
            ? pr.data.service_key.trim()
            : '';
        if (sk !== serviceKeyDisplay.trim()) {
          setError(
            `JSON の service_key「${sk}」がこの行のキー「${serviceKeyDisplay}」と一致しません。`,
          );
          setSubmitting(false);
          return;
        }
      }

      let rawParsed: unknown = null;
      if (rawJson.trim().length > 0) {
        try {
          rawParsed = JSON.parse(rawJson) as unknown;
        } catch {
          setError('raw_json は有効な JSON である必要があります。');
          setSubmitting(false);
          return;
        }
      }

      const body: Record<string, unknown> = useMasterJson
        ? {
            master_json_text: masterJsonText.trim(),
            raw_json: rawParsed,
          }
        : {
            service_name: serviceName.trim(),
            tone: tone.trim() || null,
            cta_labels: linesToStringArray(ctaLines),
            pain_points: linesToStringArray(painLines),
            faq_topics: linesToStringArray(faqLines),
            forbidden_words: linesToStringArray(forbiddenLines),
            section_structure: linesToStringArray(sectionLines),
            is_active: isActive,
            raw_json: rawParsed,
          };

      const res = await fetch(`/api/admin/service-personas/${idRaw}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j?.ok) {
        setError(
          typeof j?.error === 'string' ? j.error : '更新に失敗しました。',
        );
        setSubmitting(false);
        return;
      }
      router.push('/admin/service-personas');
    } catch {
      setError('更新に失敗しました。');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-10 text-slate-400">
        読み込み中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-2xl px-4 py-10 md:px-8">
        <Link
          href="/admin/service-personas"
          className="mb-6 inline-flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          一覧に戻る
        </Link>
        <h1 className="text-xl font-semibold text-slate-50">
          業種ルールマスター（編集）
        </h1>
        <p className="mt-2 font-mono text-xs text-slate-500">
          service_key: {serviceKeyDisplay}（変更不可）
        </p>

        {error && (
          <div className="mt-6 rounded-xl border border-red-800/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-8 space-y-6">
          <div className="space-y-2">
            <label className={labelClass}>業種名</label>
            <input
              className={inputClass}
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
              required={masterJsonText.trim().length === 0}
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>tone（任意）</label>
            <textarea
              className={`${inputClass} min-h-[4rem]`}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>CTAラベル（1行1つ）</label>
            <textarea
              className={`${inputClass} min-h-[6rem] font-mono text-xs`}
              value={ctaLines}
              onChange={(e) => setCtaLines(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>悩み（1行1つ）</label>
            <textarea
              className={`${inputClass} min-h-[6rem]`}
              value={painLines}
              onChange={(e) => setPainLines(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>FAQトピック（1行1つ）</label>
            <textarea
              className={`${inputClass} min-h-[6rem]`}
              value={faqLines}
              onChange={(e) => setFaqLines(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>禁止ワード（1行1つ）</label>
            <textarea
              className={`${inputClass} min-h-[5rem] font-mono text-xs`}
              value={forbiddenLines}
              onChange={(e) => setForbiddenLines(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>セクション構成（1行1つ）</label>
            <textarea
              className={`${inputClass} min-h-[5rem]`}
              value={sectionLines}
              onChange={(e) => setSectionLines(e.target.value)}
            />
          </div>

          <div className="space-y-3 rounded-2xl border border-amber-900/50 bg-amber-950/20 p-5 ring-1 ring-amber-900/30">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200">
                ルールの本体
              </span>
              <label className={`${labelClass} mb-0`}>
                業種ルール master_json（JSON）
              </label>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              このJSONは業種ルールの<strong className="font-medium text-slate-200">本体</strong>
              です。入力されている場合、保存時は<strong className="font-medium text-slate-200">このJSONだけ</strong>
              が正として保存され、フォームとはマージされません。
              <span className="mt-1 block">
                フォームだけで更新したいときは、この欄を空にしてから保存してください。
              </span>
              service_key はこの行と一致している必要があります。
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleFormToJson()}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                フォームからJSON生成
              </button>
              <button
                type="button"
                onClick={() => handleJsonToForm()}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
              >
                JSONからフォームへ反映
              </button>
            </div>
            <textarea
              className={`${inputClass} min-h-[28rem] font-mono text-xs leading-relaxed text-sky-100/95`}
              value={masterJsonText}
              onChange={(e) => setMasterJsonText(e.target.value)}
              placeholder={MASTER_JSON_PLACEHOLDER}
              spellCheck={false}
              autoComplete="off"
              data-gramm="false"
            />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>raw_json（任意）</label>
            <textarea
              className={`${inputClass} min-h-[5rem] font-mono text-xs`}
              value={rawJson}
              onChange={(e) => setRawJson(e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="rounded border-slate-600"
            />
            有効
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-sky-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {submitting ? '保存中…' : '保存する'}
          </button>
        </form>
      </div>
    </div>
  );
}
