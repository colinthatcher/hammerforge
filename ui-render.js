export function createRenderScheduler({document=globalThis.document,window=globalThis.window,schedule=callback=>setTimeout(callback,0),cancel=clearTimeout}={}){
  const jobs=new Set(),pointers=new Set();let timer=null,waitingClick=false;
  const connected=element=>element&&element.isConnected!==false;
  function identity(element){
    if(!element)return null;
    const attrs={};for(const attr of Array.from(element.attributes||[]))if(attr.name.startsWith('data-'))attrs[attr.name]=attr.value;
    const details=element.closest?.('details[data-disclosure]');
    return {id:element.id||'',tag:element.tagName,attrs,disclosure:details?.getAttribute('data-disclosure')||null};
  }
  function same(a,b){return a&&b&&a.tag===b.tag&&a.id===b.id&&a.disclosure===b.disclosure&&JSON.stringify(a.attrs)===JSON.stringify(b.attrs);}
  function queryMatches(saved){
    if(!document?.querySelectorAll)return null;
    return Array.from(document.querySelectorAll(saved.tag?.toLowerCase()||'*')).find(el=>same(saved,identity(el)))||null;
  }
  function flush(){
    timer=null;if(pointers.size||waitingClick||!jobs.size)return;
    const batch=[...jobs];jobs.clear();
    const active=connected(document?.activeElement)?document.activeElement:null, saved=identity(active);
    const editable=active&&(/^(INPUT|TEXTAREA)$/.test(active.tagName)&&(/^(text|number|search)$/i.test(active.type||'text')||active.tagName==='TEXTAREA'));
    const draft=editable?active.value:undefined, start=editable?active.selectionStart:null,end=editable?active.selectionEnd:null,direction=editable?active.selectionDirection:null;
    for(const job of batch)job();
    if(!saved||document.activeElement&&document.activeElement!==active&&document.activeElement.tagName!=='BODY'&&connected(document.activeElement))return;
    if(connected(active))return;
    const replacement=queryMatches(saved);if(!replacement||replacement.disabled)return;
    if(editable)replacement.value=draft;
    replacement.focus?.({preventScroll:true});
    if(editable&&start!==null&&end!==null)try{replacement.setSelectionRange(start,end,direction||'none');}catch{}
  }
  function scheduleFlush(){if(timer===null)timer=schedule(flush);}
  function pointerdown(event){if(event.target&&connected(event.target)){pointers.add(event.pointerId??'mouse');waitingClick=false;}}
  function pointerup(event={}){pointers.delete(event.pointerId??'mouse');if(!pointers.size){waitingClick=true;schedule(()=>{waitingClick=false;scheduleFlush();});}}
  function click(){if(!pointers.size){waitingClick=false;scheduleFlush();}}
  function keydown(event){if(event.key==='Escape'||event.key==='Enter'){if(document?.activeElement?.tagName==='SELECT'){pointers.clear();waitingClick=false;scheduleFlush();}}}
  function change(event){if(event.target?.tagName==='SELECT'){pointers.clear();waitingClick=false;scheduleFlush();}}
  document?.addEventListener?.('pointerdown',pointerdown,true);document?.addEventListener?.('pointerup',pointerup,true);document?.addEventListener?.('pointercancel',pointerup,true);document?.addEventListener?.('click',click,true);document?.addEventListener?.('change',change,true);document?.addEventListener?.('keydown',keydown,true);
  window?.addEventListener?.('blur',()=>{pointers.clear();waitingClick=false;scheduleFlush();});
  return {request(job){if(typeof job!=='function')throw new TypeError('job must be a function');jobs.add(job);scheduleFlush();},flush(){if(timer!==null){cancel(timer);timer=null;}waitingClick=false;pointers.clear();flush();}};
}
