export type CompanyInfo = {
  company_name?: string;
  company_intro?: string;
  phone?: string;
  email?: string;
  line_url?: string;
  address?: string;
  postal_code?: string;
  business_hours?: string;
  closed_days?: string;
  area_summary?: string;
};

export type CompanyInfoDisplay = {
  name: string;
  intro: string;
  phone?: string;
  phoneHref?: string;
  email?: string;
  emailHref?: string;
  lineUrl?: string;
  address?: string;
  postalCode?: string;
  businessHours?: string;
  closedDays?: string;
  areaSummary?: string;
  hasPhone: boolean;
  hasEmail: boolean;
  hasLine: boolean;
};

function sanitizeString(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const v = value.trim();
    return v || undefined;
  }
  return undefined;
}

export function normalizeCompanyInfo(
  raw: unknown,
  opts?: { fallbackName?: string; fallbackArea?: string },
): CompanyInfoDisplay {
  let parsed: CompanyInfo = {};

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as CompanyInfo;
    } catch {
      parsed = {};
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw as CompanyInfo;
  }

  const name =
    sanitizeString(parsed.company_name) ||
    opts?.fallbackName ||
    '地域密着サービス';

  const area = opts?.fallbackArea || '';

  const intro =
    sanitizeString(parsed.company_intro) ||
    `${area || '地域'}でお客様に寄り添ったサービス提供を心がけています。`;

  const phone = sanitizeString(parsed.phone);
  const email = sanitizeString(parsed.email);
  const lineUrl = sanitizeString(parsed.line_url);

  const phoneHref = phone ? `tel:${phone.replace(/[^0-9+]/g, '')}` : undefined;
  const emailHref = email ? `mailto:${email}` : undefined;

  const address = sanitizeString(parsed.address);
  const postalCode = sanitizeString(parsed.postal_code);
  const businessHours = sanitizeString(parsed.business_hours);
  const closedDays = sanitizeString(parsed.closed_days);
  const areaSummary = sanitizeString(parsed.area_summary);

  return {
    name,
    intro,
    phone,
    phoneHref,
    email,
    emailHref,
    lineUrl,
    address,
    postalCode,
    businessHours,
    closedDays,
    areaSummary,
    hasPhone: Boolean(phone),
    hasEmail: Boolean(email),
    hasLine: Boolean(lineUrl),
  };
}

