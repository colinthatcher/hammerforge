import {parseSval,normalizeSval,value} from './sval.mjs';

// This is deliberately a literal block expander, not the game's preprocessor.
// Never let parseSval silently discard a directive that could change a value.
function words(text){
 const result=[];let token='',quote=null,started=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quote){
   if(c==='\\'&&[quote,'\\'].includes(text[i+1]))token+=text[++i];
   else if(c===quote)quote=null;
   else token+=c;
  }else if(c==='"'||c==="'"){quote=c;started=true;}
  else if(/\s/.test(c)){if(started){result.push(token);token='';started=false;}}
  else {token+=c;started=true;}
 }
 if(quote)throw new Error('Unterminated quoted block argument');
 if(started)result.push(token);
 return result;
}

export function expandLiteralBlocks(text){
 const lines=text.replace(/<!--[\s\S]*?-->/g,'').replace(/^[ \t]*%\/\/[^\r\n]*/gm,'').split(/\r?\n/);
 const blocks=new Map(),body=[];
 for(let i=0;i<lines.length;i++){
  const match=lines[i].match(/^\s*%defblock\s+(.+?)\s*$/);
  if(!match){body.push(lines[i]);continue;}
  const [name,...params]=words(match[1]);
  if(!/^[A-Za-z_]\w*$/.test(name)||params.some(p=>!/^[A-Za-z_]\w*$/.test(p))||new Set(params).size!==params.length)throw new Error(`Invalid block declaration: ${name}`);
  if(blocks.has(name))throw new Error(`Duplicate block: ${name}`);
  const template=[];
  while(++i<lines.length&&!/^\s*%endblock\s*$/.test(lines[i])){
   if(/^\s*%defblock\b/.test(lines[i]))throw new Error(`Nested block declaration: ${name}`);
   template.push(lines[i]);
  }
  if(i===lines.length)throw new Error(`Unclosed block: ${name}`);
  blocks.set(name,{params,body:template.join('\n')});
 }
 function expand(body,chain=[]){
  return body.split('\n').map(line=>{
   const call=line.match(/^\s*%block\s+(.+?)\s*$/);
   if(!call){
    if(/^\s*%/.test(line))throw new Error(`Unsupported preprocessor directive: ${line.trim()}`);
    if(line.includes('%%'))throw new Error(`Unresolved block placeholder: ${line.trim()}`);
    return line;
   }
   const [name,...args]=words(call[1]),block=blocks.get(name);
   if(!block)throw new Error(`Unknown block: ${name}`);
   if(chain.includes(name))throw new Error(`Recursive block expansion: ${[...chain,name].join(' -> ')}`);
   if(chain.length>=64)throw new Error('Block expansion nesting limit exceeded');
   if(args.length>block.params.length)throw new Error(`Too many arguments for block: ${name}`);
   const bindings=new Map(block.params.map((p,i)=>[p,args[i]]));
   const replaced=block.body.replace(/%%([A-Za-z_]\w*)%%/g,(placeholder,key)=>{
    if(!bindings.has(key)||bindings.get(key)===undefined)throw new Error(`Unresolved block placeholder ${placeholder} in ${name}`);
    return bindings.get(key);
   });
   if(replaced.includes('%%'))throw new Error(`Unresolved block placeholder in ${name}`);
   return expand(replaced,[...chain,name]);
  }).join('\n');
 }
 return expand(body.join('\n'));
}

const enemyFamilies=[
 ['vulnerability','Vulnerability'],['marked','Marked'],['armor_break','Armor Break'],
 ['weakness','Weakness'],['cripple','Cripple'],['stun','Stun'],['freeze','Freeze'],
 ['blindness','Blindness'],['slow','Slow'],['disarm','Disarm'],['silence','Silence'],
];
const stackFamilies=[
 ['haste','Haste','wizard','transmutation_haste','haste'],
 ['killing_spree','Killing Spree','warrior','killing_spree','killing_spree'],
 ['rage','Rage','warrior','berserker_rage','rage'],
 ['incanters_flow','Incanter Cadence','wizard','wiz_incanters_flow','incanters_flow'],
 ['slice_and_dice','Slice and Dice','rogue','rog_slice_and_dice','slice_and_dice'],
 ['essence','Essence','warlock','drain_essence','essence'],
 ['divine_favor','Divine Favor','priest','divine_favor',null],
 ['elemental_fire','Elemental Affinity: Fire','sorcerer','elemental_affinity','elementalist_fire'],
 ['elemental_ice','Elemental Affinity: Ice','sorcerer','elemental_affinity','elementalist_ice'],
 ['elemental_lightning','Elemental Affinity: Lightning','sorcerer','elemental_affinity','elementalist_lightning'],
 ['rhythm','Rhythm','ranger','ran_rhythm','rhythm'],
 ['survivalist','Survivalist','ranger','ran_survivalist','survivalist'],
 ['inner_flame','Inner Flame','paladin','radiance_flames','inner_flame'],
 // The source base definition has max 1; its rank binding adds up to four.
 ['barrier','Barrier','wizard','wiz_barrier','barrier',{maxAddBinding:'barrier-stacks',selectionMax:5}],
 ['barrier_fire','Barrier: Fire','wizard','wiz_barrier','barrier_fire',{requiredUpgrade:'wiz_barrier_fire'}],
 ['sidestep','Sidestep','rogue','rog_evasion','sidestep'],
 ['divine_protection','Divine Protection','paladin','divine_protection','divine_protection'],
 ['ecstasy','Ecstasy','priest','flagellate','ecstasy',{requiredUpgrade:'flagellate_ecstasy'}],
];

