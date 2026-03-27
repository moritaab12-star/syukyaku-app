import type { CompanyInfoDisplay } from './companyInfoFormatter';
import type { LpViewModel } from './lp-template';

export type LocalBusinessJsonLdInput = {
  company: CompanyInfoDisplay;
  view: LpViewModel;
  pageUrl?: string;
  imageUrl?: string;
  priceRange?: string;
};

/**
 * Schema.org LocalBusiness 用の JSON-LD を生成する。
 * 値がない項目は安全に省略し、不自然な空文字は出さない。
 */
export function buildLocalBusinessJsonLd(
  input: LocalBusinessJsonLdInput,
): Record<string, unknown> {
  const { company, view, pageUrl, imageUrl, priceRange } = input;

  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: company.name || view.serviceName || '地域密着サービス',
  };

  // description: headline + subheadline または company_intro
  const descParts: string[] = [];
  if (view.headline?.trim()) descParts.push(view.headline.trim());
  if (view.subheadline?.trim()) descParts.push(view.subheadline.trim());
  const descFromView = descParts.join('。').slice(0, 200);
  const descFromIntro = company.intro?.trim().slice(0, 200) || '';
  const description = descFromView || descFromIntro || `${view.areaName || ''}の${view.serviceName || 'サービス'}です。`;
  payload.description = description;

  if (pageUrl?.trim()) {
    payload.url = pageUrl.trim();
  }

  if (company.phone?.trim()) {
    payload.telephone = company.phone.trim();
  }

  if (company.email?.trim()) {
    payload.email = company.email.trim();
  }

  // address: PostalAddress（address がある場合のみ）
  if (company.address?.trim()) {
    const addr: Record<string, string> = {
      '@type': 'PostalAddress',
      streetAddress: company.address.trim(),
    };
    if (company.postalCode?.trim()) {
      addr.postalCode = company.postalCode.trim();
    }
    payload.address = addr;
  }

  // areaServed: area_name または area_summary
  const areaName = view.areaName?.trim();
  const areaSummary = company.areaSummary?.trim();
  if (areaName || areaSummary) {
    const area = areaName || areaSummary;
    payload.areaServed = {
      '@type': 'Place',
      name: area,
    };
  }

  // openingHours: business_hours と closed_days から構成
  // 曖昧な場合は省略（無理に不正確な openingHoursSpecification を作らない）
  const hours = company.businessHours?.trim();
  const closed = company.closedDays?.trim();
  if (hours && /\d{1,2}:\d{2}\s*[-〜~～]\s*\d{1,2}:\d{2}/.test(hours)) {
    payload.openingHours = closed ? `${hours}（定休：${closed}）` : hours;
  } else if (hours) {
    payload.openingHours = hours;
  }

  if (imageUrl?.trim()) {
    payload.image = imageUrl.trim();
  }

  if (priceRange?.trim()) {
    payload.priceRange = priceRange.trim();
  }

  // serviceType: service_name（将来複数サービスに拡張しやすいように配列も許容）
  if (view.serviceName?.trim()) {
    payload.serviceType = view.serviceName.trim();
  }

  return payload;
}
