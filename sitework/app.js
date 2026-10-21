const menuBtn=document.getElementById('menuBtn'),nav=document.getElementById('nav');
menuBtn?.addEventListener('click',()=>nav.classList.toggle('open'));
document.getElementById('year').textContent=new Date().getFullYear();
const noticeList=document.getElementById('noticeList');
let savedNotices=[];
try{
  savedNotices=JSON.parse(localStorage.getItem('schoolDemoNotices')||'[]');
  if(savedNotices.length && noticeList){noticeList.innerHTML=savedNotices.map(n=>`<article class="notice"><span class="date">${escapeText(n.date||'নোটিশ')}</span><h3>${escapeText(n.title)}</h3><p>${escapeText(n.body)}</p></article>`).join('')}
}catch(e){}
const tickerText=document.getElementById('tickerText');
const tickerTrack=document.getElementById('tickerTrack');
if(tickerText && savedNotices.length){
  tickerText.textContent=savedNotices.map(n=>[n.title,n.body].filter(Boolean).join(' — ')).join('　　 • 　　 ');
  tickerTrack?.classList.add('has-notice');
}
function escapeText(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
document.getElementById('admissionForm')?.addEventListener('submit',e=>{e.preventDefault();document.getElementById('formMsg').textContent='এটি শুধু নমুনা ফরম। কোনো তথ্য সার্ভারে পাঠানো হয়নি। ভর্তি নিশ্চিত করতে স্কুল অফিসে যোগাযোগ করুন।';e.target.reset()});

const teacherSearch=document.getElementById('teacherSearch');
const teacherCards=[...document.querySelectorAll('.teacher-card')];
const teacherCount=document.getElementById('teacherCount');
const teacherEmpty=document.getElementById('teacherEmpty');
function filterTeachers(){const q=(teacherSearch?.value||'').trim().toLocaleLowerCase('bn');let visible=0;teacherCards.forEach(card=>{const match=(card.dataset.search+' '+card.innerText).toLocaleLowerCase('bn').includes(q);card.hidden=!match;if(match)visible++});if(teacherCount)teacherCount.textContent=String(visible);if(teacherEmpty)teacherEmpty.hidden=visible!==0}
teacherSearch?.addEventListener('input',filterTeachers);
teacherSearch?.nextElementSibling?.addEventListener('click',filterTeachers);


// Switch between the two directory categories
const teachersTab=document.getElementById('teachersTab');
const studentsTab=document.getElementById('studentsTab');
const teachersPanel=document.getElementById('teachersPanel');
const studentsPanel=document.getElementById('studentsPanel');
function showDirectoryCategory(category){
  const showTeachers=category==='teachers';
  if(teachersPanel) teachersPanel.hidden=!showTeachers;
  if(studentsPanel) studentsPanel.hidden=showTeachers;
  if(teachersTab){teachersTab.classList.toggle('active',showTeachers);teachersTab.setAttribute('aria-selected',String(showTeachers));}
  if(studentsTab){studentsTab.classList.toggle('active',!showTeachers);studentsTab.setAttribute('aria-selected',String(!showTeachers));}
}
teachersTab?.addEventListener('click',()=>showDirectoryCategory('teachers'));
studentsTab?.addEventListener('click',()=>showDirectoryCategory('students'));