// All reads go through the caller so provenance hashes cover the original text.
// Definitions remain unmodified; skill-rank injection belongs to the consumer.
export async function buildStatusCatalog({source,localize}){
 const cache=new Map();
 async function load(path,stack=false){
  if(cache.has(path))return cache.get(path);
  let root;
  try{root=parseSval(expandLiteralBlocks(await source(path)));}
  catch(error){throw new Error(`Status source ${path}: ${error.message}`,{cause:error});}
  const container=root.children.find(n=>n.tag===(stack?'array':'svals'));
  if(!container)throw new Error(`Missing status ${stack?'array':'svals'}: ${path}`);
  if(stack&&root.children.find(n=>n.tag==='loader')?.text.trim()!=='ActorBuffStackDef::LoadMultiple')throw new Error(`Unexpected stack loader: ${path}`);
  const definitions=new Map();
  for(const node of container.children.filter(n=>n.tag==='dict')){
   const id=stack?value(node,'id'):node.name;
   if(!id||definitions.has(id))throw new Error(`Missing/duplicate status definition ID ${id}: ${path}`);
   definitions.set(id,normalizeSval(node));
  }
  cache.set(path,definitions);return definitions;
 }
 function required(definitions,id,path){
  if(!definitions.has(id))throw new Error(`Missing required status definition ${id}: ${path}`);
  return definitions.get(id);
 }
 function variant(definitions,id,name,path){
  const definition=required(definitions,id,path);
  return {id,name,source:path,sourceKey:id,definition};
 }
 const enemy=[],player=[],enemyPath='tweak/buffs/status_effects.sval';
 const debuffs=await load(enemyPath);
 for(const [id,name] of enemyFamilies){
  const keys=[`${id}_minor`,id,`${id}_greater`];
  if(!keys.some(key=>debuffs.has(key)))continue;
  enemy.push({id,name,variants:keys.map((key,i)=>variant(debuffs,key,['Minor','Normal','Greater'][i],enemyPath))});
 }
 for(const [id,name,classId,count] of [['warcry','War Cry','warrior',5],['powersurge','Power Surge','sorcerer',3]]){
  const path=`players/${classId}/buffs_${classId}.sval`,definitions=await load(path);
  player.push({id,name,kind:'fixed',...(id==='powersurge'?{classId}:{}),variants:Array.from({length:count},(_,i)=>variant(definitions,`${id}_${i+1}`,`${name} ${i+1}`,path))});
 }
  for(const [id,name,classId,skillId,sourceKey,metadata={}] of stackFamilies){
  const path=`players/${classId}/stacks_${classId}.sval`,all=await load(path,true);
  // Divine Favor's selected skill binding chooses the definition; retain the
  // whole family, including future literal ranks, and require all known ranks.
  const keys=sourceKey?[sourceKey]:[...all.keys()].filter(key=>/^divine_favor_\d+$/.test(key));
  if(!sourceKey)for(let rank=2;rank<=10;rank++)required(all,`divine_favor_${rank}`,path);
  const definitions=Object.fromEntries(keys.map(key=>[key,required(all,key,path)]));
  const nameKey=definitions[keys[0]]?.name;
   player.push({id,name:nameKey?.startsWith('.')?localize(nameKey):name,kind:'stack',classId,skillId,source:path,...(sourceKey?{sourceKey}:{sourceKeyBinding:'stacks-buff'}),...metadata,definitions});
 }
 return {player,enemy};
}
