const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => [...root.querySelectorAll(selector)];
function updateThemeButtons() {
  const dark=document.documentElement.dataset.theme==='dark';
  $$('.theme-toggle').forEach(button=>{button.setAttribute('aria-label',dark?'Switch to light theme':'Switch to dark theme');button.title=dark?'Light theme':'Dark theme';});
  $('meta[name="theme-color"]').content=dark?'#1e2630':'#f5f3eb';
}
$$('.theme-toggle').forEach(button=>button.addEventListener('click',()=>{
  const theme=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=theme;
  try{localStorage.setItem('memespace-theme',theme);}catch{}
  updateThemeButtons();document.dispatchEvent(new Event('memespace-theme'));
}));
updateThemeButtons();
const settings=$('#graph-settings');
if(settings){
  let pinned=false;
  $('summary',settings).addEventListener('click',event=>{event.preventDefault();pinned=!pinned;settings.open=pinned;});
  settings.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')settings.open=true;});
  settings.addEventListener('pointerleave',()=>{if(!pinned&&!settings.contains(document.activeElement))settings.open=false;});
  settings.addEventListener('keydown',event=>{if(event.key==='Escape'){pinned=false;settings.open=false;$('summary',settings).focus();}});
  document.addEventListener('pointerdown',event=>{if(!settings.contains(event.target)){pinned=false;settings.open=false;}});
}
export async function api(path, data, method='POST') {
  const response = await fetch(path, data === undefined ? { credentials:'same-origin' } : { method, credentials:'same-origin', headers:{'Content-Type':'application/json'},body:JSON.stringify(data) });
  let result; try { result=await response.json(); } catch { throw new Error('The server could not respond. Please try again.'); }
  if(!response.ok) throw new Error(result.error || 'Something went wrong.');
  return result;
}
let current = null, available = false;
const dialog = $('#auth-dialog'), status = $('#auth-status');
let mode='login', challenge=null, verifier=null;
function showAuth() {
  status.textContent = available ? '' : 'Email sign-in is not configured yet. You can still explore and read.';
  $('#auth-form button[type=submit]').disabled=!available;
  dialog.showModal();
}
$$('[data-signin]').forEach(button=>button.addEventListener('click',showAuth));
$$('[data-close]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
dialog.addEventListener('click',event=>{ if(event.target===dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close(); } });
$$('[data-auth-mode]').forEach(button=>button.addEventListener('click',()=>{
  mode=button.dataset.authMode;
  $$('[data-auth-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  $('#signup-fields').hidden=mode!=='signup';
  $('#auth-form input[name=name]').required=mode==='signup';
  $('#auth-heading').textContent=mode==='signup'?'Make yourself a Mind.':'Welcome back.';
  status.textContent='';
}));
async function busy(button, action, output) {
  button.disabled=true;
  try { await action(); } catch(error) { output.textContent=error.message; } finally { button.disabled=false; }
}
$('#auth-form').addEventListener('submit',event=>{
  event.preventDefault();
  busy($('button[type=submit]',event.target),async()=>{
    status.textContent='Sending your code…';
    const data=Object.fromEntries(new FormData(event.target));
    verifier=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
    const result=await api('/api/auth/request',{...data,purpose:mode,verifier});
    challenge=result.challenge; $('#auth-entry').hidden=true; $('#code-form').hidden=false;
    $('#local-code').hidden=!result.developmentCode;
    $('#local-code').textContent=result.developmentCode?`Local preview code: ${result.developmentCode}. No email was sent.`:'';
    status.textContent=''; $('#code-form input').focus();
  },status);
});
$('#auth-back').addEventListener('click',()=>{ $('#auth-entry').hidden=false; $('#code-form').hidden=true; status.textContent=''; });
$('#code-form').addEventListener('submit',event=>{
  event.preventDefault(); busy($('button[type=submit]',event.target),async()=>{
    status.textContent='Checking…'; await api('/api/auth/verify',{challenge,verifier,code:new FormData(event.target).get('code')}); location.reload();
  },status);
});
export function toast(message) { $('#toast').textContent=message; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').textContent='',4500); }
$$('[data-clone]').forEach(button=>button.addEventListener('click',async()=>{
  const command=`git clone ${button.dataset.clone}`;
  try { await navigator.clipboard.writeText(command); toast('Clone command copied.'); }
  catch { const input=document.createElement('input'); input.value=command; input.readOnly=true; input.setAttribute('aria-label','Clone command'); button.after(input); input.select(); toast('Select and copy the command.'); }
}));
const seededPaths={'mind-ossa':'/minds/ossa','mind-rayray':'/minds/rayray'};
export const mindPath=id=>seededPaths[id] || `/minds?id=${encodeURIComponent(id)}`;

async function initDiscussion() {
  const section=$('#discussion'); if(!section) return;
  const node=section.dataset.node, revision=section.dataset.revision, output=$('#discussion-status');
  const draftKey=`comment:${node}`, commentForm=$('#comment-form');
  try { commentForm.elements.body.value=sessionStorage.getItem(draftKey)||''; } catch {}
  commentForm.elements.body.addEventListener('input',()=>{try {sessionStorage.setItem(draftKey,commentForm.elements.body.value);}catch{}});
  let mine={liked:0,belief:0}, next=null;
  const drawReactions=result=>{
    mine=result.mine;
    for(const [key,value] of Object.entries(result.counts)) $(`[data-count=${key}]`).textContent=value;
    $('[data-reaction=like]').setAttribute('aria-pressed',String(Boolean(mine.liked)));
    $('[data-reaction=believe]').setAttribute('aria-pressed',String(mine.belief===1));
    $('[data-reaction=disbelieve]').setAttribute('aria-pressed',String(mine.belief===-1));
  };
  $$('[data-reaction]').forEach(button=>button.addEventListener('click',async()=>{
    if(!current) return showAuth();
    $$('[data-reaction]').forEach(b=>b.disabled=true); output.textContent='';
    const kind=button.dataset.reaction, value=kind==='like'?!mine.liked:kind==='believe'?(mine.belief===1?0:1):(mine.belief===-1?0:-1);
    try { drawReactions(await api('/api/reactions',{node,revision,dimension:kind==='like'?'like':'belief',value})); }
    catch(error){output.textContent=error.message;} finally{$$('[data-reaction]').forEach(b=>b.disabled=false);}
  }));
  const loadComments=async(reset=true)=>{
    const result=await api(`/api/comments?node=${node}${!reset&&next?`&after=${next}`:''}`);
    const list=$('#comments'); if(reset) list.replaceChildren();
    for(const comment of result.comments) {
      const li=document.createElement('li'), header=document.createElement('div'), author=document.createElement('a'), date=document.createElement('span'), text=document.createElement('p');
      header.className='comment-meta'; author.href=mindPath(comment.mind_id); author.textContent=comment.name;
      date.textContent=`${comment.kind==='ai'?'AI · ':comment.kind==='collective'?'Collective · ':''}${new Date(comment.created_at*1000).toLocaleDateString()}${comment.status==='pending'?' · Awaiting review':''}`;
      text.textContent=comment.body; text.dir='auto'; header.append(author,date); li.append(header,text);
      if(current&&(current.mind_id===comment.mind_id||current.role==='owner')) {
        const remove=document.createElement('button'); remove.className='quiet small'; remove.textContent='Remove';
        remove.addEventListener('click',()=>busy(remove,async()=>{await api(`/api/comments/${comment.id}`,{},'DELETE');await loadComments();output.textContent='Comment removed.';},output));li.append(remove);
      }
      list.append(li);
    }
    next=result.next; $('#more-comments').hidden=!next;
    if(!list.children.length) {const li=document.createElement('li');li.className='muted';li.textContent='The conversation is open.';list.append(li);}
  };
  let pendingComment=null;
  commentForm.addEventListener('submit',event=>{
    event.preventDefault(); if(!current) return showAuth();
    busy($('button[type=submit]',commentForm),async()=>{
      output.textContent=''; const text=commentForm.elements.body.value.trim();
      if(!pendingComment || pendingComment.body!==text) pendingComment={id:crypto.randomUUID(),body:text};
      const result=await api('/api/comments',{...pendingComment,node,revision});
      commentForm.reset(); pendingComment=null; try{sessionStorage.removeItem(draftKey);}catch{}
      output.textContent=result.status==='pending'?'Your comment is saved and awaiting review.':'Your comment is published.';
      await loadComments();
    },output);
  });
  $('#more-comments').addEventListener('click',()=>busy($('#more-comments'),()=>loadComments(false),output));
  const results=await Promise.allSettled([api(`/api/reactions?node=${node}`).then(drawReactions),loadComments()]);
  for(const result of results) if(result.status==='rejected') output.textContent=result.reason.message;
}
async function initAccount() {
  const output=$('#account-status'); if(!output)return;
  $('#account-signed-out').hidden=Boolean(current); $('#account-details').hidden=!current; if(!current)return;
  const form=$('#profile-form'); form.elements.name.value=current.name;form.elements.kind.value=current.kind;form.elements.bio.value=current.bio;
  $('#public-profile').href=mindPath(current.mind_id); $('#moderation-link').hidden=current.role!=='owner';
  if(seededPaths[current.mind_id]) {form.hidden=true;output.textContent='Your public profile is maintained in the site catalog.';}
  form.addEventListener('submit',event=>{event.preventDefault();busy($('button',form),async()=>{await api('/api/mind',Object.fromEntries(new FormData(form)),'PATCH');output.textContent='Profile saved.';},output);});
  $('#sign-out').addEventListener('click',()=>busy($('#sign-out'),async()=>{await api('/api/auth/logout',{});location.href='/';},output));
}
async function initMind() {
  const profile=$('[data-mind]'); if(!profile)return;
  const id=profile.dataset.mind==='dynamic'?new URLSearchParams(location.search).get('id'):profile.dataset.mind;
  if(!id) {$('#mind-status').textContent='No Mind was selected.';return;}
  // Seed profiles use the manually published catalog; registered Minds use D1.
  if(profile.dataset.mind!=='dynamic')return;
  try {
    const {mind}=await api(`/api/minds?id=${encodeURIComponent(id)}`);
    $('#mind-name').textContent=mind.name;$('#mind-kind').textContent=mind.kind;$('#mind-bio').textContent=mind.bio;
    $('#mind-graph-link').href=`/?node=${encodeURIComponent(id)}&types=mind`;
    document.title=`${mind.name} · Memespace`;
  } catch(error){$('#mind-status').textContent=error.message;}
}
async function initModeration() {
  const output=$('#moderation-status');if(!output)return;
  if(current?.role!=='owner'){output.textContent='Sign in with the owner account to review comments.';return;}
  const load=async()=>{
    const {comments}=await api('/api/moderation'),list=$('#moderation-list');list.replaceChildren();output.textContent=comments.length?'':'No comments awaiting review.';
    for(const comment of comments){
      const li=document.createElement('li'),title=document.createElement('p'),text=document.createElement('p');
      title.className='comment-meta';title.textContent=`${comment.name} · ${comment.node_id} · ${comment.revision.slice(0,7)}`;text.textContent=comment.body;text.dir='auto';li.append(title,text);
      for(const [value,label] of [['approved','Publish'],['hidden','Hide']]){const button=document.createElement('button');button.className=value==='approved'?'primary':'quiet';button.textContent=label;button.addEventListener('click',()=>busy(button,async()=>{await api('/api/moderation',{id:comment.id,status:value});await load();},output));li.append(button);}list.append(li);
    }
  };
  try{await load();}catch(error){output.textContent=error.message;}
}
async function start() {
  const hashNode=location.hash==='#node' && ($('#discussion')?.dataset.node || $('[data-mind]')?.dataset.mind);
  if(hashNode && hashNode!=='dynamic') {location.replace(`/?node=${hashNode}`);return;}
  const sessionPromise=api('/api/session').then(result=>{current=result.account;available=result.available;}).catch(()=>{});
  if($('#graph')) import('./graph.js').then(module=>module.initGraph()).catch(()=>{$('#graph-status').textContent='The graph could not load. You can browse the list below.';});
  await sessionPromise;
  if(current){$$('[data-signin]').filter(b=>b.closest('.site-header')).forEach(b=>b.hidden=true);const link=$('.account-link');link.hidden=false;link.textContent=current.name;}
  await Promise.allSettled([initDiscussion(),initAccount(),initMind(),initModeration()]);
}
start();
