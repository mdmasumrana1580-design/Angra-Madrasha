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

  // Admission form: validate, preview and submit the student photo with admission details.
  const admissionForm = $('admissionForm') || $('admission-form');
  if (admissionForm) {
    const photoInput = $('admissionPhoto');
    const photoPreview = $('admissionPhotoPreview');
    const department = $('admissionDepartment');
    const gradeSelect = $('admissionGrade');
    const grades = { 'নূরানি বিভাগ': ['নূরানি'], 'সাধারণ স্কুল বিভাগ': ['নার্সারি','কেজি','প্রথম শ্রেণি','দ্বিতীয় শ্রেণি','তৃতীয় শ্রেণি','চতুর্থ শ্রেণি','পঞ্চম শ্রেণি'] };
    function updateAdmissionGrades() {
      if (!department || !gradeSelect) return;
      const options = grades[department.value] || grades['নূরানি বিভাগ'];
      gradeSelect.innerHTML = options.map((g) => `<option value="${g}">${g}</option>`).join('');
    }
    if (department) department.addEventListener('change', updateAdmissionGrades);
    if (photoInput && photoPreview) photoInput.addEventListener('change', () => {
      const file = photoInput.files && photoInput.files[0];
      if (!file) { photoPreview.innerHTML = '<span>📷</span><small>ছবি নির্বাচন করলে এখানে দেখা যাবে</small>'; return; }
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 3 * 1024 * 1024) {
        photoInput.value = ''; photoPreview.innerHTML = '<span>⚠️</span><small>JPG, PNG বা WebP ছবি দিন (সর্বোচ্চ ৩ MB)</small>'; return;
      }
      const img = document.createElement('img'); img.alt = 'শিক্ষার্থীর নির্বাচিত ছবি'; img.src = URL.createObjectURL(file);
      photoPreview.replaceChildren(img);
      const caption = document.createElement('small'); caption.textContent = file.name; photoPreview.append(caption);
    });
    admissionForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const msg = $('formMsg') || $('admissionMsg') || $('admissionMessage') || $('formMessage');
      const submitButton = admissionForm.querySelector('[type="submit"]');
      const file = photoInput && photoInput.files && photoInput.files[0];
      if (!file) { if (msg) msg.textContent = 'শিক্ষার্থীর ছবি নির্বাচন করুন।'; return; }
      if (submitButton) submitButton.disabled = true;
      if (msg) msg.textContent = 'আবেদন জমা হচ্ছে, অপেক্ষা করুন…';
      try {
        const values = Object.fromEntries(new FormData(admissionForm).entries());
        const readerData = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
        });
        values.photoData = readerData;
        values.photoType = file.type;
        delete values.photo;
        const response = await fetch('/api/admissions', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' }, body: JSON.stringify(values) });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `আবেদন জমা হয়নি (${response.status})`);
        if (msg) msg.textContent = `আপনার ভর্তি আবেদন সফলভাবে জমা হয়েছে। আবেদন নম্বর: ${result.id}। একাডেমি থেকে যোগাযোগ করা হবে।`;
        admissionForm.reset(); updateAdmissionGrades();
        if (photoPreview) photoPreview.innerHTML = '<span>📷</span><small>ছবি নির্বাচন করলে এখানে দেখা যাবে</small>';
      } catch (error) {
        if (msg) msg.textContent = 'আবেদন জমা হয়নি: ' + error.message;
      } finally { if (submitButton) submitButton.disabled = false; }
    });
  }

  // Homepage banner carousel: admin-managed images, autoplay and two-way swipe.
  (async function initHeroBanners() {
    const image = $('heroBannerImage');
    if (!image) return;
    const fallback = 'banner-academy.jpg';
    let banners = [fallback];
    try {
      const response = await fetch('/api/settings/public', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
      if (response.ok) {
        const settings = await response.json();
        if (settings.hero_banners) {
          const parsed = JSON.parse(settings.hero_banners);
          if (Array.isArray(parsed) && parsed.length) {
            const valid = parsed.map(v => String(v || '').trim()).filter(v => /^(https?:\/\/|\/|\.\/)/i.test(v));
            if (valid.length) banners = valid;
          }
        }
      }
    } catch (_) { /* Keep bundled fallback banner. */ }

    let current = 0;
    let busy = false;
    let timer = null;
    image.src = banners[0];
    if (banners.length < 2) return;

    function showBanner(direction) {
      if (busy || banners.length < 2) return;
      busy = true;
      const next = (current + (direction < 0 ? -1 : 1) + banners.length) % banners.length;
      const nextUrl = banners[next];
      const preload = new Image();
      preload.onload = () => {
        image.classList.remove('slide-in', 'slide-out', 'slide-out-left', 'slide-out-right', 'slide-in-left', 'slide-in-right');
        // Swipe right means previous: animate the old image to the right and bring previous in from left.
        image.classList.add(direction < 0 ? 'slide-out-right' : 'slide-out-left');
        window.setTimeout(() => {
          current = next;
          image.src = nextUrl;
          image.classList.remove('slide-out-left', 'slide-out-right');
          image.classList.add(direction < 0 ? 'slide-in-left' : 'slide-in-right');
          window.setTimeout(() => {
            image.classList.remove('slide-in-left', 'slide-in-right', 'slide-in', 'slide-out');
            busy = false;
          }, 430);
        }, 180);
      };
      preload.onerror = () => {
        busy = false;
      };
      preload.src = nextUrl;
    }

    function restartAutoplay() {
      if (timer) window.clearInterval(timer);
      timer = window.setInterval(() => showBanner(1), 3000);
    }
    restartAutoplay();

    const bannerArea = image.closest('.hero-banner') || image;
    // Keep vertical page scrolling while reliably detecting horizontal swipes.
    bannerArea.style.touchAction = 'pan-y';
    let startX = 0;
    let startY = 0;
    let tracking = false;

    bannerArea.addEventListener('touchstart', (event) => {
      if (!event.touches || event.touches.length !== 1) { tracking = false; return; }
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    bannerArea.addEventListener('touchend', (event) => {
      if (!tracking || !event.changedTouches || !event.changedTouches.length) return;
      tracking = false;
      const dx = event.changedTouches[0].clientX - startX;
      const dy = event.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < 30 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
      // Finger moves left => next; finger moves right => previous.
      showBanner(dx > 0 ? -1 : 1);
      restartAutoplay();
    }, { passive: true });

    // Pointer fallback for browsers/devices that dispatch pointer events but not touch events.
    if (window.PointerEvent) {
      let pointerStart = null;
      bannerArea.addEventListener('pointerdown', (event) => {
        if (event.pointerType === 'mouse' || event.pointerType === 'pen' || event.pointerType === 'touch') {
          pointerStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
        }
      }, { passive: true });
      bannerArea.addEventListener('pointerup', (event) => {
        if (!pointerStart || pointerStart.id !== event.pointerId) return;
        const dx = event.clientX - pointerStart.x;
        const dy = event.clientY - pointerStart.y;
        pointerStart = null;
        if (Math.abs(dx) < 30 || Math.abs(dx) <= Math.abs(dy) * 1.15) return;
        showBanner(dx > 0 ? -1 : 1);
        restartAutoplay();
      }, { passive: true });
      bannerArea.addEventListener('pointercancel', () => { pointerStart = null; }, { passive: true });
    }
  })();

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
