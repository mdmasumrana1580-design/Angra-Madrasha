const SESSION_SECONDS = 8 * 60 * 60;
const MAX_BODY = 8192;
const MAX_PHOTO_SIZE = 3 * 1024 * 1024;
const encoder = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extra
    }
  });
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromB64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const raw = atob(s);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

async function hmac(secret, text) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(text)));
}

function equal(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifySession(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const match = cookie.match(/(?:^|;\s*)school_admin_session=([^;]+)/);
  if (!match) return false;

  try {
    const token = match[1];
    const [payload, sig] = token.split('.');
    if (!payload || !sig || !env.SESSION_SECRET) return false;
    const expected = await hmac(env.SESSION_SECRET, payload);
    if (!equal(expected, fromB64url(sig))) return false;
    const data = JSON.parse(new TextDecoder().decode(fromB64url(payload)));
    return data.exp > Math.floor(Date.now() / 1000) && data.sub === 'admin';
  } catch {
    return false;
  }
}

function originAllowed(request) {
  const origin = request.headers.get('Origin');
  return !!origin && origin === new URL(request.url).origin;
}

async function readJson(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_BODY) throw new Error('অনুরোধটি অনেক বড়।');
  const text = await request.text();
  if (text.length > MAX_BODY) throw new Error('অনুরোধটি অনেক বড়।');
  return JSON.parse(text);
}

async function readForm(request) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > MAX_PHOTO_SIZE + 64 * 1024) throw new Error('ছবিসহ অনুরোধটি ৩ MB-এর বেশি হতে পারবে না।');
  return request.formData();
}

async function ipKey(ip, secret) {
  return b64url(await hmac(secret, ip || 'unknown'));
}

async function blocked(env, key) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'SELECT failures, window_started, blocked_until FROM login_attempts WHERE ip_hash=?'
  ).bind(key).first();
  return !!row && row.blocked_until > now;
}

async function failLogin(env, key) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    'SELECT failures, window_started FROM login_attempts WHERE ip_hash=?'
  ).bind(key).first();
  const withinWindow = row && now - row.window_started < 900;
  const failures = withinWindow ? row.failures + 1 : 1;
  const start = withinWindow ? row.window_started : now;
  const blockedUntil = failures >= 5 ? now + 900 : 0;

  await env.DB.prepare(
    'INSERT INTO login_attempts(ip_hash,failures,window_started,blocked_until) VALUES(?,?,?,?) ' +
    'ON CONFLICT(ip_hash) DO UPDATE SET failures=excluded.failures,window_started=excluded.window_started,blocked_until=excluded.blocked_until'
  ).bind(key, failures, start, blockedUntil).run();
}

async function clearLogin(env, key) {
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip_hash=?').bind(key).run();
}

