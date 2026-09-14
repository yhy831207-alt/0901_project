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

async function setupWriteForm(){
  const form=document.querySelector('.write-layout');
  if(!form)return;
  const status=form.querySelector('.form-status');
  const submit=form.querySelector('[type="submit"]');
  const postId=new URLSearchParams(location.search).get('id');

  if(!authToken()){
    status.textContent='글을 작성하려면 먼저 로그인해 주세요.';
    submit.disabled=true;
    const login=postElement('a','text-link','로그인하기 →');
    login.href=`login.html?next=${encodeURIComponent(location.pathname+location.search)}`;
    status.append(' ',login);
    return;
  }

  if(postId){
    status.textContent='수정할 글을 불러오는 중입니다...';
    try{
      const result=await authRequest('getPost',{id:postId});
      if(!result.success)throw new Error(result.message||'글을 불러오지 못했습니다.');
      const post=result.post;
      form.querySelector('#post-title').value=post.title;
      form.querySelector('#editor-body').value=post.body;
      form.querySelector('#category').value=post.category;
      form.querySelector('#tags').value=post.tags;
      form.querySelector('#summary').value=post.summary;
      const comments=form.querySelector('.publish-card .check-label input');
      if(comments)comments.checked=post.commentsAllowed;
      document.querySelector('.page-hero h1').textContent='기록 수정';
      submit.textContent='수정 완료';
      status.textContent='';
    }catch(error){
      status.textContent=error.message||'글을 불러오지 못했습니다.';
      submit.disabled=true;
      return;
    }
  }

  form.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!validateForm(form)){status.textContent='제목과 본문을 확인해 주세요.';return}
    submit.disabled=true;
    status.textContent=postId?'글을 수정하는 중입니다...':'글을 발행하는 중입니다...';
    try{
      const payload=postPayload(form);
      if(postId)payload.id=postId;
      const result=await authRequest(postId?'updatePost':'createPost',payload);
      if(!result.success)throw new Error(result.message||'글을 저장하지 못했습니다.');
      localStorage.removeItem('blog-draft');
      status.textContent=postId?'글을 수정했습니다.':'글을 발행했습니다.';
      setTimeout(()=>{location.href=`post.html?id=${encodeURIComponent(result.post.id)}`},500);
    }catch(error){
      status.textContent=error.message||'글을 저장하지 못했습니다.';
      submit.disabled=false;
    }
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

async function loadPostDetail(){
  if(!location.pathname.endsWith('post.html'))return;
  const id=new URLSearchParams(location.search).get('id');
  if(!id)return;
  const title=document.querySelector('.article-header h1');
  try{
    const result=await authRequest('getPost',{id:id});
    if(!result.success)throw new Error(result.message||'글을 찾을 수 없습니다.');
    const post=result.post;
    document.title=`${post.title} — 민준의 기록`;
    title.textContent=post.title;
    document.querySelector('.article-header .tag').textContent=`${post.category} · ${post.tags||'기록'}`;
    const author=document.querySelector('.article-meta strong');if(author)author.textContent=post.authorName;
    const date=document.querySelector('.article-meta span');if(date)date.textContent=postDate(post.createdAt);
    renderPostBody(document.querySelector('.article-body'),post.body);
  }catch(error){
    title.textContent=error.message||'글을 찾을 수 없습니다.';
    const body=document.querySelector('.article-body');if(body)body.replaceChildren(postElement('p','muted','삭제되었거나 존재하지 않는 글입니다.'));
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

async function loadPostList(){
  if(!location.pathname.endsWith('posts.html'))return;
  const grid=document.querySelector('.posts-grid');
  if(!grid)return;
  grid.replaceChildren(postElement('p','dynamic-post-state','게시글을 불러오는 중입니다...'));
  try{
    const result=await authRequest('listPosts');
    if(!result.success)throw new Error(result.message||'게시글을 불러오지 못했습니다.');
    grid.replaceChildren();
    if(!result.posts.length)grid.appendChild(postElement('p','dynamic-post-state','아직 발행된 글이 없습니다.'));
    else result.posts.forEach(post=>grid.appendChild(createPostCard(post)));
    filterPosts(document.querySelector('.filter-button.active')?.dataset.filter||'전체',document.querySelector('#post-search')?.value||'');
  }catch(error){grid.replaceChildren(postElement('p','dynamic-post-state',error.message||'게시글을 불러오지 못했습니다.'))}
}

async function loadHomePostList(){
  if(!(location.pathname.endsWith('index.html')||location.pathname.endsWith('/')))return;
  const grid=document.querySelector('.featured-grid');
  if(!grid)return;
  const heading=document.querySelector('.section-head');
  const eyebrow=heading?.querySelector('.eyebrow'),title=heading?.querySelector('h2');
  if(eyebrow)eyebrow.textContent='Latest posts';
  if(title)title.textContent='최근 작성된 글';
  grid.replaceChildren(postElement('p','dynamic-post-state','게시글을 불러오는 중입니다...'));
  try{
    const result=await authRequest('listPosts');
    if(!result.success)throw new Error(result.message||'게시글을 불러오지 못했습니다.');
    grid.replaceChildren();
    if(!result.posts.length){grid.appendChild(postElement('p','dynamic-post-state','아직 발행된 글이 없습니다.'));return}
    result.posts.slice(0,5).forEach((post,index)=>{
      const layoutClass=index===0?'featured':index===1?'tall':'';
      grid.appendChild(createPostCard(post,layoutClass));
    });
  }catch(error){grid.replaceChildren(postElement('p','dynamic-post-state',error.message||'게시글을 불러오지 못했습니다.'))}
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
      item.remove();status.textContent='글을 삭제했습니다.';
      if(!list.children.length)list.appendChild(postElement('p','empty-posts','작성한 글이 없습니다.'));
    }catch(error){status.textContent=error.message||'삭제하지 못했습니다.';remove.disabled=false}
  });
  actions.append(view,edit,remove);item.append(content,actions);
  return item;
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
  try{
    const result=await authRequest('listMyPosts',{token:authToken()});
    if(!result.success)throw new Error(result.message||'글 목록을 불러오지 못했습니다.');
    status.textContent='';
    if(!result.posts.length)list.appendChild(postElement('p','empty-posts','작성한 글이 없습니다.'));
    else result.posts.forEach(post=>list.appendChild(createManageItem(post,list,status)));
  }catch(error){status.textContent=error.message||'글 목록을 불러오지 못했습니다.'}
}

setupWriteForm();
loadPostDetail();
loadPostList();
loadHomePostList();
setupProfilePosts();
