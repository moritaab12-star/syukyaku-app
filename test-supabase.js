const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvLocal() {
  const p = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(p)) return;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const k = trimmed.slice(0, eq).trim();
    const v = trimmed.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
}

function mask(v) {
  if (!v) return '(missing)';
  return `${v.slice(0, 8)}...${v.slice(-6)}`;
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('URL:', url || '(missing)');
  console.log('anon:', mask(anon));
  console.log('service:', mask(service));

  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL missing');
  if (!anon) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY missing');
  if (!service) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');

  const supabaseAnon = createClient(url, anon);
  const { data: anonData, error: anonError } = await supabaseAnon
    .from('projects')
    .select('id')
    .limit(1);
  console.log('anon result:', {
    ok: !anonError,
    rows: Array.isArray(anonData) ? anonData.length : null,
    error: anonError ? anonError.message : null,
    hint: anonError && anonError.hint ? anonError.hint : null,
  });

  const supabaseService = createClient(url, service);
  const { data: svcData, error: svcError } = await supabaseService
    .from('projects')
    .select('id')
    .limit(1);
  console.log('service result:', {
    ok: !svcError,
    rows: Array.isArray(svcData) ? svcData.length : null,
    error: svcError ? svcError.message : null,
    hint: svcError && svcError.hint ? svcError.hint : null,
  });
}

main().catch((e) => {
  console.error('fatal error:', e && e.message ? e.message : e);
  process.exitCode = 1;
});

