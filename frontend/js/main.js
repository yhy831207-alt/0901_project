const root = document.documentElement;
const header = document.querySelector('.site-header');
const nav = document.querySelector('.site-nav');
const menuToggle = document.querySelector('.menu-toggle');
const themeToggle = document.querySelector('.theme-toggle');
const navLinks = [...document.querySelectorAll('.site-nav a')];
const sections = [...document.querySelectorAll('main section[id]')];

const savedTheme = localStorage.getItem('profile-theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
if (savedTheme === 'dark' || (!savedTheme && prefersDark)) root.dataset.theme = 'dark';

function updateThemeLabel() {
  const isDark = root.dataset.theme === 'dark';
  themeToggle.setAttribute('aria-label', isDark ? '라이트 모드로 변경' : '다크 모드로 변경');
}

updateThemeLabel();

themeToggle.addEventListener('click', () => {
  const isDark = root.dataset.theme === 'dark';
  if (isDark) delete root.dataset.theme;
  else root.dataset.theme = 'dark';
  localStorage.setItem('profile-theme', isDark ? 'light' : 'dark');
  updateThemeLabel();
});

function closeMenu() {
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', '메뉴 열기');
  document.body.classList.remove('nav-open');
}

menuToggle.addEventListener('click', () => {
  const willOpen = !nav.classList.contains('open');
  nav.classList.toggle('open', willOpen);
  menuToggle.setAttribute('aria-expanded', String(willOpen));
  menuToggle.setAttribute('aria-label', willOpen ? '메뉴 닫기' : '메뉴 열기');
  document.body.classList.toggle('nav-open', willOpen);
});

navLinks.forEach((link) => link.addEventListener('click', closeMenu));
window.addEventListener('resize', () => { if (window.innerWidth > 900) closeMenu(); });

const activeSectionObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => link.classList.toggle('active', link.hash === `#${entry.target.id}`));
  });
}, { rootMargin: '-35% 0px -55%', threshold: 0 });

if (navLinks.some((link) => link.hash)) {
  sections.forEach((section) => activeSectionObserver.observe(section));
}

const revealObserver = new IntersectionObserver((entries, observer) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    entry.target.classList.add('visible');
    observer.unobserve(entry.target);
  });
}, { threshold: 0.12 });

document.querySelectorAll('.reveal').forEach((element) => revealObserver.observe(element));
window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 12), { passive: true });

const form = document.querySelector('#contact-form');
const formStatus = form?.querySelector('.form-status');
const fields = form ? [...form.querySelectorAll('input, textarea')] : [];

function validateField(field) {
  const wrapper = field.closest('.form-field');
  const error = wrapper.querySelector('.error-message');
  let message = '';
  if (!field.value.trim()) message = '필수 입력 항목입니다.';
  else if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value)) message = '올바른 이메일 주소를 입력해 주세요.';
  wrapper.classList.toggle('invalid', Boolean(message));
  error.textContent = message;
  field.setAttribute('aria-invalid', String(Boolean(message)));
  return !message;
}

fields.forEach((field) => field.addEventListener('blur', () => validateField(field)));

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  const isValid = fields.map(validateField).every(Boolean);
  if (!isValid) {
    formStatus.textContent = '입력 내용을 다시 확인해 주세요.';
    form.querySelector('.invalid input, .invalid textarea')?.focus();
    return;
  }
  formStatus.textContent = '폼 전송을 사용하려면 백엔드 또는 폼 서비스를 연결해 주세요.';
});

document.querySelector('#current-year').textContent = new Date().getFullYear();
