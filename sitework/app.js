
const menuBtn = document.getElementById('menuBtn');
const nav = document.getElementById('nav');

menuBtn?.addEventListener('click', () => nav?.classList.toggle('open'));

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

// Safely display text received from the API
function escapeText(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

// Load notices saved by the admin panel from the Worker API
async function loadNotices() {
  const noticeList = document.getElementById('noticeList');
  const tickerText = document.getElementById('tickerText');
  const tickerTrack = document.getElementById('tickerTrack');

  if (!noticeList) return;

  try {
    const response = await fetch('/api/notices', {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Notice API error: ' + response.status);
    }

    const notices = await response.json();

    if (!Array.isArray(notices)) {
      throw new Error('Invalid notice data');
    }

    if (notices.length === 0) {
      noticeList.innerHTML =
        '<article class="notice"><h3>বর্তমানে কোনো নোটিশ নেই</h3><p>নতুন নোটিশ প্রকাশিত হলে এখানে দেখা যাবে।</p></article>';

      if (tickerText) {
        tickerText.textContent = 'বর্তমানে কোনো নতুন নোটিশ নেই।';
      }

      tickerTrack?.classList.remove('has-notice');
      return;
    }

    // Display newest notices returned by the API
    noticeList.innerHTML = notices.map(n => `
      <article class="notice">
        <span class="date">${escapeText(n.date || 'নোটিশ')}</span>
        <h3>${escapeText(n.title || 'নোটিশ')}</h3>
        <p>${escapeText(n.body || '')}</p>
      </article>
    `).join('');

    // Show the notices in the moving ticker
    if (tickerText) {
      tickerText.textContent = notices
        .map(n => [n.title, n.body].filter(Boolean).join(' — '))
        .join('　　 • 　　 ');
    }

    tickerTrack?.classList.add('has-notice');

  } catch (error) {
    console.error('নোটিশ লোড করতে সমস্যা হয়েছে:', error);

    noticeList.innerHTML =
      '<article class="notice"><h3>নোটিশ লোড করা যায়নি</h3><p>অনুগ্রহ করে কিছুক্ষণ পরে আবার চেষ্টা করুন।</p></article>';

    if (tickerText) {
      tickerText.textContent = 'নোটিশ লোড করা যায়নি। পরে আবার চেষ্টা করুন।';
    }

    tickerTrack?.classList.remove('has-notice');
  }
}

loadNotices();

// Admission demo form
document.getElementById('admissionForm')?.addEventListener('submit', e => {
  e.preventDefault();

  const formMsg = document.getElementById('formMsg');

  if (formMsg) {
    formMsg.textContent =
      'এটি শুধু নমুনা ফরম। কোনো তথ্য সার্ভারে পাঠানো হয়নি। ভর্তি নিশ্চিত করতে স্কুল অফিসে যোগাযোগ করুন।';
  }

  e.target.reset();
});

// Teacher search
const teacherSearch = document.getElementById('teacherSearch');
const teacherCards = [...document.querySelectorAll('.teacher-card')];
const teacherCount = document.getElementById('teacherCount');
const teacherEmpty = document.getElementById('teacherEmpty');

function filterTeachers() {
  const q = (teacherSearch?.value || '')
    .trim()
    .toLocaleLowerCase('bn');

  let visible = 0;

  teacherCards.forEach(card => {
    const searchText = (card.dataset.search + ' ' + card.innerText)
      .toLocaleLowerCase('bn');

    const match = searchText.includes(q);
    card.hidden = !match;

    if (match) visible++;
  });

  if (teacherCount) teacherCount.textContent = String(visible);
  if (teacherEmpty) teacherEmpty.hidden = visible !== 0;
}

teacherSearch?.addEventListener('input', filterTeachers);
teacherSearch?.nextElementSibling?.addEventListener('click', filterTeachers);

// Switch between teacher and student categories
const teachersTab = document.getElementById('teachersTab');
const studentsTab = document.getElementById('studentsTab');
const teachersPanel = document.getElementById('teachersPanel');
const studentsPanel = document.getElementById('studentsPanel');

function showDirectoryCategory(category) {
  const showTeachers = category === 'teachers';

  if (teachersPanel) teachersPanel.hidden = !showTeachers;
  if (studentsPanel) studentsPanel.hidden = showTeachers;

  if (teachersTab) {
    teachersTab.classList.toggle('active', showTeachers);
    teachersTab.setAttribute('aria-selected', String(showTeachers));
  }

  if (studentsTab) {
    studentsTab.classList.toggle('active', !showTeachers);
    studentsTab.setAttribute('aria-selected', String(!showTeachers));
  }
}

teachersTab?.addEventListener('click', () => showDirectoryCategory('teachers'));
studentsTab?.addEventListener('click', () => showDirectoryCategory('students'));
