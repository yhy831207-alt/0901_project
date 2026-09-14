const POSTS_CACHE_KEY='blog-post-list-cache-v1';
const MY_POSTS_CACHE_KEY='blog-my-posts-cache';
const POST_DETAIL_CACHE_PREFIX='blog-post-detail:';
const POST_CACHE_TTL=5*60*1000;

function readPostCache(key,maxAge=POST_CACHE_TTL){
  try{const cached=JSON.parse(localStorage.getItem(key)||'null');return cached&&Date.now()-cached.savedAt<maxAge?cached.data:null}catch(error){return null}
}

function writePostCache(key,data){
  try{localStorage.setItem(key,JSON.stringify({savedAt:Date.now(),data:data}))}catch(error){}
}

function clearPublicPostCache(){localStorage.removeItem(POSTS_CACHE_KEY)}

function postElement(tag,className,text){
  const element=document.createElement(tag);
  if(className)element.className=className;
  if(text!==undefined)element.textContent=text;
  return element;
}

function postDate(value){
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'':new Intl.DateTimeFormat('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
}

function postSummary(post){
  if(post.summary)return post.summary;
  const summary=post.body.replace(/\s+/g,' ').slice(0,100);
  return summary+(post.body.length>100?'…':'');
}

function postLink(post,label,className){
  const link=postElement('a',className,label);
  link.href=`post.html?id=${encodeURIComponent(post.id)}`;
  return link;
}

function postPayload(form){
  return {
    token:authToken(),
    title:form.querySelector('#post-title').value,
    body:form.querySelector('#editor-body').value,
    category:form.querySelector('#category').value,
    tags:form.querySelector('#tags').value,
    summary:form.querySelector('#summary').value,
    commentsAllowed:String(form.querySelector('.publish-card .check-label input')?.checked!==false),
  };
}

function fillWriteForm(form,post){
  form.querySelector('#post-title').value=post.title||'';
  form.querySelector('#editor-body').value=post.body||'';
  if(post.category)form.querySelector('#category').value=post.category;
  form.querySelector('#tags').value=post.tags||'';
  form.querySelector('#summary').value=post.summary||'';
  const comments=form.querySelector('.publish-card .check-label input');
  if(comments&&post.commentsAllowed!==undefined)comments.checked=post.commentsAllowed;
}

function storeWriteDraft(form,key){
  const payload=postPayload(form);delete payload.token;
  writePostCache(key,payload);
}

function updateMyPostCache(post){
  const posts=readPostCache(MY_POSTS_CACHE_KEY,Infinity)||[];
  const next=[post].concat(posts.filter(item=>item.id!==post.id));
  writePostCache(MY_POSTS_CACHE_KEY,next);
}

async function setupWriteForm(){
  const form=document.querySelector('.write-layout');
  if(!form)return;
  const status=form.querySelector('.form-status');
  const submit=form.querySelector('[type="submit"]');
  const postId=new URLSearchParams(location.search).get('id');
  const draftKey=postId?`blog-edit-draft:${postId}`:'blog-draft';
  const draft=readPostCache(draftKey,Infinity);
  if(draft)fillWriteForm(form,draft);
  const draftButton=document.querySelector('#draft-button');
  const draftIndicator=postElement('small','draft-save-status',draft?'임시저장 내용 복원됨':'');
  draftButton?.after(draftIndicator);

  let draftTimer;
  form.addEventListener('input',()=>{clearTimeout(draftTimer);draftIndicator.textContent='저장 중...';draftTimer=setTimeout(()=>{storeWriteDraft(form,draftKey);draftIndicator.textContent='자동 임시저장됨'},350)});
  draftButton?.addEventListener('click',()=>{storeWriteDraft(form,draftKey);draftIndicator.textContent='임시저장됨';status.textContent='현재 내용을 임시저장했습니다.'});

  if(!authToken()){
    status.textContent=draft?'임시저장한 내용을 복원했습니다. 발행하려면 로그인해 주세요.':'글을 작성하려면 먼저 로그인해 주세요.';
    submit.disabled=true;
    const login=postElement('a','text-link','로그인하기 →');
    login.href=`login.html?next=${encodeURIComponent(location.pathname+location.search)}`;
    status.append(' ',login);
    return;
  }

  if(postId){
    document.querySelector('.page-hero h1').textContent='기록 수정';submit.textContent='수정 완료';
    const cached=readPostCache(POST_DETAIL_CACHE_PREFIX+postId,Infinity);
    if(cached&&!draft){fillWriteForm(form,cached);status.textContent='저장된 글을 먼저 표시했습니다.'}
    if(!cached&&!draft)submit.disabled=true;
    authRequest('getPost',{id:postId}).then(result=>{
      if(!result.success)throw new Error(result.message||'글을 불러오지 못했습니다.');
      writePostCache(POST_DETAIL_CACHE_PREFIX+postId,result.post);
      if(!draft)fillWriteForm(form,result.post);
      status.textContent=draft?'임시저장한 수정 내용을 복원했습니다.':'';submit.disabled=false;
    }).catch(error=>{status.textContent=error.message||'글을 불러오지 못했습니다.';if(!cached&&!draft)submit.disabled=true});
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!validateForm(form)){status.textContent='제목과 본문을 확인해 주세요.';return}
    submit.disabled=true;storeWriteDraft(form,draftKey);
    status.textContent=postId?'글을 수정하는 중입니다...':'글을 발행하는 중입니다...';
    try{
      const payload=postPayload(form);if(postId)payload.id=postId;
      const result=await authRequest(postId?'updatePost':'createPost',payload);
      if(!result.success)throw new Error(result.message||'글을 저장하지 못했습니다.');
      localStorage.removeItem(draftKey);clearPublicPostCache();
      writePostCache(POST_DETAIL_CACHE_PREFIX+result.post.id,result.post);updateMyPostCache(result.post);
      status.textContent=postId?'글을 수정했습니다.':'글을 발행했습니다.';
      setTimeout(()=>{location.href=`post.html?id=${encodeURIComponent(result.post.id)}`},300);
    }catch(error){status.textContent=error.message||'글을 저장하지 못했습니다.';submit.disabled=false}
  });
}