function sessionCookie(value, maxAge) {
  return `school_admin_session=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

function cleanText(value, maxLength) {
  return String(value ?? '').trim().slice(0, maxLength);
}

function validPhotoType(file) {
  return file &&
    typeof file.arrayBuffer === 'function' &&
    ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
}

function photoExtension(type) {
  if (type === 'image/jpeg') return 'jpg';
  if (type === 'image/png') return 'png';
  return 'webp';
}

function photoUrl(key) {
  return key ? `/api/photos?key=${encodeURIComponent(key)}` : '';
}

function withPhotoUrl(row) {
  return { ...row, photo_url: photoUrl(row.photo_key) };
}

async function storePhoto(env, file, category) {
  if (!validPhotoType(file)) {
    throw new Error('ছবি JPG, PNG অথবা WebP ফরম্যাটে হতে হবে।');
  }
  if (file.size <= 0 || file.size > MAX_PHOTO_SIZE) {
    throw new Error('ছবির সাইজ ৩ MB-এর মধ্যে হতে হবে।');
  }
  if (!env.PHOTOS) throw new Error('R2 PHOTOS binding পাওয়া যায়নি। Wrangler কনফিগারেশন ও Worker deployment পরীক্ষা করুন।');

  const key = `${category}/${crypto.randomUUID()}.${photoExtension(file.type)}`;
  const bytes = await file.arrayBuffer();
  await env.PHOTOS.put(key, bytes, {
    httpMetadata: {
      contentType: file.type,
      cacheControl: 'public, max-age=86400'
    }
  });
  return key;
}

async function deletePhoto(env, key) {
  if (key && env.PHOTOS) {
    try { await env.PHOTOS.delete(key); } catch (err) {
      console.error('Photo cleanup error', err);
    }
  }
}

async function listPeople(env, type) {
  const table = type === 'teachers' ? 'teachers' : 'students';
  const columns = type === 'teachers'
    ? 'id,name,designation,subject,phone,photo_key,created_at'
    : 'id,name,class_name,roll,photo_key,created_at';
  const { results } = await env.DB.prepare(
    `SELECT ${columns} FROM ${table} ORDER BY id DESC LIMIT 1000`
  ).all();
  return results.map(withPhotoUrl);
}

async function createPerson(request, env, type) {
  let form;
  try { form = await readForm(request); }
  catch (err) { return json({ error: err.message || 'সঠিক তথ্য দিন।' }, 400); }

  const name = cleanText(form.get('name'), 120);
  if (!name) return json({ error: 'নাম লিখুন।' }, 400);

  const photo = form.get('photo');
  let photoKey = '';
  try {
    if (photo && photo.size > 0) photoKey = await storePhoto(env, photo, type);
    let result;

    if (type === 'teachers') {
      const designation = cleanText(form.get('designation'), 100);
      const subject = cleanText(form.get('subject'), 100);
      const phone = cleanText(form.get('phone'), 30);
      result = await env.DB.prepare(
        'INSERT INTO teachers(name,designation,subject,phone,photo_key) VALUES(?,?,?,?,?)'
      ).bind(name, designation, subject, phone, photoKey).run();
    } else {
      const className = cleanText(form.get('class_name'), 50);
      const roll = cleanText(form.get('roll'), 30);
      result = await env.DB.prepare(
        'INSERT INTO students(name,class_name,roll,photo_key) VALUES(?,?,?,?)'
      ).bind(name, className, roll, photoKey).run();
    }

    return json({ ok: true, id: result.meta.last_row_id, photo_key: photoKey, photo_url: photoUrl(photoKey) }, 201);
  } catch (err) {
    if (photoKey) await deletePhoto(env, photoKey);
    if (err instanceof Error && (err.message.includes('ছবি') || err.message.includes('R2'))) {
      return json({ error: err.message }, 400);
    }
    throw err;
  }
}

async function updatePerson(request, env, type, id) {
  const table = type === 'teachers' ? 'teachers' : 'students';
  const current = await env.DB.prepare(
    `SELECT * FROM ${table} WHERE id=?`
  ).bind(id).first();
  if (!current) return json({ error: 'তথ্য পাওয়া যায়নি।' }, 404);

  let form;
  try { form = await readForm(request); }
  catch (err) { return json({ error: err.message || 'সঠিক তথ্য দিন।' }, 400); }

  const name = cleanText(form.get('name'), 120);
  if (!name) return json({ error: 'নাম লিখুন।' }, 400);

  const photo = form.get('photo');
  let newPhotoKey = current.photo_key || '';
  let uploadedNewPhoto = '';

  try {
    if (photo && photo.size > 0) {
      uploadedNewPhoto = await storePhoto(env, photo, type);
      newPhotoKey = uploadedNewPhoto;
    }

    if (type === 'teachers') {
      await env.DB.prepare(
        'UPDATE teachers SET name=?,designation=?,subject=?,phone=?,photo_key=? WHERE id=?'
      ).bind(
        name,
        cleanText(form.get('designation'), 100),
        cleanText(form.get('subject'), 100),
        cleanText(form.get('phone'), 30),
        newPhotoKey,
        id
      ).run();
    } else {
      await env.DB.prepare(
        'UPDATE students SET name=?,class_name=?,roll=?,photo_key=? WHERE id=?'
      ).bind(
        name,
        cleanText(form.get('class_name'), 50),
        cleanText(form.get('roll'), 30),
        newPhotoKey,
        id
      ).run();
    }

    if (uploadedNewPhoto && current.photo_key) await deletePhoto(env, current.photo_key);
    return json({ ok: true, id, photo_key: newPhotoKey, photo_url: photoUrl(newPhotoKey) });
  } catch (err) {
    if (uploadedNewPhoto) await deletePhoto(env, uploadedNewPhoto);
    if (err instanceof Error && (err.message.includes('ছবি') || err.message.includes('R2'))) {
      return json({ error: err.message }, 400);
    }
    throw err;
  }
}

async function deletePerson(env, type, id) {
  const table = type === 'teachers' ? 'teachers' : 'students';
  const current = await env.DB.prepare(
    `SELECT photo_key FROM ${table} WHERE id=?`
  ).bind(id).first();
  if (!current) return json({ error: 'তথ্য পাওয়া যায়নি।' }, 404);

  await env.DB.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
  await deletePhoto(env, current.photo_key);
  return json({ ok: true });
}

async function handleApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // Public admission intake; submissions are stored in D1 for admin review.
  if (method === 'POST' && path === '/api/admissions') {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    let body; try { body = await readJson(request); } catch { return json({ error: 'সঠিক তথ্য দিন।' }, 400); }
    const guardian = cleanText(body.guardian, 120), phone = cleanText(body.phone, 30), grade = cleanText(body.grade, 80), studentName = cleanText(body.studentName || body.student_name, 120);
    if (!guardian || !phone || !grade) return json({ error: 'অভিভাবকের নাম, ফোন ও শ্রেণি আবশ্যক।' }, 400);
    const result = await env.DB.prepare('INSERT INTO admissions(student_name,guardian,phone,grade) VALUES(?,?,?,?)').bind(studentName, guardian, phone, grade).run();
    return json({ ok: true, id: result.meta.last_row_id }, 201);
  }

  const protectedRoute = method !== 'GET' || !['/api/admissions','/api/fees','/api/settings'].includes(path);
  if (path.startsWith('/api/') && ['/api/admissions','/api/fees','/api/settings'].includes(path.split('/').slice(0,3).join('/'))) {
    if (!originAllowed(request) && method !== 'GET') return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    if (method !== 'GET' || path !== '/api/settings/public') {
      if (!await verifySession(request, env)) return json({ error: 'লগইন প্রয়োজন।' }, 401);
    }
    if (path === '/api/admissions' && method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM admissions ORDER BY id DESC LIMIT 1000').all(); return json(results);
    }
    const admissionMatch = path.match(/^\/api\/admissions\/(\d+)$/);
    if (admissionMatch && method === 'PATCH') {
      let b; try { b=await readJson(request); } catch { return json({error:'সঠিক তথ্য দিন।'},400); }
      await env.DB.prepare('UPDATE admissions SET status=?, notes=? WHERE id=?').bind(cleanText(b.status,40)||'নতুন',cleanText(b.notes,1000),Number(admissionMatch[1])).run(); return json({ok:true});
    }
    if (admissionMatch && method === 'DELETE') { await env.DB.prepare('DELETE FROM admissions WHERE id=?').bind(Number(admissionMatch[1])).run(); return json({ok:true}); }
    if (path === '/api/fees' && method === 'GET') { const {results}=await env.DB.prepare('SELECT * FROM fee_records ORDER BY id DESC LIMIT 1000').all(); return json(results); }
    if (path === '/api/fees' && method === 'POST') {
      let b; try { b=await readJson(request); } catch { return json({error:'সঠিক তথ্য দিন।'},400); }
      const name=cleanText(b.student_name||b.studentName,120), cls=cleanText(b.class_name||b.className,50), month=cleanText(b.month,40), amount=Number(b.amount), paid=Number(b.paid||0), note=cleanText(b.note,500);
      if(!name || !Number.isInteger(amount) || amount<0 || !Number.isInteger(paid) || paid<0 || paid>amount) return json({error:'শিক্ষার্থীর নাম ও সঠিক ফি/জমার পরিমাণ দিন।'},400);
      const r=await env.DB.prepare('INSERT INTO fee_records(student_name,class_name,amount,paid,month,note) VALUES(?,?,?,?,?,?)').bind(name,cls,amount,paid,month,note).run(); return json({ok:true,id:r.meta.last_row_id},201);
    }
    const feeMatch=path.match(/^\/api\/fees\/(\d+)$/); if(feeMatch && method==='DELETE'){await env.DB.prepare('DELETE FROM fee_records WHERE id=?').bind(Number(feeMatch[1])).run();return json({ok:true});}
    if (path === '/api/settings' && method === 'GET') { const {results}=await env.DB.prepare('SELECT key,value,updated_at FROM site_settings ORDER BY key').all(); return json(Object.fromEntries(results.map(r=>[r.key,r.value]))); }
    if (path === '/api/settings' && method === 'PUT') { let b; try{b=await readJson(request)}catch{return json({error:'সঠিক তথ্য দিন।'},400)}; for(const [k,v] of Object.entries(b)){if(!/^[a-zA-Z0-9_-]{1,60}$/.test(k))continue; await env.DB.prepare("INSERT INTO site_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')").bind(k,cleanText(v,3000)).run();} return json({ok:true}); }
  }

  if (method === 'GET' && path === '/api/notices') {
    const { results } = await env.DB.prepare(
      'SELECT id,title,date,body,created_at FROM notices ORDER BY id DESC LIMIT 100'
    ).all();
    return json(results);
  }

  if (method === 'GET' && path === '/api/teachers') {
    return json(await listPeople(env, 'teachers'));
  }

  if (method === 'GET' && path === '/api/students') {
    return json(await listPeople(env, 'students'));
  }

  if (method === 'GET' && path === '/api/photos') {
    const key = url.searchParams.get('key') || '';
    if (!/^(teachers|students)\/[a-f0-9-]+\.(jpg|png|webp)$/.test(key)) {
      return json({ error: 'ছবির ঠিকানা সঠিক নয়।' }, 400);
    }
    if (!env.PHOTOS) return json({ error: 'R2 PHOTOS binding পাওয়া যায়নি।' }, 503);
    const object = await env.PHOTOS.get(key);
    if (!object) return json({ error: 'ছবি পাওয়া যায়নি।' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
    return new Response(object.body, { headers });
  }

  if (method === 'POST' && path === '/api/login') {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    let body;
    try { body = await readJson(request); }
    catch { return json({ error: 'সঠিক তথ্য দিন।' }, 400); }

    const configuredPassword = String(env.ADMIN_PASSWORD || '');
    if (!configuredPassword || !env.SESSION_SECRET) {
      return json({ error: 'অ্যাডমিন লগইন কনফিগারেশন সম্পূর্ণ নয়। Cloudflare Secrets পরীক্ষা করুন।' }, 503);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = await ipKey(ip, env.SESSION_SECRET);
    if (await blocked(env, key)) {
      return json({ error: 'অনেকবার ভুল চেষ্টা হয়েছে। ১৫ মিনিট পরে আবার চেষ্টা করুন।' }, 429);
    }

    const password = String(body.password || '');
    const okPass = equal(encoder.encode(password), encoder.encode(configuredPassword));
    if (!okPass) {
      await failLogin(env, key);
      return json({ error: 'পাসওয়ার্ড সঠিক নয়।' }, 401);
    }

    await clearLogin(env, key);
    const payload = b64url(encoder.encode(JSON.stringify({
      sub: 'admin',
      exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
      nonce: crypto.randomUUID()
    })));
    const token = payload + '.' + b64url(await hmac(env.SESSION_SECRET, payload));
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(token, SESSION_SECONDS) });
  }

  if (method === 'GET' && path === '/api/session') {
    return await verifySession(request, env)
      ? json({ ok: true })
      : json({ error: 'লগইন প্রয়োজন।' }, 401);
  }

  if (method === 'POST' && path === '/api/logout') {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie('', 0) });
  }

  if (
    (method === 'POST' && path === '/api/notices') ||
    (method === 'DELETE' && /^\/api\/notices\/\d+$/.test(path))
  ) {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    if (!await verifySession(request, env)) {
      return json({ error: 'সেশন শেষ হয়েছে। আবার লগইন করুন।' }, 401);
    }

    if (method === 'POST') {
      let body;
      try { body = await readJson(request); }
      catch { return json({ error: 'সঠিক তথ্য দিন।' }, 400); }

      const title = String(body.title || '').trim();
      const date = String(body.date || '').trim();
      const text = String(body.body || '').trim();
      if (!title || title.length > 120 || !text || text.length > 1500 || date.length > 50) {
        return json({ error: 'শিরোনাম, তারিখ বা বিস্তারিতের দৈর্ঘ্য যাচাই করুন।' }, 400);
      }

      const result = await env.DB.prepare(
        'INSERT INTO notices(title,date,body) VALUES(?,?,?)'
      ).bind(title, date, text).run();
      return json({ ok: true, id: result.meta.last_row_id }, 201);
    }

    const id = Number(path.split('/').pop());
    await env.DB.prepare('DELETE FROM notices WHERE id=?').bind(id).run();
    return json({ ok: true });
  }

  const personRoute = path.match(/^\/api\/(teachers|students)(?:\/(\d+))?$/);
  if (personRoute && (method === 'POST' || method === 'PUT' || method === 'DELETE')) {
    if (!originAllowed(request)) return json({ error: 'নিরাপত্তার কারণে অনুরোধটি গ্রহণ করা হয়নি।' }, 403);
    if (!await verifySession(request, env)) {
      return json({ error: 'সেশন শেষ হয়েছে। আবার লগইন করুন।' }, 401);
    }

    const type = personRoute[1];
    const id = personRoute[2] ? Number(personRoute[2]) : null;
    if (method === 'POST' && id === null) return await createPerson(request, env, type);
    if (method === 'PUT' && id !== null) return await updatePerson(request, env, type, id);
    if (method === 'DELETE' && id !== null) return await deletePerson(env, type, id);
    return json({ error: 'অনুরোধের ঠিকানা সঠিক নয়।' }, 400);
  }

  return json({ error: 'এন্ডপয়েন্ট পাওয়া যায়নি।' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env);
      } catch (err) {
        console.error('API error', err);
        return json({ error: 'সার্ভারে সমস্যা হয়েছে। পরে আবার চেষ্টা করুন।' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  }
};
