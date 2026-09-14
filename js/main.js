const root=document.documentElement,nav=document.querySelector('.site-nav'),menu=document.querySelector('.menu-toggle'),theme=document.querySelector('.theme-toggle');
const AUTH_API_URL='https://script.google.com/macros/s/AKfycbw6HUk018GecllKQH-zcxX7nS6vEFflpnS4bzy4QXEtso_HplPFpoR_4Nep7c2FAoav/exec';
const AUTH_VERIFY_TTL=5*60*1000;
const saved=localStorage.getItem('blog-theme');if(saved==='dark'||(!saved&&matchMedia('(prefers-color-scheme:dark)').matches))root.dataset.theme='dark';
function themeLabel(){theme?.setAttribute('aria-label',root.dataset.theme==='dark'?'라이트 모드로 변경':'다크 모드로 변경')}themeLabel();
theme?.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'':'dark';localStorage.setItem('blog-theme',root.dataset.theme||'light');themeLabel()});
menu?.addEventListener('click',()=>{const open=nav.classList.toggle('open');menu.setAttribute('aria-expanded',open);document.body.classList.toggle('nav-open',open)});
document.querySelectorAll('.site-nav a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');document.body.classList.remove('nav-open')}));
addEventListener('scroll',()=>document.querySelector('.site-header')?.classList.toggle('scrolled',scrollY>8),{passive:true});
const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.08});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));
document.querySelectorAll('[data-year]').forEach(el=>el.textContent=new Date().getFullYear());

function validateForm(form){let valid=true;form.querySelectorAll('[required]').forEach(field=>{const wrap=field.closest('.form-field'),error=wrap?.querySelector('.error-message');let msg='';if(field.type==='checkbox'&&!field.checked)msg='동의가 필요합니다.';else if(!field.value.trim())msg='필수 입력 항목입니다.';else if(field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(field.value))msg='올바른 이메일 주소를 입력해 주세요.';else if(field.minLength>0&&field.value.length<field.minLength)msg=`${field.minLength}자 이상 입력해 주세요.`;wrap?.classList.toggle('invalid',!!msg);if(error)error.textContent=msg;field.setAttribute('aria-invalid',String(!!msg));if(msg)valid=false});return valid}
async function authRequest(action,payload={}){const body=new URLSearchParams({action,...payload});const response=await fetch(AUTH_API_URL,{method:'POST',body,redirect:'follow'});if(!response.ok)throw new Error('인증 서버에 연결할 수 없습니다.');return response.json()}
function authToken(){return sessionStorage.getItem('blog-auth-token')||localStorage.getItem('blog-auth-token')||''}
function saveAuthToken(token,remember){sessionStorage.removeItem('blog-auth-token');localStorage.removeItem('blog-auth-token');localStorage.removeItem('blog-my-posts-cache');(remember?localStorage:sessionStorage).setItem('blog-auth-token',token);sessionStorage.setItem('blog-auth-verified-at',String(Date.now()))}
function clearAuthToken(){sessionStorage.removeItem('blog-auth-token');localStorage.removeItem('blog-auth-token');sessionStorage.removeItem('blog-auth-verified-at');localStorage.removeItem('blog-auth-user');localStorage.removeItem('blog-my-posts-cache')}

document.querySelectorAll('.auth-card[data-auth-form]').forEach(form=>form.addEventListener('submit',async e=>{e.preventDefault();const status=form.querySelector('.form-status'),button=form.querySelector('[type="submit"]'),isSignup=location.pathname.endsWith('signup.html');if(!validateForm(form)){status.textContent='입력 내용을 다시 확인해 주세요.';form.querySelector('.invalid input,.invalid textarea')?.focus();return}const payload=isSignup?{email:form.querySelector('#email').value,password:form.querySelector('#password').value,name:form.querySelector('#name').value,nickname:form.querySelector('#nickname').value}:{email:form.querySelector('#email').value,password:form.querySelector('#password').value};status.textContent='처리 중입니다...';button.disabled=true;try{const result=await authRequest(isSignup?'signup':'login',payload);if(!result.success)throw new Error(result.message||'요청을 처리하지 못했습니다.');if(isSignup){status.textContent='회원가입이 완료되었습니다. 로그인 페이지로 이동합니다.';setTimeout(()=>location.href='login.html',900)}else{const remember=form.querySelector('input[type="checkbox"]')?.checked;saveAuthToken(result.token,remember);localStorage.setItem('blog-auth-user',JSON.stringify(result.user));status.textContent=`${result.user.nickname}님, 환영합니다. 잠시 후 이동합니다.`;setTimeout(()=>location.href='profile.html',800)}}catch(error){status.textContent=error.message||'인증 서버 오류가 발생했습니다.'}finally{button.disabled=false}}));