function renderPostBody(container,body){
  container.replaceChildren();
  body.split(/\n{2,}/).forEach(block=>{
    const value=block.trim();
    if(!value)return;
    if(value.startsWith('## '))container.appendChild(postElement('h2','',value.slice(3)));
    else{const paragraph=postElement('p','',value);paragraph.style.whiteSpace='pre-wrap';container.appendChild(paragraph)}
  });
  const actions=postElement('div','article-actions');
  const back=postElement('a','text-link','← 모든 글');back.href='posts.html';
  actions.appendChild(back);
  container.appendChild(actions);
}

function renderPostDetail(post){
  document.title=`${post.title} — 민준의 기록`;
  document.querySelector('.article-header h1').textContent=post.title;
  document.querySelector('.article-header .tag').textContent=`${post.category} · ${post.tags||'기록'}`;
  const author=document.querySelector('.article-meta strong');if(author)author.textContent=post.authorName;
  const date=document.querySelector('.article-meta span');if(date)date.textContent=postDate(post.createdAt);
  renderPostBody(document.querySelector('.article-body'),post.body);
}

async function loadPostDetail(){
  if(!location.pathname.endsWith('post.html'))return;
  const id=new URLSearchParams(location.search).get('id');
  const title=document.querySelector('.article-header h1');
  if(!id){
    title.textContent='선택된 게시글이 없습니다.';
    const body=document.querySelector('.article-body');
    if(body){body.replaceChildren();const link=postElement('a','button button-primary','모든 글 보기');link.href='posts.html';body.appendChild(link)}
    return;
  }
  const cacheKey=POST_DETAIL_CACHE_PREFIX+id;
  const cached=readPostCache(cacheKey,Infinity);
  if(cached)renderPostDetail(cached);
  if(readPostCache(cacheKey))return;
  try{
    const result=await authRequest('getPost',{id:id});
    if(!result.success)throw new Error(result.message||'글을 찾을 수 없습니다.');
    writePostCache(cacheKey,result.post);renderPostDetail(result.post);
  }catch(error){
    if(!cached){title.textContent=error.message||'글을 찾을 수 없습니다.';const body=document.querySelector('.article-body');if(body)body.replaceChildren(postElement('p','muted','삭제되었거나 존재하지 않는 글입니다.'))}
  }
}

function createPostCard(post,layoutClass=''){
  const card=postElement('article',`post-card${layoutClass?' '+layoutClass:''}`);card.dataset.category=post.category;
  const link=postLink(post,'','');
  const colors={디자인:'thumb-green',개발:'thumb-cream',일상:'thumb-blue'};
  const thumb=postElement('div',`post-thumb ${colors[post.category]||'thumb-coral'}`);
  thumb.appendChild(postElement('span','thumb-label',post.category||'기록'));
  const body=postElement('div','post-card-body');
  body.append(postElement('h3','',post.title),postElement('p','',postSummary(post)));
  const meta=postElement('div','post-meta');meta.append(postElement('span','',postDate(post.createdAt)),postElement('span','',post.authorName));
  body.appendChild(meta);link.append(thumb,body);card.appendChild(link);
  return card;
}

function renderPostList(grid,posts){
  grid.replaceChildren();
  if(!posts.length)grid.appendChild(postElement('p','dynamic-post-state','아직 발행된 글이 없습니다.'));
  else posts.forEach(post=>grid.appendChild(createPostCard(post)));
  filterPosts(document.querySelector('.filter-button.active')?.dataset.filter||'전체',document.querySelector('#post-search')?.value||'');
}

async function loadPostList(){
  if(!location.pathname.endsWith('posts.html'))return;
  const grid=document.querySelector('.posts-grid');
  if(!grid)return;
  const cached=readPostCache(POSTS_CACHE_KEY,Infinity);
  if(cached)renderPostList(grid,cached);else grid.replaceChildren(postElement('p','dynamic-post-state','게시글을 불러오는 중입니다...'));
  if(readPostCache(POSTS_CACHE_KEY))return;
  try{
    const result=await authRequest('listPosts');
    if(!result.success)throw new Error(result.message||'게시글을 불러오지 못했습니다.');
    writePostCache(POSTS_CACHE_KEY,result.posts);renderPostList(grid,result.posts);
  }catch(error){if(!cached)grid.replaceChildren(postElement('p','dynamic-post-state',error.message||'게시글을 불러오지 못했습니다.'))}
}

