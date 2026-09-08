const root=document.documentElement,nav=document.querySelector('.site-nav'),menu=document.querySelector('.menu-toggle'),theme=document.querySelector('.theme-toggle');
const saved=localStorage.getItem('blog-theme');if(saved==='dark'||(!saved&&matchMedia('(prefers-color-scheme:dark)').matches))root.dataset.theme='dark';
function themeLabel(){theme?.setAttribute('aria-label',root.dataset.theme==='dark'?'라이트 모드로 변경':'다크 모드로 변경')}themeLabel();
theme?.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'':'dark';localStorage.setItem('blog-theme',root.dataset.theme||'light');themeLabel()});
menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open);document.body.classList.toggle('nav-open',open)});
document.querySelectorAll('.site-nav a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');document.body.classList.remove('nav-open')}));
addEventListener('scroll',()=>document.querySelector('.site-header')?.classList.toggle('scrolled',scrollY>8),{passive:true});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());

function validateForm(form){let valid=true;form.querySelectorAll('[required]').forEach(field=>{const wrap=field.closest('.form-field'),error=wrap?.querySelector('.error-message');let msg='';if(field.type==='checkbox'&&!field.checked)msg='동의가 필요합니다.';else if(!field.value.trim())msg='필수 입력 항목입니다.';else if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value))msg='올바른 이메일 주소를 입력해 주세요.';else if(field.minLength>0&&field.value.length<field.minLength)msg=`${field.minLength}자 이상 입력해 주세요.`;wrap?.classList.toggle('invalid',!!msg);if(error)error.textContent=msg;field.setAttribute('aria-invalid',String(!!msg));if(msg)valid=false});return valid}
document.querySelectorAll('[data-demo-form]').forEach(form=>form.addEventListener('submit',e=>{e.preventDefault();const status=form.querySelector('.form-status');if(!validateForm(form)){if(status)status.textContent='입력 내용을 다시 확인해 주세요.';form.querySelector('.invalid input,.invalid textarea')?.focus();return}if(status)status.textContent=form.dataset.success||'완료되었습니다.';form.reset()}));

const filters=document.querySelectorAll('.filter-button'),cards=document.querySelectorAll('[data-category]'),search=document.querySelector('#post-search');
function filterPosts(category='전체',query=''){cards.forEach(card=>{const categoryMatch=category==='전체'||card.dataset.category===category;const textMatch=card.textContent.toLowerCase().includes(query.toLowerCase());card.classList.toggle('hidden',!categoryMatch||!textMatch)})}
filters.forEach(btn=>btn.addEventListener('click',()=>{filters.forEach(b=>b.classList.remove('active'));btn.classList.add('active');filterPosts(btn.dataset.filter,search?.value||'')}));
search?.addEventListener('input',()=>filterPosts(document.querySelector('.filter-button.active')?.dataset.filter||'전체',search.value));

const editor=document.querySelector('#editor-body');document.querySelectorAll('[data-insert]').forEach(btn=>btn.addEventListener('click',()=>{if(!editor)return;const [start,end]=[editor.selectionStart,editor.selectionEnd],mark=btn.dataset.insert,selected=editor.value.slice(start,end)||'텍스트';editor.setRangeText(`${mark}${selected}${mark}`,start,end,'select');editor.focus()}));
document.querySelector('#draft-button')?.addEventListener('click',()=>{const status=document.querySelector('.form-status');localStorage.setItem('blog-draft',JSON.stringify({title:document.querySelector('#post-title')?.value,body:editor?.value}));if(status)status.textContent='임시저장했습니다.'});