function cachedAuthUser(){try{return JSON.parse(localStorage.getItem('blog-auth-user')||'null')}catch(error){return null}}
function createAuthLink(label,href,className){const link=document.createElement('a');link.textContent=label;link.href=href;link.className=className;return link}
function authContainers(){
  const headerActions=document.querySelector('.header-actions');
  if(!headerActions)return[];
  headerActions.querySelectorAll(':scope > .header-login,:scope > .header-cta').forEach(link=>link.remove());
  let desktop=headerActions.querySelector('[data-auth-actions]');
  if(!desktop){desktop=document.createElement('div');desktop.className='auth-actions';desktop.dataset.authActions='';headerActions.insertBefore(desktop,headerActions.querySelector('.theme-toggle'))}
  let mobile=nav?.querySelector('[data-mobile-auth-actions]');
  if(!mobile&&nav){mobile=document.createElement('div');mobile.className='mobile-auth-actions';mobile.dataset.mobileAuthActions='';nav.appendChild(mobile)}
  return[desktop,mobile].filter(Boolean)
}
function renderAuthHeader(user){
  authContainers().forEach(container=>{
    container.replaceChildren();
    if(user){
      const logout=document.createElement('button');logout.type='button';logout.className='header-login auth-logout';logout.textContent='로그아웃';logout.title=`${user.nickname||user.name||'회원'}님으로 로그인 중`;
      logout.addEventListener('click',async()=>{logout.disabled=true;logout.textContent='처리 중';try{await authRequest('logout',{token:authToken()})}catch(error){}finally{clearAuthToken();renderAuthHeader(null);location.href='index.html'}});
      container.append(logout,createAuthLink('프로필','profile.html','header-cta'));
    }else container.append(createAuthLink('로그인','login.html','header-login'),createAuthLink('회원가입','signup.html','header-cta'));
    const writeLink=createAuthLink('글쓰기','write.html','header-write');
    if(location.pathname.endsWith('write.html')){writeLink.classList.add('active');writeLink.setAttribute('aria-current','page')}
    container.append(writeLink);
  })
  if(user&&location.pathname.endsWith('profile.html')){
    const panelName=document.querySelector('.profile-panel h2'),panelInfo=document.querySelector('.profile-panel p'),profileTitle=document.querySelector('.profile-content h1');
    if(panelName)panelName.textContent=user.nickname||user.name||'회원';
    if(panelInfo)panelInfo.textContent=[user.name,user.email].filter(Boolean).join(' · ');
    if(profileTitle)profileTitle.textContent=`${user.nickname||user.name||'회원'}님의 프로필`;
  }
}
async function syncAuthHeader(){
  const token=authToken(),cachedUser=cachedAuthUser();
  renderAuthHeader(token?(cachedUser||{nickname:'회원'}):null);
  if(!token)return;
  const verifiedAt=Number(sessionStorage.getItem('blog-auth-verified-at')||0);
  if(cachedUser&&Date.now()-verifiedAt<AUTH_VERIFY_TTL)return;
  try{const result=await authRequest('session',{token});if(!result.success){clearAuthToken();renderAuthHeader(null);return}localStorage.setItem('blog-auth-user',JSON.stringify(result.user));sessionStorage.setItem('blog-auth-verified-at',String(Date.now()));renderAuthHeader(result.user)}catch(error){/* 네트워크 오류 시 저장된 로그인 화면을 유지합니다. */}
}
syncAuthHeader();

const filters=document.querySelectorAll('.filter-button'),search=document.querySelector('#post-search');
function filterPosts(category='전체',query=''){document.querySelectorAll('[data-category]').forEach(card=>{const categoryMatch=category==='전체'||card.dataset.category===category;const textMatch=card.textContent.toLowerCase().includes(query.toLowerCase());card.classList.toggle('hidden',!categoryMatch||!textMatch)})}
filters.forEach(btn=>btn.addEventListener('click',()=>{filters.forEach(b=>b.classList.remove('active'));btn.classList.add('active');filterPosts(btn.dataset.filter,search?.value||'')}));
search?.addEventListener('input',()=>filterPosts(document.querySelector('.filter-button.active')?.dataset.filter||'전체',search.value));

const editor=document.querySelector('#editor-body');document.querySelectorAll('[data-insert]').forEach(btn=>btn.addEventListener('click',()=>{if(!editor)return;const [start,end]=[editor.selectionStart,editor.selectionEnd],mark=btn.dataset.insert,selected=editor.value.slice(start,end)||'텍스트';editor.setRangeText(`${mark}${selected}${mark}`,start,end,'select');editor.dispatchEvent(new Event('input',{bubbles:true}));editor.focus()}));
