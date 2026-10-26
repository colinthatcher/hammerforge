export async function initAppVersion({fetchImpl=globalThis.fetch,element=globalThis.document?.querySelector('#app-version')}={}){
 if(!element)return;
 try{
  const response=await fetchImpl('/health',{cache:'no-store'});
  if(!response.ok)throw new Error('Health endpoint unavailable');
  const metadata=await response.json();
  const version=typeof metadata?.version==='string'&&/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(metadata.version)?metadata.version:null;
  const revision=typeof metadata?.gitRevision==='string'&&/^[a-f\d]+$/i.test(metadata.gitRevision)?metadata.gitRevision:null;
  if(!version)throw new Error('Malformed application metadata');
  const displayRevision=revision?revision.slice(0,12):'unknown';
  element.textContent=`App v${version} · Git ${displayRevision}`;
  const date=typeof metadata.buildDate==='string'&&metadata.buildDate.trim()?metadata.buildDate:null;
  element.title=`Git revision: ${revision||'unknown'}${date?` · Build date: ${date}`:''}`;
 }catch{
  element.textContent='App version unavailable';
  element.title='';
 }
}
