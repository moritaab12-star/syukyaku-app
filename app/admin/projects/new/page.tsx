'use client';

import React, { Suspense } from 'react';
import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { createSupabaseClient } from '@/lib/supabase';
import {
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Store,
  Cloud,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import {
  LOCAL_QUESTION_BLOCKS,
  SPLIT_QUESTIONS,
  getInitialRawAnswers,
  rawAnswersJsonToRecord,
  isLocalFieldworkRequiredQ,
} from './questions';
import {
  LOCAL_REQUIRED_FIELDWORK_Q_IDS,
  REQUIRED_LOCAL_Q_ERROR_MESSAGES,
} from '@/app/config/local-required-questions';
import { isEffectivelyEmptyRawAnswer } from '@/app/lib/agent/validateRequiredRawAnswers';
import { resolveLpIndustryTone } from '@/app/lib/lp-industry';
import { normalizeServiceName } from '@/app/lib/agent/normalize-service';
import { AgentInstructionInput } from './AgentInstructionInput';
import type { PublishTestFocusProject } from './publish-test-types';
import type { ParsedInstruction } from '@/app/lib/agent/types';

type ProjectType = 'local' | 'saas';

type CompanyInfoForm = {
  company_name: string;
  phone: string;
  email: string;
  line_url: string;
  address: string;
  business_hours: string;
  closed_days: string;
};

function NewProjectPageContent() {
  const searchParams = useSearchParams();
  const editId = (searchParams.get('edit') ?? '').trim();
  const isEditMode = editId.length > 0;

  const initialType: ProjectType =
    searchParams.get('type') === 'saas' && !isEditMode ? 'saas' : 'local';

  const lpGroupQuery = (searchParams.get('lp_group') ?? '').trim();
  const LP_GROUP_UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const lpGroupIdForSave = LP_GROUP_UUID_RE.test(lpGroupQuery)
    ? lpGroupQuery
    : undefined;

  const cloneFromId = (searchParams.get('clone_from') ?? '').trim();
  const isCloneMode =
    !isEditMode && LP_GROUP_UUID_RE.test(cloneFromId);

  const [projectType, setProjectType] = useState<ProjectType>(initialType);
  const [rawAnswers, setRawAnswers] = useState<Record<string, string>>(
    getInitialRawAnswers,
  );
  const [optionalOpenBlock, setOptionalOpenBlock] = useState<number | null>(
    null,
  );
  const [targetAreas, setTargetAreas] = useState('');
  const [targetServices, setTargetServices] = useState('');
  /**
   * 登録済み業種人格の service_key。DB projects.industry_key に保存。
   * 有効な人格が1件以上ある環境では選択必須。
   */
  const [industryKey, setIndustryKey] = useState('');
  const [activePersonas, setActivePersonas] = useState<
    { service_key: string; service_name: string }[]
  >([]);
  const [activePersonasLoaded, setActivePersonasLoaded] = useState(false);

  const [saasName, setSaasName] = useState('');
  const [saasTarget, setSaasTarget] = useState('');
  const [saasProblem, setSaasProblem] = useState('');
  const [saasBenefit, setSaasBenefit] = useState('');
  const [saasPrice, setSaasPrice] = useState('');

  const [companyInfo, setCompanyInfo] = useState<CompanyInfoForm>({
    company_name: '',
    phone: '',
    email: '',
    line_url: '',
    address: '',
    business_hours: '',
    closed_days: '',
  });

  const [companyInfoError, setCompanyInfoError] = useState<{
    phone?: string;
    email?: string;
  }>({});

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exportJson, setExportJson] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  /** AI 量産パネル用の指示文・件数プレビュー */
  const [agentInstruction, setAgentInstruction] = useState('');
  const [parsedCountHint, setParsedCountHint] = useState<number | null>(null);
  const [savingAgentTemplate, setSavingAgentTemplate] = useState(false);

  /** ?edit=uuid 時の読み込み */
  const [editLoadState, setEditLoadState] = useState<
    'idle' | 'loading' | 'ok' | 'error'
  >(() => (isEditMode ? 'loading' : 'idle'));
  const [editErrorMessage, setEditErrorMessage] = useState<string | null>(null);

  /** 編集時: 公開ドロワー向けの DB メタ（GET で初期化・PATCH 後に一部更新） */
  const [editPublishContext, setEditPublishContext] =
    useState<PublishTestFocusProject | null>(null);

  /** ?clone_from= 元行の lp_group を引き継ぎ、variation_seed は edition+1 */
  const [cloneLoadState, setCloneLoadState] = useState<
    'idle' | 'loading' | 'ok' | 'error'
  >('idle');
  const [cloneErrorMessage, setCloneErrorMessage] = useState<string | null>(
    null,
  );
  const [cloneLpGroupId, setCloneLpGroupId] = useState<string | undefined>(
    undefined,
  );
  const [variationSeedForSave, setVariationSeedForSave] = useState(0);
  /** 保存直後に再フェッチしないよう clone 元 URL のままにしてもループしないようにする */
  const [cloneConsumed, setCloneConsumed] = useState(false);
  const [postSavePublishFocus, setPostSavePublishFocus] =
    useState<PublishTestFocusProject | null>(null);
  const [fvCatchBusy, setFvCatchBusy] = useState(false);

  const effectiveLpGroupId = useMemo(
    () => cloneLpGroupId ?? lpGroupIdForSave,
    [cloneLpGroupId, lpGroupIdForSave],
  );

  const fvCatchProjectId = useMemo(
    () =>
      (isEditMode && editId.trim().length > 0
        ? editId.trim()
        : postSavePublishFocus?.projectId?.trim()) ?? '',
    [isEditMode, editId, postSavePublishFocus?.projectId],
  );

  /** 再生成のたびに増やし、テンプレのバリエーションを変える */
  const suggestRegenNonceRef = useRef<Record<string, number>>({});
  /** Perplexity 由来の検索キーワード（同一エリア・サービス・業種で再利用） */
  const seoKeywordsCacheRef = useRef<{ key: string; keywords: string[] } | null>(
    null,
  );

  const supabase = createSupabaseClient();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/service-personas?active_only=1', {
          credentials: 'include',
        });
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        const rows = Array.isArray(j?.rows) ? j.rows : [];
        setActivePersonas(rows);
      } catch {
        if (!cancelled) setActivePersonas([]);
      } finally {
        if (!cancelled) setActivePersonasLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!editId) {
      setEditLoadState('idle');
      setEditErrorMessage(null);
      setEditPublishContext(null);
      return;
    }
    let cancelled = false;
    setEditLoadState('loading');
    setEditErrorMessage(null);
    (async () => {
      try {
        const res = await fetch(`/api/projects/${editId}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setEditLoadState('error');
          setEditPublishContext(null);
          setEditErrorMessage(
            typeof data?.error === 'string'
              ? data.error
              : 'プロジェクトの読み込みに失敗しました。',
          );
          return;
        }
        const p = data.project as {
          id?: string;
          slug?: string | null;
          publish_status?: string | null;
          wp_page_id?: number | string | null;
          project_type?: string | null;
          raw_answers?: unknown;
          company_info?: unknown;
          company_name?: string | null;
          area?: string | null;
          service?: string | null;
          industry_key?: string | null;
          areas?: string[] | null;
          lp_editor_instruction?: string | null;
        };
        if (p.project_type === 'saas') {
          setEditLoadState('error');
          setEditPublishContext(null);
          setEditErrorMessage(
            'SaaS プロジェクトはこの画面では編集できません。',
          );
          return;
        }
        setProjectType('local');
        setRawAnswers(rawAnswersJsonToRecord(p.raw_answers));
        const areasArr = Array.isArray(p.areas) ? p.areas : [];
        setTargetAreas(
          areasArr.length > 0
            ? areasArr.join(', ')
            : typeof p.area === 'string'
              ? p.area
              : '',
        );
        setTargetServices(typeof p.service === 'string' ? p.service : '');
        setIndustryKey(
          typeof p.industry_key === 'string' ? p.industry_key : '',
        );
        setAgentInstruction(
          typeof p.lp_editor_instruction === 'string'
            ? p.lp_editor_instruction
            : '',
        );

        const info = (p.company_info ?? {}) as Partial<CompanyInfoForm>;
        setCompanyInfo({
          company_name:
            typeof info.company_name === 'string'
              ? info.company_name
              : typeof p.company_name === 'string'
                ? p.company_name
                : '',
          phone: typeof info.phone === 'string' ? info.phone : '',
          email: typeof info.email === 'string' ? info.email : '',
          line_url: typeof info.line_url === 'string' ? info.line_url : '',
          address: typeof info.address === 'string' ? info.address : '',
          business_hours:
            typeof info.business_hours === 'string' ? info.business_hours : '',
          closed_days:
            typeof info.closed_days === 'string' ? info.closed_days : '',
        });
        setOptionalOpenBlock(null);
        const pid = typeof p.id === 'string' ? p.id : editId;
        setEditPublishContext({
          projectId: pid,
          slug: typeof p.slug === 'string' ? p.slug : null,
          publishStatus:
            typeof p.publish_status === 'string' ? p.publish_status : null,
          publicUrl:
            typeof (p as { wp_url?: string }).wp_url === 'string' &&
            (p as { wp_url: string }).wp_url.trim()
              ? (p as { wp_url: string }).wp_url.trim()
              : null,
          savedService:
            typeof p.service === 'string' && p.service.trim()
              ? p.service.trim()
              : null,
        });
        setEditLoadState('ok');
      } catch {
        if (!cancelled) {
          setEditLoadState('error');
          setEditPublishContext(null);
          setEditErrorMessage('プロジェクトの読み込みに失敗しました。');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editId]);

  useEffect(() => {
    if (isEditMode) return;

    if (!isCloneMode || !cloneFromId) {
      setCloneLoadState('idle');
      setCloneErrorMessage(null);
      setCloneLpGroupId(undefined);
      setVariationSeedForSave(0);
      setCloneConsumed(false);
      return;
    }

    if (cloneConsumed) return;

    let cancelled = false;
    setCloneLoadState('loading');
    setCloneErrorMessage(null);
    (async () => {
      try {
        const res = await fetch(`/api/projects/${cloneFromId}`, {
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data?.ok) {
          setCloneLoadState('error');
          setCloneErrorMessage(
            typeof data?.error === 'string'
              ? data.error
              : 'コピー元プロジェクトの読み込みに失敗しました。',
          );
          return;
        }
        const p = data.project as {
          id?: string;
          project_type?: string | null;
          raw_answers?: unknown;
          company_info?: unknown;
          company_name?: string | null;
          area?: string | null;
          service?: string | null;
          industry_key?: string | null;
          areas?: string[] | null;
          variation_seed?: number | null;
          lp_group_id?: string | null;
          lp_editor_instruction?: string | null;
        };
        if (p.project_type === 'saas') {
          setCloneLoadState('error');
          setCloneErrorMessage('SaaS プロジェクトはクローンできません。');
          return;
        }
        setProjectType('local');
        setRawAnswers(rawAnswersJsonToRecord(p.raw_answers));
        const areasArr = Array.isArray(p.areas) ? p.areas : [];
        setTargetAreas(
          areasArr.length > 0
            ? areasArr.join(', ')
            : typeof p.area === 'string'
              ? p.area
              : '',
        );
        setTargetServices(typeof p.service === 'string' ? p.service : '');
        setIndustryKey(
          typeof p.industry_key === 'string' ? p.industry_key : '',
        );
        setAgentInstruction(
          typeof p.lp_editor_instruction === 'string'
            ? p.lp_editor_instruction
            : '',
        );

        const info = (p.company_info ?? {}) as Partial<CompanyInfoForm>;
        setCompanyInfo({
          company_name:
            typeof info.company_name === 'string'
              ? info.company_name
              : typeof p.company_name === 'string'
                ? p.company_name
                : '',
          phone: typeof info.phone === 'string' ? info.phone : '',
          email: typeof info.email === 'string' ? info.email : '',
          line_url: typeof info.line_url === 'string' ? info.line_url : '',
          address: typeof info.address === 'string' ? info.address : '',
          business_hours:
            typeof info.business_hours === 'string' ? info.business_hours : '',
          closed_days:
            typeof info.closed_days === 'string' ? info.closed_days : '',
        });
        setOptionalOpenBlock(null);

        const baseVs =
          typeof p.variation_seed === 'number' &&
          Number.isFinite(p.variation_seed)
            ? Math.trunc(p.variation_seed)
            : 0;
        setVariationSeedForSave(baseVs + 1);
        const gid =
          typeof p.lp_group_id === 'string' &&
          LP_GROUP_UUID_RE.test(p.lp_group_id.trim())
            ? p.lp_group_id.trim()
            : undefined;
        setCloneLpGroupId(gid);
        setCloneLoadState('ok');
      } catch {
        if (!cancelled) {
          setCloneLoadState('error');
          setCloneErrorMessage('コピー元プロジェクトの読み込みに失敗しました。');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isEditMode, isCloneMode, cloneFromId, cloneConsumed]);

  const showToast = useCallback(
    (type: 'success' | 'error', message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 2800);
    },
    [],
  );

  const buildLocalSavePayload = useCallback(
    (opts?: {
      singleTemplateCombo?: boolean;
      /** LP生成の同期 parse 結果。area/service をテンプレと run の parsed に揃える */
      parsedOverride?: ParsedInstruction;
    }) => {
      const rawAnswersPayload = LOCAL_QUESTION_BLOCKS.flatMap((block) =>
        block.questions.map(({ id, label }) => {
          let value = (rawAnswers[id] ?? '').trim();
          const po = opts?.parsedOverride;
          if (po) {
            if (id === 'q23' && !value && po.target?.trim()) {
              value = po.target.trim();
            }
            if (id === 'q33' && !value && po.appeal?.trim()) {
              value = po.appeal.trim();
            }
          }
          return {
            id,
            question: label,
            answer: value,
          };
        }),
      );

      const companyName =
        companyInfo.company_name.trim() ||
        (rawAnswers.q1 ?? '').trim() ||
        '新規プロジェクト（実店舗）';

      let targetAreaInput = targetAreas.trim();
      let serviceInputRaw = targetServices.trim();
      if (opts?.parsedOverride) {
        const a = opts.parsedOverride.area?.trim() ?? '';
        const s = opts.parsedOverride.service?.trim() ?? '';
        if (a) targetAreaInput = a;
        if (s) serviceInputRaw = s;
      }
      if (opts?.singleTemplateCombo) {
        targetAreaInput = targetAreaInput.split(/[,、，]/)[0]?.trim() || '';
        serviceInputRaw = serviceInputRaw.split(/[,、，]/)[0]?.trim() || '';
      }

      const fallbackAreaFromAnswers = (rawAnswers.q11 ?? '').trim();
      const resolvedAreaRaw =
        targetAreaInput || fallbackAreaFromAnswers || '';
      const resolvedArea =
        resolvedAreaRaw.length > 0 ? resolvedAreaRaw : null;

      const areasArray: string[] =
        targetAreaInput.length > 0
          ? targetAreaInput
              .split(/[,、，]/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];

      const serviceInput =
        serviceInputRaw.length > 0 ? serviceInputRaw : null;
      const serviceForPublishPreset = serviceInputRaw;

      const companyInfoPayload = {
        company_name: companyInfo.company_name.trim() || null,
        phone: companyInfo.phone.trim() || null,
        email: companyInfo.email.trim() || null,
        line_url: companyInfo.line_url.trim() || null,
        address: companyInfo.address.trim() || null,
        business_hours: companyInfo.business_hours.trim() || null,
        closed_days: companyInfo.closed_days.trim() || null,
      };

      return {
        rawAnswersPayload,
        companyName,
        resolvedArea,
        areasArray,
        serviceInput,
        serviceForPublishPreset,
        companyInfoPayload,
      };
    },
    [rawAnswers, companyInfo, targetAreas, targetServices],
  );

  const saveLocalTemplateRowParsed = useCallback(
    async (parsed: ParsedInstruction): Promise<string | null> => {
      if (activePersonas.length > 0 && !industryKey.trim()) {
        showToast(
          'error',
          '業種（業種人格）を選択してください。未登録の場合は「業種JSON登録」から先に登録してください。',
        );
        return null;
      }
      const parts = buildLocalSavePayload({
        singleTemplateCombo: true,
        parsedOverride: parsed,
      });
      const payloadForSaveApi = {
        project_type: 'local' as const,
        status: 'draft' as const,
        company_name: parts.companyName,
        resolved_area: parts.resolvedArea,
        areas: parts.areasArray,
        service: parts.serviceInput,
        industry_key: industryKey.trim() || null,
        raw_answers: parts.rawAnswersPayload,
        company_info: parts.companyInfoPayload,
        lp_editor_instruction: agentInstruction.trim() || null,
        ...(effectiveLpGroupId ? { lp_group_id: effectiveLpGroupId } : {}),
        variation_seed: variationSeedForSave,
      };

      const res = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payloadForSaveApi),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        const msg =
          data?.error ||
          data?.details ||
          'テンプレ用の下書き保存に失敗しました。';
        showToast('error', String(msg));
        return null;
      }

      const newId = typeof data.id === 'string' ? data.id : null;
      const newSlug = typeof data.slug === 'string' ? data.slug : null;
      if (newId) {
        setPostSavePublishFocus({
          projectId: newId,
          slug: newSlug,
          publishStatus: 'draft',
          publicUrl: null,
          savedService: parts.serviceForPublishPreset.trim() || null,
          formService: parts.serviceForPublishPreset.trim() || null,
        });
      }
      showToast(
        'success',
        'テンプレ用に下書きを1件保存しました。続けて LP 生成できます。',
      );
      return newId;
    },
    [
      buildLocalSavePayload,
      industryKey,
      effectiveLpGroupId,
      variationSeedForSave,
      showToast,
      agentInstruction,
      activePersonas.length,
    ],
  );

  const runParseInstruction = useCallback(
    async (instruction: string): Promise<ParsedInstruction | null> => {
      const trimmed = instruction.trim();
      if (!trimmed) return null;
      try {
        const res = await fetch('/api/admin/agent/parse', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: trimmed }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 401) {
          showToast(
            'error',
            typeof j?.error === 'string'
              ? j.error
              : '認可に失敗しました。/admin/login でログインしてください。',
          );
          return null;
        }
        if (!res.ok || !j?.parsed || typeof j.parsed !== 'object') {
          showToast(
            'error',
            typeof j?.error === 'string'
              ? j.error
              : '指示の解析に失敗しました。',
          );
          return null;
        }
        return j.parsed as ParsedInstruction;
      } catch (e) {
        console.error(e);
        showToast('error', '指示の解析に失敗しました。');
        return null;
      }
    },
    [showToast],
  );

  const patchLocalTemplateRow = useCallback(
    async (projectId: string, parsed: ParsedInstruction): Promise<boolean> => {
      if (activePersonas.length > 0 && !industryKey.trim()) {
        showToast(
          'error',
          '業種（業種人格）を選択してください。',
        );
        return false;
      }
      const parts = buildLocalSavePayload({
        singleTemplateCombo: true,
        parsedOverride: parsed,
      });
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: parts.companyName,
            resolved_area: parts.resolvedArea,
            areas: parts.areasArray,
            service: parts.serviceInput,
            industry_key: industryKey.trim() || null,
            raw_answers: parts.rawAnswersPayload,
            company_info: parts.companyInfoPayload,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          showToast(
            'error',
            String(data?.error ?? 'テンプレ行の更新に失敗しました。'),
          );
          return false;
        }
        return true;
      } catch (err) {
        console.error(err);
        showToast('error', 'テンプレ行の更新に失敗しました。');
        return false;
      }
    },
    [buildLocalSavePayload, industryKey, showToast, activePersonas.length],
  );

  const ensureTemplateForAgentRun = useCallback(
    async (instruction: string): Promise<string | null> => {
      if (projectType !== 'local') return null;
      const parsed = await runParseInstruction(instruction);
      if (!parsed) return null;

      setSavingAgentTemplate(true);
      try {
        if (isEditMode && editId.trim()) {
          const id = editId.trim();
          const ok = await patchLocalTemplateRow(id, parsed);
          return ok ? id : null;
        }
        const existing = postSavePublishFocus?.projectId?.trim();
        if (existing) {
          const ok = await patchLocalTemplateRow(existing, parsed);
          return ok ? existing : null;
        }
        return saveLocalTemplateRowParsed(parsed);
      } finally {
        setSavingAgentTemplate(false);
      }
    },
    [
      projectType,
      runParseInstruction,
      isEditMode,
      editId,
      postSavePublishFocus?.projectId,
      patchLocalTemplateRow,
      saveLocalTemplateRowParsed,
    ],
  );

  useEffect(() => {
    const t = agentInstruction.trim();
    if (!t) {
      setParsedCountHint(null);
      return;
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/admin/agent/parse', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ instruction: t }),
        });
        const j = await res.json().catch(() => ({}));
        if (!res.ok || !j?.parsed || typeof j.parsed !== 'object') return;
        const p = j.parsed as {
          area?: string;
          service?: string;
          count?: number;
          target?: string;
          appeal?: string;
        };
        const count =
          typeof p.count === 'number' && Number.isFinite(p.count)
            ? p.count
            : null;
        if (count != null) setParsedCountHint(count);

        if (typeof p.area === 'string' && p.area.trim()) {
          setTargetAreas((prev) => (prev.trim() ? prev : p.area!.trim()));
        }
        if (typeof p.service === 'string' && p.service.trim()) {
          setTargetServices((prev) => (prev.trim() ? prev : p.service!.trim()));
        }
        /* 指示の target / appeal → q23（顧客の不安）・q33（安さの理由）へ空欄時のみ提案 */
        const targetStr =
          typeof p.target === 'string' && p.target.trim() ? p.target.trim() : '';
        const appealStr =
          typeof p.appeal === 'string' && p.appeal.trim() ? p.appeal.trim() : '';
        if (targetStr || appealStr) {
          setRawAnswers((prev) => {
            let next = prev;
            if (!(prev.q23 ?? '').trim() && targetStr) {
              next = { ...next, q23: targetStr };
            }
            if (!(prev.q33 ?? '').trim() && appealStr) {
              next = { ...next, q33: appealStr };
            }
            return next;
          });
        }
      } catch {
        /* オプション補完のため握りつぶし */
      }
    }, 650);
    return () => window.clearTimeout(timer);
  }, [agentInstruction]);

  const setAnswer = useCallback((id: string, value: string) => {
    setRawAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  /** ターゲットエリア・サービス欄、なければ q11 から先頭エリアを推定。先頭の対応サービスが自動生成の業種コンテキストになる。 */
  const getSuggestAreaService = useCallback(() => {
    const areaFirst =
      targetAreas.trim().split(/[,、，]/)[0]?.trim() ||
      (rawAnswers.q11 ?? '').trim().split(/[,、，]/)[0]?.trim() ||
      '';
    const serviceFirst = targetServices.trim().split(/[,、，]/)[0]?.trim() || '';
    return {
      area: areaFirst || '地域',
      service: serviceFirst || 'サービス',
    };
  }, [targetAreas, targetServices, rawAnswers]);

  const handleSuggestAnswer = useCallback(
    async (questionId: string, questionLabel: string, mode: 'fill' | 'regenerate') => {
      const current = (rawAnswers[questionId] ?? '').trim();
      if (mode === 'fill' && current) {
        const ok = window.confirm(
          '既に入力があります。自動生成の文で上書きしますか？',
        );
        if (!ok) return;
      }

      if (mode === 'regenerate') {
        suggestRegenNonceRef.current[questionId] =
          (suggestRegenNonceRef.current[questionId] ?? 0) + 1;
      }

      const { area, service } = getSuggestAreaService();
      const cacheKey = `${industryKey.trim()}|${service}|${area}`;
      const cached =
        seoKeywordsCacheRef.current?.key === cacheKey
          ? seoKeywordsCacheRef.current.keywords
          : null;

      const projectIdForHero =
        isEditMode && editId.trim().length > 0
          ? editId.trim()
          : (postSavePublishFocus?.projectId?.trim() ?? '');

      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            questionId,
            questionLabel,
            area,
            service,
            otherAnswers: rawAnswers,
            regenerate: mode === 'regenerate',
            variationNonce:
              mode === 'regenerate'
                ? suggestRegenNonceRef.current[questionId] ?? 0
                : 0,
            industryKey: industryKey.trim() || null,
            ...(projectIdForHero ? { projectId: projectIdForHero } : {}),
            ...(cached && cached.length > 0 ? { seoKeywords: cached } : {}),
          }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
          answer?: string;
          seoKeywords?: string[];
        };
        if (!res.ok) {
          throw new Error(data.error || '自動生成に失敗しました');
        }
        const text = typeof data.answer === 'string' ? data.answer : '';
        if (!text) {
          throw new Error('回答が空');
        }
        setAnswer(questionId, text);
        if (
          Array.isArray(data.seoKeywords) &&
          data.seoKeywords.length > 0
        ) {
          seoKeywordsCacheRef.current = {
            key: cacheKey,
            keywords: data.seoKeywords,
          };
        }
        showToast(
          'success',
          mode === 'regenerate' ? '文面を再生成しました' : '文面を挿入しました',
        );
      } catch (e) {
        console.error(e);
        showToast('error', '自動生成に失敗しました');
      }
    },
    [
      rawAnswers,
      getSuggestAreaService,
      setAnswer,
      showToast,
      industryKey,
      isEditMode,
      editId,
      postSavePublishFocus?.projectId,
    ],
  );

  const handleGenerateFvCatch = useCallback(
    async (force: boolean) => {
      if (!fvCatchProjectId) {
        showToast('error', '先にプロジェクトを保存し、project id を取得してください。');
        return;
      }
      setFvCatchBusy(true);
      try {
        const res = await fetch('/api/generate-fv-catch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ projectId: fvCatchProjectId, force }),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          skipped?: boolean;
          error?: string;
          message?: string;
        };
        if (!res.ok) {
          throw new Error(data.error || 'FVキャッチの生成に失敗しました');
        }
        if (data.skipped && !force) {
          showToast(
            'success',
            data.message ??
              '既にキャッチがあります。「FVキャッチ再生成」で上書きできます。',
          );
        } else {
          showToast(
            'success',
            force ? 'FVキャッチを再生成して保存しました' : 'FVキャッチを生成して保存しました',
          );
        }
      } catch (e) {
        console.error(e);
        showToast('error', 'FVキャッチの生成に失敗しました');
      } finally {
        setFvCatchBusy(false);
      }
    },
    [fvCatchProjectId, showToast],
  );

  const handleCompanyInfoChange = (
    field: keyof CompanyInfoForm,
    value: string,
  ) => {
    setCompanyInfo((prev) => ({ ...prev, [field]: value }));
    // 軽いバリデーション（未入力でもエラーにはしない）
    if (field === 'phone') {
      const digits = value.replace(/[^0-9+]/g, '');
      setCompanyInfoError((prev) => ({
        ...prev,
        phone:
          value && digits.length < 8
            ? '電話番号の形式を確認してください'
            : undefined,
      }));
    }
    if (field === 'email') {
      const ok =
        !value ||
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
      setCompanyInfoError((prev) => ({
        ...prev,
        email: ok ? undefined : 'メールアドレスの形式を確認してください',
      }));
    }
  };

  const copyLatestCompanyInfo = async () => {
    if (!supabase) {
      showToast('error', 'Supabase クライアントの初期化に失敗しました。');
      return;
    }
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('company_info')
        .not('company_info', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !data?.company_info) {
        showToast('error', 'コピーできる会社情報が見つかりませんでした。');
        return;
      }
      const info = data.company_info as Partial<CompanyInfoForm>;
      setCompanyInfo((prev) => ({
        ...prev,
        company_name: info.company_name ?? prev.company_name,
        phone: info.phone ?? prev.phone,
        email: info.email ?? prev.email,
        line_url: info.line_url ?? prev.line_url,
        address: info.address ?? prev.address,
        business_hours: info.business_hours ?? prev.business_hours,
        closed_days: info.closed_days ?? prev.closed_days,
      }));
      showToast('success', '過去の会社情報を読み込みました。');
    } catch (err) {
      console.error(err);
      showToast('error', '会社情報のコピーに失敗しました。');
    }
  };

  const handleSubmitLocal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activePersonas.length > 0 && !industryKey.trim()) {
      showToast(
        'error',
        '業種（業種人格）を選択してください。未登録の場合は「業種JSON登録」から先に登録してください。',
      );
      return;
    }
    const built = buildLocalSavePayload();
    const industryKeyNorm = industryKey.trim() || null;
    const svcNorm = normalizeServiceName(
      built.serviceForPublishPreset?.trim() ?? '',
    );
    if (resolveLpIndustryTone(industryKeyNorm, svcNorm) !== 'real_estate') {
      for (const qid of LOCAL_REQUIRED_FIELDWORK_Q_IDS) {
        const v = (rawAnswers[qid] ?? '').trim();
        if (isEffectivelyEmptyRawAnswer(v)) {
          showToast('error', REQUIRED_LOCAL_Q_ERROR_MESSAGES[qid]);
          return;
        }
      }
    }

    const {
      rawAnswersPayload,
      companyName,
      resolvedArea,
      areasArray,
      serviceInput,
      serviceForPublishPreset,
      companyInfoPayload,
    } = built;

    const status = 'draft';

    const payloadForSaveApi = {
      project_type: 'local' as const,
      status,
      company_name: companyName,
      resolved_area: resolvedArea,
      areas: areasArray,
      service: serviceInput,
      industry_key: industryKey.trim() || null,
      raw_answers: rawAnswersPayload,
      company_info: companyInfoPayload,
      lp_editor_instruction: agentInstruction.trim() || null,
      ...(effectiveLpGroupId ? { lp_group_id: effectiveLpGroupId } : {}),
      variation_seed: variationSeedForSave,
    };

    setIsSubmitting(true);
    try {
      if (isEditMode && editId) {
        const res = await fetch(`/api/projects/${editId}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            company_name: companyName,
            resolved_area: resolvedArea,
            areas: areasArray,
            service: serviceInput,
            industry_key: industryKey.trim() || null,
            raw_answers: rawAnswersPayload,
            company_info: companyInfoPayload,
            lp_editor_instruction: agentInstruction.trim() || null,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(
            String(data?.error || '更新に失敗しました。'),
          );
        }
        showToast('success', '保存しました。');
        const slugBack = typeof data.slug === 'string' ? data.slug : null;
        setEditPublishContext((prev) =>
          prev
            ? {
                ...prev,
                slug: slugBack ?? prev.slug,
                savedService:
                  serviceForPublishPreset.trim().length > 0
                    ? serviceForPublishPreset.trim()
                    : prev.savedService,
              }
            : prev,
        );
        return;
      }

      const res = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payloadForSaveApi),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.success) {
        const msg =
          data?.error ||
          data?.details ||
          'API経由の保存に失敗しました。';
        throw new Error(String(msg));
      }

      const splitCount =
        typeof data.splitCount === 'number' ? data.splitCount : 1;
      showToast(
        'success',
        splitCount > 1
          ? `${splitCount} 件のプロジェクトを保存しました（先頭が親の id / slug です。一覧から確認できます）。`
          : 'プロジェクトを保存しました。一覧からLPを確認できます。',
      );
      const newId = typeof data.id === 'string' ? data.id : null;
      const newSlug = typeof data.slug === 'string' ? data.slug : null;
      if (newId) {
        setPostSavePublishFocus({
          projectId: newId,
          slug: newSlug,
          publishStatus: 'draft',
          publicUrl: null,
          savedService: serviceForPublishPreset.trim() || null,
          formService: serviceForPublishPreset.trim() || null,
        });
      }
      setVariationSeedForSave((s) => s + 1);
      if (isCloneMode) setCloneConsumed(true);
      setRawAnswers(getInitialRawAnswers());
      setTargetAreas('');
      setTargetServices('');
      setIndustryKey('');
    } catch (err) {
      console.error(err);
      const anyErr = err as any;
      const parts: string[] = [];
      if (anyErr?.message) parts.push(String(anyErr.message));
      if (anyErr?.details) parts.push(String(anyErr.details));
      if (anyErr?.hint) parts.push(String(anyErr.hint));
      const detail =
        parts.length > 0
          ? parts.join(' / ')
          : '原因不明のエラーです。コンソールログを確認してください。';
      showToast('error', `保存に失敗しました: ${detail}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitSaas = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      showToast('error', 'Supabase クライアントの初期化に失敗しました。');
      return;
    }

    const rawAnswersPayload = [
      {
        id: 'service_name',
        question: 'サービス名',
        answer: saasName,
      },
      {
        id: 'target',
        question: 'ターゲット層',
        answer: saasTarget,
      },
      {
        id: 'problem',
        question: '解決する悩み',
        answer: saasProblem,
      },
      {
        id: 'benefit',
        question: '導入メリット',
        answer: saasBenefit,
      },
      {
        id: 'price',
        question: '料金プラン',
        answer: saasPrice,
      },
    ];

    const companyName =
      companyInfo.company_name.trim() ||
      saasName.trim() ||
      '新規SaaS';
    const slug = `temp-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 8)}`;
    const status = 'draft';

    setIsSubmitting(true);
    try {
      const { error: projectError } = await supabase
        .from('projects')
        .insert({
          company_name: companyName,
          project_type: 'saas',
          status,
          slug,
          raw_answers: rawAnswersPayload,
          company_info: {
            company_name: companyInfo.company_name || null,
            phone: companyInfo.phone || null,
            email: companyInfo.email || null,
            line_url: companyInfo.line_url || null,
            address: companyInfo.address || null,
            business_hours: companyInfo.business_hours || null,
            closed_days: companyInfo.closed_days || null,
          },
          areas: [],
        });
      if (projectError) throw projectError;
      showToast('success', 'プロジェクトを保存しました。一覧から確認できます。');
      setSaasName('');
      setSaasTarget('');
      setSaasProblem('');
      setSaasBenefit('');
      setSaasPrice('');
    } catch (err) {
      console.error(err);
      showToast('error', '保存に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-700 bg-slate-800 px-4 py-3 text-sm text-slate-50 outline-none placeholder:text-slate-500 focus:border-sky-300 focus:bg-slate-900';
  const labelClass = 'text-sm font-semibold text-slate-50 md:text-base';

  const handleExportLocalJson = () => {
    // LOCAL_QUESTION_BLOCKS + rawAnswers から現在の回答を配列化
    const rawAnswersPayload = LOCAL_QUESTION_BLOCKS.flatMap((block) =>
      block.questions.map(({ id, label }) => ({
        id,
        question: label,
        answer: (rawAnswers[id] ?? '').trim(),
      })),
    );

    const companyNameDraft =
      companyInfo.company_name.trim() ||
      (rawAnswers.q1 ?? '').trim() ||
      '新規プロジェクト（実店舗）';

    const fallbackAreaFromAnswers = (rawAnswers.q11 ?? '').trim();
    const targetAreaInput = targetAreas.trim();
    const resolvedAreaRaw =
      targetAreaInput || fallbackAreaFromAnswers || '';

    const areasArray: string[] =
      targetAreaInput.length > 0
        ? targetAreaInput
            .split(/[,、，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    const serviceInputRaw = targetServices.trim();

    const payload = {
      project_type: 'local' as const,
      status: 'draft' as const,
      company_name: companyNameDraft,
      target_areas_input: targetAreas,
      target_services_input: targetServices,
      resolved_area: resolvedAreaRaw || null,
      raw_answers: rawAnswersPayload,
      company_info: {
        company_name: companyInfo.company_name.trim() || null,
        phone: companyInfo.phone.trim() || null,
        email: companyInfo.email.trim() || null,
        line_url: companyInfo.line_url.trim() || null,
        address: companyInfo.address.trim() || null,
        business_hours: companyInfo.business_hours.trim() || null,
        closed_days: companyInfo.closed_days.trim() || null,
      },
      areas: areasArray,
      service: serviceInputRaw || null,
      created_at: new Date().toISOString(),
    };

    const json = JSON.stringify(payload, null, 2);
    setExportJson(json);

    // 自動ダウンロードも行う（ファイル名に日付を含める）
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      a.href = url;
      a.download = `project_master_data_${ts}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('success', '現在の入力内容をJSONとしてエクスポートしました。');
    } catch (err) {
      console.error(err);
      showToast('error', 'JSONファイルのダウンロードに失敗しました。');
    }
  };

  const handleCopyExportJson = async () => {
    if (!exportJson) return;
    try {
      await navigator.clipboard.writeText(exportJson);
      showToast('success', 'JSONをクリップボードにコピーしました。');
    } catch (err) {
      console.error(err);
      showToast('error', 'クリップボードへのコピーに失敗しました。');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {toast && (
        <div className="fixed top-4 right-4 z-[110]">
          <div
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              toast.type === 'success'
                ? 'border-emerald-400/60 bg-emerald-950/80 text-emerald-100'
                : 'border-amber-400/60 bg-amber-950/80 text-amber-100'
            }`}
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <p>{toast.message}</p>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-4xl px-4 py-10 md:py-14">
        <main className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg shadow-slate-950/60 md:p-8">
          <header className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-200">
                  <ArrowRight className="h-4 w-4" />
                </span>
                <span className="bg-gradient-to-r from-slate-100 via-sky-300 to-slate-400 bg-clip-text text-transparent">
                  {isEditMode
                    ? 'raw_answers を編集'
                    : isCloneMode
                      ? '新規版を作成（クローン）'
                      : '新規プロジェクト登録'}
                </span>
              </h1>
              <p className="mt-2 text-xs text-slate-400 md:text-sm">
                {isEditMode
                  ? '既存プロジェクトの50問・会社情報を更新します（JSONB を上書き）。'
                  : isCloneMode
                    ? '同一の50問・会社情報から新しい projects 行（新 slug・新 variation_seed）を作成します。保存で下書きの行が増えます。'
                    : '実店舗は50問を5ブロックで入力。全て raw_answers（JSONB）に保存されます。'}
              </p>
              {isEditMode && editId && (
                <p className="mt-1 font-mono text-[11px] text-slate-500">
                  project_id: {editId}
                </p>
              )}
              {fvCatchProjectId ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={fvCatchBusy}
                    onClick={() => void handleGenerateFvCatch(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/50 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                  >
                    {fvCatchBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    FVキャッチ生成
                  </button>
                  <button
                    type="button"
                    disabled={fvCatchBusy}
                    onClick={() => void handleGenerateFvCatch(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    FVキャッチ再生成
                  </button>
                  <span className="text-[10px] text-slate-500">
                    保存済み行のみ。量産時は保存後に GEMINI で自動生成も実行されます。
                  </span>
                </div>
              ) : null}
            </div>
            <div className="flex flex-col items-end gap-2">
              {isEditMode && (
                <Link
                  href="/admin/projects"
                  className="text-xs text-sky-400 hover:text-sky-300 hover:underline"
                >
                  ← 一覧に戻る
                </Link>
              )}
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-[11px] text-slate-300 md:text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                <span className="font-mono">Supabase: OK</span>
              </div>
            </div>
          </header>

          {isEditMode && editLoadState === 'loading' && (
            <div className="mb-8 flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">プロジェクトを読み込み中です…</p>
            </div>
          )}
          {isEditMode && editLoadState === 'error' && (
            <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 text-sm text-amber-100">
              <p className="font-medium">
                {editErrorMessage ?? 'エラーが発生しました。'}
              </p>
              <Link
                href="/admin/projects"
                className="mt-4 inline-block text-sky-300 underline hover:text-sky-200"
              >
                一覧に戻る
              </Link>
            </div>
          )}

          {isCloneMode && cloneLoadState === 'loading' && (
            <div className="mb-8 flex min-h-[40vh] flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p className="text-sm">コピー元を読み込み中です…</p>
            </div>
          )}
          {isCloneMode && cloneLoadState === 'error' && (
            <div className="mb-8 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-6 text-sm text-amber-100">
              <p className="font-medium">
                {cloneErrorMessage ?? 'エラーが発生しました。'}
              </p>
              <Link
                href="/admin/projects"
                className="mt-4 inline-block text-sky-300 underline hover:text-sky-200"
              >
                一覧に戻る
              </Link>
            </div>
          )}

          {(!isEditMode || editLoadState === 'ok') &&
            (!isCloneMode || cloneLoadState === 'ok') && (
            <>
          {projectType === 'local' && (
            <AgentInstructionInput
              instruction={agentInstruction}
              onInstructionChange={setAgentInstruction}
              ensureTemplateForAgentRun={ensureTemplateForAgentRun}
              parsedCountHint={parsedCountHint}
              disabled={
                isSubmitting ||
                savingAgentTemplate ||
                (isEditMode && editLoadState !== 'ok') ||
                (isCloneMode && cloneLoadState !== 'ok')
              }
              showToast={showToast}
            />
          )}
          {projectType === 'local' && exportJson && (
            <section className="mb-6 space-y-2 rounded-2xl border border-amber-500/40 bg-amber-950/30 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-amber-100 md:text-sm">
                  下書きJSON（ローカル退避用）
                </p>
                <button
                  type="button"
                  onClick={handleCopyExportJson}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-400/60 px-3 py-1 text-xs text-amber-50 hover:bg-amber-500/20"
                >
                  コピー
                </button>
              </div>
              <p className="text-[11px] text-amber-200 md:text-xs">
                万が一Supabaseへの保存に失敗しても、下記JSONをファイルとして手元に残しておけば、後からNodeスクリプトでDBに復元できます。
              </p>
              <textarea
                readOnly
                value={exportJson}
                rows={10}
                className="w-full rounded-lg border border-amber-500/40 bg-slate-950/80 p-2 text-[11px] font-mono text-amber-50"
              />
            </section>
          )}

          {!isEditMode && (
          <div className="mb-8 inline-flex rounded-full border border-slate-700 bg-slate-950/80 p-1 text-xs md:text-sm">
            <button
              type="button"
              onClick={() => setProjectType('local')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                projectType === 'local'
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900/60'
              }`}
            >
              <Store className="h-4 w-4" />
              実店舗（50問）
            </button>
            <button
              type="button"
              onClick={() => setProjectType('saas')}
              className={`ml-1 flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${
                projectType === 'saas'
                  ? 'bg-slate-100 text-slate-900 shadow-sm'
                  : 'text-slate-300 hover:bg-slate-900/60'
              }`}
            >
              <Cloud className="h-4 w-4" />
              SaaS
            </button>
          </div>
          )}

          {projectType === 'local' ? (
            <>
            <form onSubmit={handleSubmitLocal} className="space-y-4">
              <section className="rounded-2xl border border-amber-500/35 bg-amber-950/15 p-5">
                <h2 className="mb-2 text-sm font-semibold text-amber-100">
                  必須項目（CVに直結・15問）
                </h2>
                <p className="mb-4 text-xs text-slate-400">
                  現場系ローカルLPの公開前チェックに使います。業種キーが不動産トーン（
                  real_estate）のときはこの必須チェックをスキップします（別セットは今後）。
                </p>
                <div className="space-y-6">
                  {LOCAL_QUESTION_BLOCKS.map((block, blockIndex) => {
                    const reqQs = block.questions.filter((q) =>
                      isLocalFieldworkRequiredQ(q.id),
                    );
                    if (reqQs.length === 0) return null;
                    return (
                      <div
                        key={`req-b-${blockIndex}`}
                        className="rounded-xl border border-slate-800 bg-slate-900/55 p-4"
                      >
                        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-sky-200/90">
                          {block.title}
                        </h3>
                        <div className="space-y-4">
                          {reqQs.map((q) => {
                            const empty = isEffectivelyEmptyRawAnswer(
                              rawAnswers[q.id] ?? '',
                            );
                            return (
                              <div key={q.id} className="space-y-2">
                                <label
                                  className={`${labelClass} flex flex-wrap items-center gap-2`}
                                >
                                  <span className="rounded bg-amber-500/25 px-1.5 py-0.5 text-[10px] font-bold text-amber-100">
                                    必須
                                  </span>
                                  {q.label}
                                </label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                  <textarea
                                    value={rawAnswers[q.id] ?? ''}
                                    onChange={(e) => setAnswer(q.id, e.target.value)}
                                    placeholder={
                                      q.placeholder ?? `「${q.label.slice(0, 24)}…」について`
                                    }
                                    rows={3}
                                    className={`${inputClass} min-h-[5rem] flex-1 ${
                                      empty
                                        ? 'ring-1 ring-amber-500/40'
                                        : ''
                                    }`}
                                  />
                                  <div className="flex shrink-0 flex-col gap-1.5 sm:w-[8.5rem]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSuggestAnswer(q.id, q.label, 'fill')
                                      }
                                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-900/50"
                                      title="空欄なら挿入。入力済みの場合は確認後に上書き"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      自動生成
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSuggestAnswer(
                                          q.id,
                                          q.label,
                                          'regenerate',
                                        )
                                      }
                                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                                      title="別の言い回しで上書き"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      再生成
                                    </button>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <details className="rounded-2xl border border-slate-800 bg-slate-900/40">
                <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold text-slate-100 outline-none hover:bg-slate-800/50 [&::-webkit-details-marker]:hidden">
                  <span>追加で強くしたい項目（任意）・エリア分割</span>
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                </summary>
                <div className="space-y-6 border-t border-slate-800 p-3 sm:p-4">
                  <div className="rounded-xl border border-sky-500/25 bg-sky-950/20 p-4">
                    <h3 className="mb-3 text-xs font-semibold text-sky-200">
                      LPの表示・分割用（任意）
                    </h3>
                    <p className="mb-4 text-xs text-slate-400">
                      {isEditMode
                        ? 'LP のエリア・業種表示に使われます。保存で DB の area / service / areas も更新されます。'
                        : '複数指定すると組み合わせごとに別プロジェクトが生成される場合があります。'}
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      {SPLIT_QUESTIONS.map(({ id, label, placeholder }) => (
                        <div key={id} className="space-y-2">
                          <label className={labelClass}>{label}</label>
                          <input
                            type="text"
                            value={
                              id === 'target_areas' ? targetAreas : targetServices
                            }
                            onChange={(e) =>
                              id === 'target_areas'
                                ? setTargetAreas(e.target.value)
                                : setTargetServices(e.target.value)
                            }
                            placeholder={placeholder}
                            className={inputClass}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 space-y-2">
                      <label className={labelClass}>
                        業種（登録済み人格から選択）
                      </label>
                      {!activePersonasLoaded ? (
                        <p className="text-xs text-slate-500">
                          業種一覧を読み込み中…
                        </p>
                      ) : activePersonas.length === 0 ? (
                        <p className="rounded-xl border border-amber-700/50 bg-amber-950/30 px-4 py-3 text-xs text-amber-100">
                          業種が未登録です。先に{' '}
                          <Link
                            href="/admin/service-personas/new"
                            className="text-sky-300 underline hover:text-sky-200"
                          >
                            業種JSONを登録
                          </Link>{' '}
                          してください。
                        </p>
                      ) : (
                        <select
                          value={industryKey}
                          onChange={(e) => setIndustryKey(e.target.value)}
                          required
                          className={inputClass}
                        >
                          <option value="">選択してください</option>
                          {activePersonas.map((p) => (
                            <option key={p.service_key} value={p.service_key}>
                              {p.service_name}（{p.service_key}）
                            </option>
                          ))}
                        </select>
                      )}
                      <p className="text-xs text-slate-500">
                        実店舗LPでは登録済み・有効な業種のみ選択できます（DB の industry_key =
                        service_key）。関連LPの候補分けにも使われます。不動産トーン（real_estate
                        系キー）では下記必須15チェックが保存時・公開時にスキップされます。
                      </p>
                    </div>
                  </div>

                  {LOCAL_QUESTION_BLOCKS.map((block, blockIndex) => {
                    const optQs = block.questions.filter(
                      (q) => !isLocalFieldworkRequiredQ(q.id),
                    );
                    if (optQs.length === 0) return null;
                    return (
                      <div
                        key={`opt-${blockIndex}`}
                        className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60"
                      >
                        <button
                          type="button"
                          onClick={() =>
                            setOptionalOpenBlock(
                              optionalOpenBlock === blockIndex
                                ? null
                                : blockIndex,
                            )
                          }
                          className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-800/60"
                        >
                          <span className="font-semibold text-slate-100">
                            ブロック{blockIndex + 1}（任意）：{block.title}
                          </span>
                          {optionalOpenBlock === blockIndex ? (
                            <ChevronUp className="h-5 w-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-slate-400" />
                          )}
                        </button>
                        {optionalOpenBlock === blockIndex && (
                          <div className="space-y-4 border-t border-slate-800 p-5">
                            {optQs.map((q) => (
                              <div key={q.id} className="space-y-2">
                                <label className={labelClass}>{q.label}</label>
                                <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                  <textarea
                                    value={rawAnswers[q.id] ?? ''}
                                    onChange={(e) =>
                                      setAnswer(q.id, e.target.value)
                                    }
                                    placeholder={
                                      q.placeholder ??
                                      `「${q.label.slice(0, 24)}…」について`
                                    }
                                    rows={3}
                                    className={`${inputClass} min-h-[5rem] flex-1`}
                                  />
                                  <div className="flex shrink-0 flex-col gap-1.5 sm:w-[8.5rem]">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSuggestAnswer(q.id, q.label, 'fill')
                                      }
                                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-900/50"
                                      title="空欄なら挿入。入力済みの場合は確認後に上書き"
                                    >
                                      <Sparkles className="h-3.5 w-3.5" />
                                      自動生成
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleSuggestAnswer(
                                          q.id,
                                          q.label,
                                          'regenerate',
                                        )
                                      }
                                      className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-800/80 px-3 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
                                      title="別の言い回しで上書き"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      再生成
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </details>
              <div className="flex flex-col items-end gap-2 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleExportLocalJson}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-500 bg-slate-900 px-4 py-2 text-xs font-semibold text-slate-100 shadow-sm transition hover:bg-slate-800"
                >
                  下書きJSONをエクスポート
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    (isEditMode && editLoadState !== 'ok') ||
                    (isCloneMode && cloneLoadState !== 'ok')
                  }
                  className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-sky-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      {isEditMode ? '変更を保存' : 'raw_answers に保存'}
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
            </>
          ) : (
            <form onSubmit={handleSubmitSaas} className="space-y-6 md:space-y-7">
              <div className="space-y-2.5">
                <p className={labelClass}>サービス名</p>
                <input
                  type="text"
                  value={saasName}
                  onChange={(e) => setSaasName(e.target.value)}
                  placeholder="例：工事現場の進捗を一元管理する『Genba Cloud』"
                  className={inputClass}
                />
              </div>
              <div className="space-y-2.5">
                <p className={labelClass}>ターゲット層</p>
                <textarea
                  value={saasTarget}
                  onChange={(e) => setSaasTarget(e.target.value)}
                  placeholder="例：従業員30〜100名規模の工務店の現場監督"
                  rows={3}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2.5">
                <p className={labelClass}>解決する悩み</p>
                <textarea
                  value={saasProblem}
                  onChange={(e) => setSaasProblem(e.target.value)}
                  placeholder="例：現場ごとにエクセルが乱立している"
                  rows={4}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2.5">
                <p className={labelClass}>導入メリット</p>
                <textarea
                  value={saasBenefit}
                  onChange={(e) => setSaasBenefit(e.target.value)}
                  placeholder="例：集計が自動化され残業が減る"
                  rows={4}
                  className={inputClass}
                />
              </div>
              <div className="space-y-2.5">
                <p className={labelClass}>料金プラン</p>
                <input
                  type="text"
                  value={saasPrice}
                  onChange={(e) => setSaasPrice(e.target.value)}
                  placeholder="例：1現場あたり月額9,800円〜"
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end pt-4">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-500 px-5 py-2.5 text-sm font-semibold text-sky-950 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-200"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      保存中...
                    </>
                  ) : (
                    <>
                      保存
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* 会社基本情報（共通設定） */}
          <section className="mt-10 space-y-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-50 md:text-base">
                  会社基本情報（共通設定）
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  電話番号や住所など、信頼性に関わる情報はこちらにまとめて入力します。
                </p>
              </div>
              <button
                type="button"
                onClick={copyLatestCompanyInfo}
                className="inline-flex items-center gap-1 rounded-full border border-slate-600 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800"
              >
                過去の会社情報を読み込む
              </button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className={labelClass}>会社名</label>
                <input
                  type="text"
                  value={companyInfo.company_name}
                  onChange={(e) =>
                    handleCompanyInfoChange('company_name', e.target.value)
                  }
                  placeholder="例：株式会社◯◯リフォーム"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>電話番号</label>
                <input
                  type="tel"
                  value={companyInfo.phone}
                  onChange={(e) =>
                    handleCompanyInfoChange('phone', e.target.value)
                  }
                  placeholder="例：03-1234-5678"
                  className={inputClass}
                />
                {companyInfoError.phone && (
                  <p className="text-xs text-amber-300">
                    {companyInfoError.phone}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>メールアドレス</label>
                <input
                  type="email"
                  value={companyInfo.email}
                  onChange={(e) =>
                    handleCompanyInfoChange('email', e.target.value)
                  }
                  placeholder="例：info@example.com"
                  className={inputClass}
                />
                {companyInfoError.email && (
                  <p className="text-xs text-amber-300">
                    {companyInfoError.email}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>LINE URL</label>
                <input
                  type="url"
                  value={companyInfo.line_url}
                  onChange={(e) =>
                    handleCompanyInfoChange('line_url', e.target.value)
                  }
                  placeholder="例：https://line.me/R/ti/p/..."
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <label className={labelClass}>住所</label>
                <input
                  type="text"
                  value={companyInfo.address}
                  onChange={(e) =>
                    handleCompanyInfoChange('address', e.target.value)
                  }
                  placeholder="例：東京都〇〇区〇〇1-2-3"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>営業時間</label>
                <input
                  type="text"
                  value={companyInfo.business_hours}
                  onChange={(e) =>
                    handleCompanyInfoChange('business_hours', e.target.value)
                  }
                  placeholder="例：9:00〜18:00"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>定休日</label>
                <input
                  type="text"
                  value={companyInfo.closed_days}
                  onChange={(e) =>
                    handleCompanyInfoChange('closed_days', e.target.value)
                  }
                  placeholder="例：日曜・祝日"
                  className={inputClass}
                />
              </div>
            </div>
          </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      }
    >
      <NewProjectPageContent />
    </Suspense>
  );
}
