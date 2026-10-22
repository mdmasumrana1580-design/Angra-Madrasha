/* Angra Madrasha public website app.js
   Loads notices, teachers and students from the Cloudflare Worker API.
   Safe to use with sections that are not present on a page.
*/
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[ch]);
  const text = (id, value) => { const el = $(id); if (el) el.textContent = value; };

  // PWA install button: Android Chrome creates the installed WebAPK from this manifest.
  let deferredInstallPrompt = null;
  const installButton = $('installAppBtn');
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  if (installButton) {
    if (isStandalone) {
      installButton.innerHTML = '✓ <span>Installed</span>';
      installButton.disabled = true;
      installButton.setAttribute('aria-label', 'App already installed');
    }
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredInstallPrompt = event;
      installButton.hidden = false;
    });
    installButton.addEventListener('click', async () => {
      if (isStandalone) return;
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        try {
          const result = await deferredInstallPrompt.userChoice;
          if (result && result.outcome === 'accepted') {
            installButton.innerHTML = '✓ <span>Installing…</span>';
          }
        } catch (_) {}
        deferredInstallPrompt = null;
        return;
      }
      alert('অ্যাপ ইনস্টল করতে Chrome-এর উপরের ⋮ মেনু খুলুন, তারপর “Install app” বা “Add to Home screen” নির্বাচন করুন।');
    });
    window.addEventListener('appinstalled', () => {
      installButton.innerHTML = '✓ <span>Installed</span>';
      installButton.disabled = true;
    });
  }


  const api = async (url) => {
    const response = await fetch(url, { method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
    let data;
    try { data = await response.json(); } catch { data = null; }
    if (!response.ok) throw new Error((data && data.error) || `তথ্য লোড হয়নি (${response.status})`);
    return data;
  };

  // Mobile navigation (supports common button/nav IDs without requiring them).
  const menuButton = $('menuToggle') || $('navToggle') || $('menuBtn') || $('mobileMenuBtn');
  const nav = $('navLinks') || $('mainNav') || document.querySelector('header nav') || document.querySelector('nav');
  if (menuButton && nav) {
    menuButton.addEventListener('click', () => {
      const opened = nav.classList.toggle('open');
      menuButton.setAttribute('aria-expanded', String(opened));
    });
    nav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
      nav.classList.remove('open');
      menuButton.setAttribute('aria-expanded', 'false');
    }));
  }

  // Current year.
  const year = $('year') || $('currentYear') || $('footerYear');
  if (year) year.textContent = String(new Date().getFullYear());

  // Teacher/student tabs.
  const teacherTab = $('teachersTab');
  const studentTab = $('studentsTab');
  const teacherPanel = $('teachersPanel');
  const studentPanel = $('studentsPanel');
  function showPeopleTab(which) {
    const teachers = which === 'teachers';
    if (teacherPanel) teacherPanel.hidden = !teachers;
    if (studentPanel) studentPanel.hidden = teachers;
    if (teacherPanel) teacherPanel.classList.toggle('active', teachers);
    if (studentPanel) studentPanel.classList.toggle('active', !teachers);
    if (teacherTab) {
      teacherTab.classList.toggle('active', teachers);
      teacherTab.setAttribute('aria-selected', String(teachers));
    }
    if (studentTab) {
      studentTab.classList.toggle('active', !teachers);
      studentTab.setAttribute('aria-selected', String(!teachers));
    }
  }
  if (teacherTab) teacherTab.addEventListener('click', () => showPeopleTab('teachers'));
  if (studentTab) studentTab.addEventListener('click', () => showPeopleTab('students'));

  const teacherGrid = $('teacherGrid');
  const studentGrid = $('studentGrid');
  let teachersData = [];
  let studentsData = [];

  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map(w => [...w][0] || '').join('') || '👤');
  }
  function photoMarkup(person, type) {
    if (person.photo_url) {
      return `<img class="person-photo" src="${esc(person.photo_url)}" alt="${esc(person.name || 'ছবি')}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false">`;
    }
    return '';
  }
  function teacherCard(person) {
    const image = photoMarkup(person, 'teachers');
    const avatar = `<div class="teacher-avatar person-avatar" ${person.photo_url ? 'hidden' : ''}>${esc(initials(person.name))}</div>`;
    return `<article class="teacher-card person-card">
      <div class="person-photo-wrap">${image}${avatar}</div>
      <h3>${esc(person.name)}</h3>
      ${person.designation ? `<p class="teacher-dept">${esc(person.designation)}</p>` : ''}
      ${person.subject ? `<p class="person-meta">বিষয়: ${esc(person.subject)}</p>` : ''}
      ${person.phone ? `<p class="person-meta">মোবাইল: ${esc(person.phone)}</p>` : ''}
    </article>`;
  }
  function studentCard(person) {
    const image = photoMarkup(person, 'students');
    const avatar = `<div class="teacher-avatar person-avatar" ${person.photo_url ? 'hidden' : ''}>${esc(initials(person.name))}</div>`;
    return `<article class="teacher-card student-card person-card">
      <div class="person-photo-wrap">${image}${avatar}</div>
      <h3>${esc(person.name)}</h3>
      ${person.class_name ? `<p class="teacher-dept">শ্রেণি: ${esc(person.class_name)}</p>` : ''}
      ${person.roll ? `<p class="person-meta">রোল: ${esc(person.roll)}</p>` : ''}
    </article>`;
  }
  function renderPeople(type) {
    const isTeacher = type === 'teachers';
    const data = isTeacher ? teachersData : studentsData;
    const grid = isTeacher ? teacherGrid : studentGrid;
    const search = $(isTeacher ? 'teacherSearch' : 'studentSearch');
    const empty = $(isTeacher ? 'teacherEmpty' : 'studentEmpty');
    const query = (search?.value || '').trim().toLocaleLowerCase('bn');
    const filtered = data.filter((person) => {
      const searchable = isTeacher
        ? [person.name, person.designation, person.subject, person.phone]
        : [person.name, person.class_name, person.roll];
      return searchable.join(' ').toLocaleLowerCase('bn').includes(query);
    });
    text(isTeacher ? 'teacherCount' : 'studentCount', `${filtered.length} জন`);
    if (grid) grid.innerHTML = filtered.map(isTeacher ? teacherCard : studentCard).join('');
    if (empty) {
      empty.hidden = filtered.length > 0;
      empty.textContent = data.length === 0
        ? (isTeacher ? 'শিক্ষকের তথ্য এখনো যোগ করা হয়নি।' : 'শিক্ষার্থীর তথ্য এখনো যোগ করা হয়নি।')
        : 'আপনার খোঁজের সঙ্গে মেলে এমন তথ্য পাওয়া যায়নি।';
    }
  }
  async function loadPeople(type) {
    const isTeacher = type === 'teachers';
    const empty = $(isTeacher ? 'teacherEmpty' : 'studentEmpty');
    if (empty) { empty.hidden = false; empty.textContent = 'তথ্য লোড হচ্ছে…'; }
    try {
      const result = await api(`/api/${type}`);
      if (!Array.isArray(result)) throw new Error('সঠিক তথ্য পাওয়া যায়নি।');
      if (isTeacher) teachersData = result; else studentsData = result;
      renderPeople(type);
    } catch (error) {
      if (empty) { empty.hidden = false; empty.textContent = 'তথ্য লোড করা যায়নি। ইন্টারনেট সংযোগ দিয়ে আবার চেষ্টা করুন।'; }
      console.error(`/${type} load failed:`, error);
      text(isTeacher ? 'teacherCount' : 'studentCount', '—');
    }
  }
  const teacherSearch = $('teacherSearch');
  const studentSearch = $('studentSearch');
  if (teacherSearch) teacherSearch.addEventListener('input', () => renderPeople('teachers'));
  if (studentSearch) studentSearch.addEventListener('input', () => renderPeople('students'));

  // Notices from the Worker API. Supports multiple common notice-list IDs.
  const noticeTargets = [
    $('noticeList'), $('noticesList'), $('noticeGrid'), $('noticesGrid'),
    $('noticeCards'), $('noticeItems'), $('noticesContainer'), $('noticeBoard')
  ].filter(Boolean);
  // The homepage headline ticker is managed by /api/settings and is intentionally
  // independent from the notice board. Do not populate it from /api/notices.
  const ticker = null;
  function formatDate(value) {
    if (!value) return '';
    const raw = String(value);
    // Keep manually entered Bengali dates/labels as supplied.
    if (!/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw;
    try { return new Intl.DateTimeFormat('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(raw)); }
    catch { return raw; }
  }
  async function loadTickerLabel() {
    const label = $('tickerLabel');
    if (!label) return;
    try {
      const settings = await api('/api/settings/public');
      label.textContent = String(settings.ticker_label || 'শিরোনাম').slice(0, 40);
      const track = $('tickerTrack');
      const tickerText = $('tickerText');
      if (tickerText) tickerText.textContent = String(settings.ticker_text || 'এখানে শিরোনামের লেখা প্রদর্শিত হবে।').slice(0, 3000);
      if (track) track.classList.add('has-notice');
    } catch (error) {
      label.textContent = 'শিরোনাম';
    }
  }
  loadTickerLabel();

  async function loadNotices() {
    if (!noticeTargets.length && !ticker) return;
    try {
      const items = await api('/api/notices');
      const list = Array.isArray(items) ? items : [];
      const tickerText = list.length
        ? list.map(item => item.title).filter(Boolean).join('  •  ')
        : 'বর্তমানে কোনো নোটিশ প্রকাশ করা হয়নি।';
      if (ticker) ticker.textContent = tickerText;
      noticeTargets.forEach((target) => {
        target.innerHTML = list.length ? list.map(item => `
          <article class="notice-card">
            <div class="notice-date">${esc(formatDate(item.date))}</div>
            <h3>${esc(item.title)}</h3>
            <p>${esc(item.body).replace(/\n/g, '<br>')}</p>
          </article>`).join('') : '<p class="notice-empty">বর্তমানে কোনো নোটিশ প্রকাশ করা হয়নি।</p>';
      });
    } catch (error) {
      console.error('Notices load failed:', error);
      if (ticker) ticker.textContent = 'নোটিশ লোড করা যায়নি।';
      noticeTargets.forEach((target) => { target.innerHTML = '<p class="notice-empty">নোটিশ লোড করা যায়নি। পরে আবার চেষ্টা করুন।</p>'; });
    }
  }

  // Admission form: store submissions in the Cloudflare D1-backed Worker API.
  const admissionForm = $('admissionForm') || $('admission-form');
  if (admissionForm) {
    admissionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const msg = $('formMsg') || $('admissionMsg') || $('admissionMessage') || $('formMessage');
      const values = Object.fromEntries(new FormData(admissionForm).entries());
      try {
        const response = await fetch('/api/admissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(values) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `আবেদন জমা হয়নি (${response.status})`);
        if (msg) msg.textContent = 'আপনার ভর্তি আবেদন সফলভাবে জমা হয়েছে। একাডেমি থেকে যোগাযোগ করা হবে।';
        admissionForm.reset();
      } catch (error) {
        if (msg) msg.textContent = 'আবেদন জমা হয়নি: ' + error.message;
      }
    });
  }

  // Smooth scrolling for in-page links.
  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.querySelector(link.getAttribute('href'));
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (target.id) history.replaceState(null, '', `#${target.id}`);
      }
    });
  });

  // Start API loads independently so one missing endpoint doesn't stop the page.
  loadPeople('teachers');
  loadPeople('students');
  loadNotices();
})();
