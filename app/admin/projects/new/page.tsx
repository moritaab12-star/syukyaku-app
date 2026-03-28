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
} from './questions';
import { PublishTestPanel } from './PublishTestPanel';
import type { PublishTestFocusProject } from './publish-test-types';

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
  const [openBlock, setOpenBlock] = useState<number | null>(0);
  const [targetAreas, setTargetAreas] = useState('');
  const [targetServices, setTargetServices] = useState('');
  /** 関連LP「あわせて読みたい」用。任意。DB projects.industry_key */
  const [industryKey, setIndustryKey] = useState('');

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

  /** raw_answers 保存成功後に本番公開テスト UI を出す */
  const [publishPanelVisible, setPublishPanelVisible] = useState(false);
  const [publishPresetService, setPublishPresetService] = useState('');

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

  const effectiveLpGroupId = useMemo(
    () => cloneLpGroupId ?? lpGroupIdForSave,
    [cloneLpGroupId, lpGroupIdForSave],
  );

  /** 再生成のたびに増やし、テンプレのバリエーションを変える */
  const suggestRegenNonceRef = useRef<Record<string, number>>({});
  /** Perplexity 由来の検索キーワード（同一エリア・サービス・業種で再利用） */
  const seoKeywordsCacheRef = useRef<{ key: string; keywords: string[] } | null>(
    null,
  );

  const supabase = createSupabaseClient();

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
        setOpenBlock(0);
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
        setOpenBlock(0);

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
    [rawAnswers, getSuggestAreaService, setAnswer, showToast, industryKey],
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
    // Supabase への保存は Next.js API 経由で行うため、
    // ここでは API に渡す payload を組み立てる。

    const rawAnswersPayload = LOCAL_QUESTION_BLOCKS.flatMap((block) =>
      block.questions.map(({ id, label }) => {
        const value = (rawAnswers[id] ?? '').trim();
        return {
          id,
          question: label,
          // 空文字はそのまま送る（JSONBに格納するだけなので制約に引っかからない）
          answer: value,
        };
      }),
    );

    const companyName =
      companyInfo.company_name.trim() ||
      (rawAnswers.q1 ?? '').trim() ||
      '新規プロジェクト（実店舗）';
    const status = 'draft';
    // 入力されたターゲットエリア（q11もフォールバックとして利用）
    const fallbackAreaFromAnswers = (rawAnswers.q11 ?? '').trim();
    const targetAreaInput = targetAreas.trim();
    const resolvedAreaRaw =
      targetAreaInput || fallbackAreaFromAnswers || '';
    const resolvedArea =
      resolvedAreaRaw.length > 0 ? resolvedAreaRaw : null;

    // areas はターゲットエリアをカンマ区切りで配列化したもの
    const areasArray: string[] =
      targetAreaInput.length > 0
        ? targetAreaInput
            .split(/[,、，]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

    // 対応サービス（カンマ区切りで複数可 → save API で直積分割）
    const serviceInputRaw = targetServices.trim();
    const serviceInput = serviceInputRaw.length > 0 ? serviceInputRaw : null;
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
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) {
          throw new Error(
            String(data?.error || '更新に失敗しました。'),
          );
        }
        showToast('success', '保存しました。本番公開テストを開きます。');
        setPublishPresetService(serviceForPublishPreset);
        setPublishPanelVisible(true);
        const slugBack = typeof data.slug === 'string' ? data.slug : null;
        setEditPublishContext((prev) =>
          prev
            ? {
                ...prev,
                slug: slugBack ?? prev.slug,
                savedService:
                  serviceInputRaw.length > 0
                    ? serviceInputRaw
                    : prev.savedService,
              }
            : prev,
        );
        return;
      }

      const res = await fetch('/api/projects/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
          ? `${splitCount} 件のプロジェクトを保存しました（先頭が親。本番公開テストの基点は親の id / slug です）。`
          : 'プロジェクトを保存しました。一覧からLPを確認できます。',
      );
      setPublishPresetService(serviceForPublishPreset);
      setPublishPanelVisible(true);
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

  const publishDrawerAllowed =
    projectType === 'local' &&
    (!isEditMode || editLoadState === 'ok') &&
    (!isCloneMode || cloneLoadState === 'ok');

  const publishFocusProject: PublishTestFocusProject | null =
    isEditMode && editLoadState === 'ok' && editPublishContext
      ? {
          ...editPublishContext,
          formService: targetServices.trim() || null,
        }
      : postSavePublishFocus;

  const publishPresetMerged = isEditMode
    ? targetServices.trim() ||
      editPublishContext?.savedService ||
      ''
    : publishPresetService;

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

          {projectType === 'local' && (
            <section className="mb-8 rounded-2xl border border-sky-500/30 bg-sky-950/20 p-5">
              <h2 className="mb-3 text-sm font-semibold text-sky-200">
                エリア×サービス（このプロジェクトの表示用）
              </h2>
              <p className="mb-4 text-xs text-slate-400">
                {isEditMode
                  ? 'LP のエリア・業種表示に使われます。保存すると DB の area / service / areas も更新されます。'
                  : '複数指定すると、組み合わせごとに別プロジェクトが生成されます。'}
              </p>
              <div className="grid gap-4 md:grid-cols-2">
                {SPLIT_QUESTIONS.map(({ id, label, placeholder }) => (
                  <div key={id} className="space-y-2">
                    <label className={labelClass}>{label}</label>
                    <input
                      type="text"
                      value={id === 'target_areas' ? targetAreas : targetServices}
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
                  業種キー（任意・関連LP用）
                </label>
                <input
                  type="text"
                  value={industryKey}
                  onChange={(e) => setIndustryKey(e.target.value)}
                  placeholder="例: garden / insurance / roof（空欄なら service のみで関連を判定）"
                  className={inputClass}
                />
                <p className="text-xs text-slate-500">
                  「あわせて読みたい」に載せる公開LPを業種ごとに分けたいとき、同じ略号を入れた行同士だけが関連候補になります。両方に値がある場合のみ一致が必須です。
                </p>
              </div>
            </section>
          )}

          {projectType === 'local' ? (
            <>
            <form onSubmit={handleSubmitLocal} className="space-y-4">
              {LOCAL_QUESTION_BLOCKS.map((block, blockIndex) => (
                <div
                  key={blockIndex}
                  className="rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenBlock(openBlock === blockIndex ? null : blockIndex)
                    }
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition hover:bg-slate-800/60"
                  >
                    <span className="font-semibold text-slate-100">
                      ブロック{blockIndex + 1}：{block.title}
                    </span>
                    {openBlock === blockIndex ? (
                      <ChevronUp className="h-5 w-5 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-slate-400" />
                    )}
                  </button>
                  {openBlock === blockIndex && (
                    <div className="space-y-4 border-t border-slate-800 p-5">
                      {block.questions.map(({ id, label }) => (
                        <div key={id} className="space-y-2">
                          <label className={labelClass}>
                            {label}
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                            <textarea
                              value={rawAnswers[id] ?? ''}
                              onChange={(e) => setAnswer(id, e.target.value)}
                              placeholder={`例：${label}について入力`}
                              rows={3}
                              className={`${inputClass} min-h-[5rem] flex-1`}
                            />
                            <div className="flex shrink-0 flex-col gap-1.5 sm:w-[8.5rem]">
                              <button
                                type="button"
                                onClick={() => handleSuggestAnswer(id, label, 'fill')}
                                className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/50 bg-amber-950/40 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:bg-amber-900/50"
                                title="空欄なら挿入。入力済みの場合は確認後に上書き"
                              >
                                <Sparkles className="h-3.5 w-3.5" />
                                自動生成
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSuggestAnswer(id, label, 'regenerate')}
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
              ))}
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
            {publishDrawerAllowed && !publishPanelVisible && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={() => setPublishPanelVisible(true)}
                  className="text-xs text-slate-400 underline decoration-slate-600 underline-offset-2 hover:text-slate-200"
                >
                  本番公開テスト（右パネル）を開く
                </button>
              </div>
            )}
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
      <PublishTestPanel
        visible={publishPanelVisible && publishDrawerAllowed}
        presetService={publishPresetMerged}
        focusProject={publishFocusProject}
        onDismiss={() => {
          setPublishPanelVisible(false);
          setPostSavePublishFocus(null);
        }}
      />
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