function renderHomePostList(grid,posts){
  grid.replaceChildren();
  if(!posts.length){grid.appendChild(postElement('p','dynamic-post-state','아직 발행된 글이 없습니다.'));return}
  posts.slice(0,5).forEach((post,index)=>grid.appendChild(createPostCard(post,index===0?'featured':index===1?'tall':'')));
}

async function loadHomePostList(){
  if(!(location.pathname.endsWith('index.html')||location.pathname.endsWith('/')))return;
  const grid=document.querySelector('.featured-grid');
  if(!grid)return;
  const heading=document.querySelector('.section-head');
  const eyebrow=heading?.querySelector('.eyebrow'),title=heading?.querySelector('h2');
  if(eyebrow)eyebrow.textContent='Latest posts';
  if(title)title.textContent='최근 작성된 글';
  const cached=readPostCache(POSTS_CACHE_KEY,Infinity);
  if(cached)renderHomePostList(grid,cached);else grid.replaceChildren(postElement('p','dynamic-post-state','게시글을 불러오는 중입니다...'));
  if(readPostCache(POSTS_CACHE_KEY))return;
  try{
    const result=await authRequest('listPosts');
    if(!result.success)throw new Error(result.message||'게시글을 불러오지 못했습니다.');
    writePostCache(POSTS_CACHE_KEY,result.posts);renderHomePostList(grid,result.posts);
  }catch(error){if(!cached)grid.replaceChildren(postElement('p','dynamic-post-state',error.message||'게시글을 불러오지 못했습니다.'))}
}

function createManageItem(post,list,status){
  const item=postElement('article','manage-post-item');
  const content=postElement('div','manage-post-content');
  content.append(postLink(post,post.title,'manage-post-title'),postElement('p','',`${post.category} · ${postDate(post.updatedAt)}`));
  const actions=postElement('div','manage-post-actions');
  const view=postLink(post,'보기','button button-small');
  const edit=postElement('a','button button-small','수정');edit.href=`write.html?id=${encodeURIComponent(post.id)}`;
  const remove=postElement('button','button button-small manage-delete','삭제');remove.type='button';
  remove.addEventListener('click',async()=>{
    if(!confirm(`「${post.title}」 글을 삭제하시겠습니까?`))return;
    remove.disabled=true;status.textContent='글을 삭제하는 중입니다...';
    try{
      const result=await authRequest('deletePost',{token:authToken(),id:post.id});
      if(!result.success)throw new Error(result.message||'삭제하지 못했습니다.');
      const cachedPosts=readPostCache(MY_POSTS_CACHE_KEY,Infinity)||[];
      writePostCache(MY_POSTS_CACHE_KEY,cachedPosts.filter(item=>item.id!==post.id));
      localStorage.removeItem(POST_DETAIL_CACHE_PREFIX+post.id);clearPublicPostCache();
      item.remove();status.textContent='글을 삭제했습니다.';
      if(!list.children.length)list.appendChild(postElement('p','empty-posts','작성한 글이 없습니다.'));
    }catch(error){status.textContent=error.message||'삭제하지 못했습니다.';remove.disabled=false}
  });
  actions.append(view,edit,remove);item.append(content,actions);
  return item;
}

function renderManagePostList(list,status,posts){
  list.replaceChildren();status.textContent='';
  if(!posts.length)list.appendChild(postElement('p','empty-posts','작성한 글이 없습니다.'));
  else posts.forEach(post=>list.appendChild(createManageItem(post,list,status)));
}

async function setupProfilePosts(){
  if(!location.pathname.endsWith('profile.html')||!authToken())return;
  const profile=document.querySelector('.profile-content');
  if(!profile)return;
  const section=postElement('section','my-posts');
  const heading=postElement('div','my-posts-heading');
  heading.append(postElement('h2','','내 글 관리'));
  const create=postElement('a','button button-accent button-small','새 글 작성');create.href='write.html';heading.appendChild(create);
  const status=postElement('p','form-status','글 목록을 불러오는 중입니다...');
  const list=postElement('div','manage-post-list');section.append(heading,status,list);profile.appendChild(section);
  const cached=readPostCache(MY_POSTS_CACHE_KEY,Infinity);
  if(cached)renderManagePostList(list,status,cached);
  if(readPostCache(MY_POSTS_CACHE_KEY))return;
  try{
    const result=await authRequest('listMyPosts',{token:authToken()});
    if(!result.success)throw new Error(result.message||'글 목록을 불러오지 못했습니다.');
    writePostCache(MY_POSTS_CACHE_KEY,result.posts);renderManagePostList(list,status,result.posts);
  }catch(error){if(!cached)status.textContent=error.message||'글 목록을 불러오지 못했습니다.'}
}

setupWriteForm();
loadPostDetail();
loadPostList();
loadHomePostList();
setupProfilePosts();
