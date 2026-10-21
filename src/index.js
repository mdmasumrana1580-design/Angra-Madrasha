const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY = 8192;
const encoder = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function b64url(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function fromB64url(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0)); }
async function hmac(secret, text) { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text))); }
function equal(a, b) { if (a.length !== b.length) return false; let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; return diff === 0; }
async function verifySession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)school_admin_session=([^;]+)/);
  if (!match) return false;
  try { const token = match[1]; const [payload, sig] = token.split('.'); if (!payload || !sig) return false; const expected = await hmac(env.SESSION_SECRET, payload); if (!equal(expected, fromB64url(sig))) return false; const data = JSON.parse(new TextDecoder().decode(fromB64url(payload))); return data.exp > Math.floor(Date.now() / 1000) && data.sub === 'admin'; } catch { return false; }
}
function originAllowed(request) { const origin = request.headers.get('Origin'); return !!origin && origin === new URL(request.url).origin; }
async function readJson(request) { const len = Number(request.headers.get('Content-Length') || 0); if (len > MAX_BODY) throw new Error('অনুরোধটি অনেক বড়।'); const text = await request.text(); if (text.length > MAX_BODY) throw new Error('অনুরোধটি অনেক বড়।'); return JSON.parse(text); }
async function ipKey(ip, secret) { return b64url(await hmac(secret, ip || 'unknown')); }
async function blocked(env, key) { const now = Math.floor(Date.now() / 1000); const row = await env.DB.prepare('SELECT failures, window_started, blocked_until FROM login_attempts WHERE ip_hash=?').bind(key).first(); return !!row && row.blocked_until > now; }
async function failLogin(env, key) { const now = Math.floor(Date.now() / 1000); const row = await env.DB.prepare('SELECT failures, window_started FROM login_attempts WHERE ip_hash=?').bind(key).first(); let failures = row && now - row.window_started < 900 ? row.failures + 1 : 1; const start = row && now - row.window_started < 900 ? row.window_started : now; const blockedUntil = failures >= 5 ? now + 900 : 0; await env.DB.prepare('INSERT INTO login_attempts(ip_hash,failures,window_started,blocked_until) VALUES(?,?,?,?) ON CONFLICT(ip_hash) DO UPDATE SET failures=excluded.failures,window_started=excluded.window_started,blocked_until=excluded.blocked_until').bind(key, failures, start, blockedUntil).run(); }
async function clearLogin(env, key) { await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(key).run(); }
function sessionCookie(value, maxAge) { return `school_admin_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`; }
async function handleApi(request, env) {
  const url = new URL(request.url); const path = url.pathname; const method = request.method;
  if (method === 'GET' && path === '/api/notices') { const { results } = await env.DB.prepare('SELECT id,title,date,body,created_at FROM notices ORDER BY id DESC LIMIT 100').all(); return json(results); }
  if (method === 'POST' && path === '/api/login') {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: 'সঠিক তথ্য দিন।' }, 400); }
    const configuredPassword = String(env.ADMIN_PASSWORD || '');
    if (!configuredPassword || !env.SESSION_SECRET) return json({ error: 'অ্যাডমিন লগইন কনফিগারেশন সম্পূর্ণ নয়। Cloudflare Secrets পরীক্ষা করুন।' }, 503);
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'; const key = await ipKey(ip, env.SESSION_SECRET);
    if (await blocked(env, key)) return json({ error: 'অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।' }, 429);
    const password = String(body.password || '');
    const okPass = equal(encoder.encode(password), encoder.encode(configuredPassword));
    if (!okPass) { await failLogin(env, key); return json({ error: 'পাসওয়ার্ড সঠিক নয়।' }, 401); }
    await clearLogin(env, key);
    const payload = b64url(encoder.encode(JSON.stringify({ sub: 'admin', exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS, nonce: crypto.randomUUID() })));
    const token = payload + '.' + b64url(await hmac(env.SESSION_SECRET, payload));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
  }
  if (method === 'GET' && path === '/api/session') return await verifySession(request, env) ? json({ ok: true }) : json({ error: 'লগইন প্রয়োজন।' }, 401);
  if (method === 'POST' && path === '/api/logout') {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }
  if ((method === 'POST' && path === '/api/notices') || (method === 'DELETE' && /^\/api\/notices\/\d+$/.test(path))) {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    if (!await verifySession(request, env)) return json({ error: 'সেশন শেষ হয়েছে। আবার লগইন করুন।' }, 401);
    if (method === 'POST') {
      let body; try { body = await readJson(request); } catch { return json({ error: 'সঠিক তথ্য দিন।' }, 400); }
      const title = String(body.title || '').trim(); const date = String(body.date || '').trim(); const text = String(body.body || '').trim();
      if (!title || title.length > 120 || !text || text.length > 1500 || date.length > 50) return json({ error: 'শিরোনাম, তারিখ বা বিস্তারিতের দৈর্ঘ্য যাচাই করুন।' }, 400);
      const result = await env.DB.prepare('INSERT INTO notices(title,date,body) VALUES(?,?,?)').bind(title, date, text).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }
    const id = Number(path.split('/').pop()); await env.DB.prepare('DELETE FROM notices WHERE id=?').bind(id).run(); return json({ ok: true });
  }
  return json({ error: 'এন্ডপয়েন্ট পাওয়া যায়নি।' }, 404);
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await handleApi(request, env); } catch (err) { console.error('API error', err); return json({ error: 'সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।' }, 500); }
    }
    return env.ASSETS.fetch(request);
  }
};
