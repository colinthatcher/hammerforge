import {readCharacterFiles} from './character-import.js';
import {validatePlannerBuild} from './planner-model.js';
const $=selector=>document.querySelector(selector);
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function initializeCharacterImport({catalog,getBuilds,onImport}){
  let rows=[],selected=new Set(),generation=0,controller;
  const controls=['#find-local-characters','#character-folder','#character-files'];
  const busy=value=>controls.forEach(id=>$(id).disabled=value);
  function selection(){
    const capacity=100-getBuilds().length,count=selected.size;
    $('#native-selection-count').textContent=`${count} selected · ${capacity} build slots available`;
    $('#import-selected-characters').disabled=count===0||count>capacity;
    $('#import-selected-characters').textContent=`Import ${count||'selected'} character${count===1?'':'s'}`;
    const available=rows.filter(row=>row.build&&!row.error).length;
    $('#select-all-characters').checked=available>0&&count===available;
    $('#select-all-characters').indeterminate=count>0&&count<available;
  }
  function preview(result){
    const existing=new Set(getBuilds().map(b=>b.importInfo?.sourceId).filter(Boolean));
    rows=(result.characters||[]).map(row=>{
      if(!row.build)return row;
      try{return {...row,build:validatePlannerBuild(row.build,catalog)};}catch(error){return {...row,build:null,error:`Mapped character did not pass validation: ${error.message}`};}
    });
    selected=new Set();
    rows.forEach((row,index)=>{if(row.build&&!row.error&&!existing.has(row.build.importInfo?.sourceId))selected.add(index);});
    const files=result.files??0;
    $('#native-status').textContent=`${rows.length} character${rows.length===1?'':'s'} found in ${files} save file${files===1?'':'s'}. ${result.skipped?.length||0} older snapshots skipped.`;
    if(!rows.length)$('#native-status').textContent+=' Choose your saves folder or .hps profile files to try another location.';
    $('#native-errors').innerHTML=(result.errors||[]).map(message=>`<p>${escape(message)}</p>`).join('');
    $('#character-results').innerHTML=rows.map((row,index)=>{
      const duplicate=row.build&&existing.has(row.build.importInfo?.sourceId);
      const build=row.build,base=build&&catalog.classes.find(c=>c.id===build.classId),specialization=base?.specializations.find(s=>s.id===build.specializationId)?.name;
      return `<article class="character-import-row"><div class="character-row-top"><label class="toggle-label"><input type="checkbox" data-character-index="${index}" ${selected.has(index)?'checked':''} ${!build||row.error?'disabled':''}><span><strong>${escape(row.name)}</strong><small>${escape(row.className)}${specialization?` · ${escape(specialization)}`:''} · Level ${escape(row.level)}</small></span></label>${duplicate?'<span class="pill">Already imported</span>':''}</div><p class="character-source">${escape(row.profile)} · ${escape(row.fileName)}${Number.isSafeInteger(row.savedAt)?` · ${escape(new Date(row.savedAt).toLocaleString())}`:''}</p>${row.error?`<p class="import-failure">${escape(row.error)}</p>`:`<p class="character-summary">${build.gear.filter(g=>g.equipped).length} equipped · ${build.gear.filter(g=>!g.equipped).length} inventory · ${build.trinkets.reduce((sum,t)=>sum+(t.count??1),0)} trinkets</p><details><summary>Import notes (${row.warnings?.length||0})</summary>${(row.warnings||[]).map(w=>`<p>${escape(w)}</p>`).join('')}</details>`}</article>`;
    }).join('');
    $('#character-preview').hidden=rows.length===0;selection();
  }
  async function scan(read){
    const token=++generation;controller?.abort();controller=new AbortController();busy(true);
    $('#character-preview').hidden=true;$('#native-errors').textContent='';$('#native-status').textContent='Reading save profiles and matching your characters…';
    try{const result=await read(controller.signal);if(token===generation)preview(result);}
    catch(error){if(token===generation&&error.name!=='AbortError'){$('#native-status').textContent='';$('#native-errors').textContent=error.message;}}
    finally{if(token===generation)busy(false);}
  }
  $('#find-local-characters').addEventListener('click',()=>scan(async signal=>{
    let response;try{response=await fetch('./api/local-characters',{signal});}catch(error){if(error.name==='AbortError')throw error;throw Error('Could not reach local discovery. Run mise run dev, or choose your saves folder.');}
    if(response.status===404)throw Error('Automatic discovery is available with mise run dev. Choose your saves folder or .hps files to import here.');
    const result=await response.json();if(!response.ok)throw Error(result.error||'Local discovery failed. Try choosing your saves folder.');return result;
  }));
  for(const id of ['#character-folder','#character-files'])$(id).addEventListener('change',e=>{const files=[...e.target.files];e.target.value='';if(files.length)scan(()=>readCharacterFiles(files,catalog));});
  $('#character-results').addEventListener('change',e=>{if(e.target.dataset.characterIndex===undefined)return;const index=Number(e.target.dataset.characterIndex);if(e.target.checked)selected.add(index);else selected.delete(index);selection();});
  $('#select-all-characters').addEventListener('change',e=>{const checked=e.target.checked;selected=new Set(checked?rows.flatMap((row,index)=>row.build&&!row.error?[index]:[]):[]);$('#character-results').querySelectorAll('input[data-character-index]').forEach(input=>input.checked=selected.has(Number(input.dataset.characterIndex)));selection();});
  $('#import-selected-characters').addEventListener('click',()=>{
    try{const chosen=[...selected].map(index=>rows[index].build);if(!chosen.length||chosen.length+getBuilds().length>100)throw Error('Select characters within the 100-build library limit.');onImport(chosen);$('#import-dialog').close();}
    catch(error){$('#native-errors').textContent=error.message;}
  });
  $('#import-dialog').addEventListener('close',()=>{generation++;controller?.abort();busy(false);});
  $('#import-open').addEventListener('click',()=>{rows=[];selected.clear();$('#character-preview').hidden=true;$('#native-errors').textContent='';$('#native-status').textContent='';});
}
