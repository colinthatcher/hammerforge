import {gearIntensity} from './planner-model.js';
export {itemDisplayName} from './item-name.js';

const labels={str:'Strength',dex:'Dexterity',int:'Intelligence',foc:'Focus',vit:'Vitality','spell-power':'Spell power','attack-power':'Attack power','attack-speed':'Attack speed','cast-speed':'Cast speed','move-speed':'Move speed','health-regen':'Health regeneration','mana-regen':'Mana regeneration',health:'Health',mana:'Mana',armor:'Armor'};
const title=s=>String(s).replace(/^Modifiers::/,'').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[-_]/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const fmt=n=>new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(Number(n));
const pct=n=>`${fmt(Number(n)*100)}%`;
const delta=n=>`${Number(n)>=0?'+':''}${pct(n)}`;
const change=(n,label)=>`${delta(Number(n)-1)} ${label}`;
const unitName=path=>title(String(path).split('/').at(-1).replace(/\.unit$/,'').replace(/^glyph_/,'glyph '));
const skillScope=m=>({'mainhand':'main-hand weapon','offhand':'off-hand weapon','spell':'spell'}[m['skill-type']]||m['skill-type']||(m['skill-tags']||[]).join(' and ')||'skill');

function condition(m){
  const c=m.conditional;if(!c)return '';
  if(Array.isArray(c)&&c.length===3){
    const [kind,op,value]=c,tags=(Array.isArray(value)?value:[value]).map(v=>({boss:'bosses',elites:'elites'}[v]||String(v))).join(' and ');
    if(kind==='tag'&&op==='has')return ` against ${tags}`;
    if(kind==='buff'&&op==='has tag')return ` against targets affected by ${tags}`;
    if(kind==='hp'&&['lt','gt'].includes(op))return ` ${m['cond-target-self']?'while your health is':'against targets'} ${op==='lt'?'below':'above'} ${pct(value)} health`;
  }
  return ' (conditional effect; inspect editor for requirements)';
}

function effectText(e){
  if(!e||typeof e!=='object')return 'activate an additional effect (see editor)';
  switch(e.class){
    case 'Heal':return `restore ${fmt(e.heal)} health`;
    case 'GiveMana':return `restore ${fmt(e.mana)} mana`;
    case 'ApplyBuff':return `apply ${String(e.buff).split(':').at(-1).replace(/_/g,' ')} to the target`;
    case 'GiveCombo':return 'gain combo';
    case 'RemoveShadowCurse':return `remove ${fmt(e.num)} shadow curse${e.num===1?'':'s'}`;
    case 'TriggerComboSkill':return 'trigger a combo skill';
    case 'Damage':return `deal ${Object.entries(e).filter(([k])=>['physical','fire','ice','lightning','poison','pure'].includes(k)).map(([k,v])=>`${fmt(v)} ${k} damage`).join(' and ')}${e['true-strike']?' (true strike)':''}`;
    default:return `activate an additional ${title(e.class||'unknown').toLowerCase()} effect (see editor)`;
  }
}

// Presentation of extracted definitions, not a claim that conditional effects are simulated.
export function presentModifier(modifier,roll=.5){
  const m=Object.fromEntries(Object.entries(modifier).map(([k,v])=>[k,Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)?v[0]+(v[1]-v[0])*roll:v]));
  const type=String(m.class||'').replace(/^Modifiers::/,'');
  const entries=Object.entries(m).filter(([k])=>!['class','description','conditional','shown-icons','fx'].includes(k));
  const flat=(label=k=>labels[k]||title(k))=>entries.map(([k,v])=>`${fmt(v)} ${label(k)}`).join(' · ');
  const percentages={CriticalHit:{chance:'Weapon critical chance','spell-chance':'Spell critical chance'},CritDamage:{'attack-crit-dmg':'Weapon critical damage','spell-crit-dmg':'Spell critical damage'},Parry:{chance:'Parry chance'},Evade:{chance:'Evade chance'}};
  let text;
  if(['DamagePowerAdd','StatAdd','AttribAdd'].includes(type))text=flat();
  else if(type==='ArmorAdd')text=flat(k=>k==='armor'?'Armor':`${title(k)} resistance`);
  else if(type==='DamageAdd')text=flat(k=>`${title(k)} damage`);
  else if(type==='DamageMulAdd')text=entries.map(([k,v])=>`${pct(v)} ${title(k)} damage`).join(' · ');
  else if(type==='SpeedAdd')text=entries.map(([k,v])=>`${pct(v)} ${labels[k]||title(k)}`).join(' · ');
  else if(percentages[type])text=entries.map(([k,v])=>`${pct(v)} ${percentages[type][k]||title(k)}`).join(' · ');
  else if(type==='ArmorPenetration')text=entries.map(([k,v])=>`${pct(v)} ${title(k).toLowerCase()}`).join(' · ');
  else if(type==='StatBasedDamage')text=`${fmt(m.amount)} damage per ${labels[m.stat]||title(m.stat)} (${title(m.type)})`;
  else if(type==='Damage')text=m['attack-mul']===m['spell-mul']&&m['attack-mul']!==undefined?change(m['attack-mul'],'weapon and spell damage'):[['attack-mul','weapon damage'],['spell-mul','spell damage']].filter(([k])=>m[k]!==undefined).map(([k,label])=>change(m[k],label)).join(' · ');
  else if(type==='Armor')text=change(m['dmg-taken-mul'],'damage taken');
  else if(type==='SkillCost')text=change(m['mana-mul'],`${skillScope(m)} mana cost`);
  else if(type==='BaseSkillModifier')text=[['skill-speed-mul','speed'],['cooldown-mul','cooldown']].filter(([k])=>m[k]!==undefined).map(([k,label])=>change(m[k],`${skillScope(m)} ${label}`)).join(' · ');
  else if(type==='Dash')text=[m.charges!==undefined?`+${fmt(m.charges)} dash charge${m.charges===1?'':'s'}`:'',m['recharge-time-mul']!==undefined?change(m['recharge-time-mul'],'dash recharge time'):''].filter(Boolean).join(' · ');
  else if(type==='Potion')text=`+${fmt(m.charges)} potion charge${m.charges===1?'':'s'}`;
  else if(type==='Experience')text=change(m.mul,'experience gained');
  else if(type==='MaterialGain')text=change(m['gold-mul'],'gold gained');
  else if(type==='ShadowCurseGain')text=change(m.mul,'shadow curse gain');
  else if(type==='BuffImmune')text=`Immune to ${(m.tags||[]).join(' and ')}`;
  else if(type==='SkillSlowScale')text=change(m['slow-scale'],`${skillScope(m)} movement slowdown`);
  else if(type==='SummonStatMulAdd')text=entries.map(([k,v])=>`${delta(v)} summon ${k.replace('-mul','')}`).join(' · ');
  else if(type==='ModifySummons')text=`+${fmt(m['add-max-num'])} maximum ${unitName(m.unit)} summons`;
  else if(type==='CriticalHitPerCurse')text=entries.map(([k,v])=>`${delta(v)} ${k.startsWith('spell')?'spell':'weapon'} critical chance per shadow curse`).join(' · ');
  else if(type==='ConvertStat'){
    const names={mainhand_critdamage:'main-hand critical damage',offhand_critdamage:'off-hand critical damage'};
    text=m.from===m.to?`${m.add?'Add ':''}${fmt(m.mul)}× ${names[m.to]||title(m.to)}`:`Convert ${names[m.from]||title(m.from)} to ${names[m.to]||title(m.to)} at ${fmt(m.mul)}×`;
  }else if(type==='DamageLeeching'){
    const scope=[m['weapon-leech']?'weapon':'',m['spell-leech']?'spell':''].filter(Boolean).join(' and ');
    text=[['life','health'],['mana','mana']].filter(([k])=>m[k]!==undefined).map(([k,label])=>`Restore ${pct(m[k])} of ${scope} damage as ${label}`).join(' · ')+(m['only-crit']?' on critical hits':'');
  }else if(['TriggerEffect','SkillTriggerEffect'].includes(type)){
    const effects=[m.effect,...(m.effects||[])].filter(e=>e&&e.class!=='PlaySound').map(effectText).join(' and ');
    const trigger={hit:'on hit',hurt:'when hit',kill:'on kill',dash:'on dash'}[m.trigger]||`on ${m.trigger}`;
    text=`${type==='SkillTriggerEffect'?`${title(skillScope(m))}: `:''}${m.chance!==undefined&&Number(m.chance)!==1?`${pct(m.chance)} chance to `:''}${effects||'activate an additional effect (see editor)'} ${trigger}${m['target-self']?' (affects you)':''}`;
  }else if(type==='Block')text=`${pct(m.chance??1)} chance to block ${fmt(m.any)} damage${m.arc!==undefined?` within a ${fmt(m.arc)}° arc`:''}${m['only-melee']?' (melee only)':''}${m['only-projectile']?' (projectiles only)':''}${m['shield-block']?' with a shield':''}`;
  else text=`Additional ${title(type||'unknown').toLowerCase()} effect — inspect editor for details`;
  return text+condition(m)+(Number(m.timeout)>0?` · ${fmt(m.timeout/1000)}s cooldown`:'');
}

export function itemQuality(n,q){if(q==='legendary'||q===16)return {label:'Legendary',color:'#ff2400'};return [{label:'Common',color:'#fff'},{label:'Uncommon',color:'#42ff00'},{label:'Rare',color:'#00c0ff'},{label:'Epic',color:'#ff00ff'}][Math.min(3,Math.max(0,n))];}
export function presentItem(item,base,catalog){
  const intensity=gearIntensity(item)??.5,baseStats=(base.modifiers||[]).map(m=>presentModifier(m,intensity)),affixes=[],unresolvedStats=[];
  for(const a of item.affixes||[]){const d=(catalog.affixes||[]).find(d=>d.id===a.id);if(!d){unresolvedStats.push(`Unresolved imported effect: ${a.id} (effect not identified)`);continue;}affixes.push({id:d.id,name:d.name||d.prefix||d.suffix||'Affix',type:d.prefix?'Prefix':d.suffix?'Suffix':'Affix',stats:(d.modifiers||[]).map(m=>presentModifier(m,item.itemLevel===undefined?a.roll??.5:intensity))});}
  for(const id of item.unresolvedModifiers||[])unresolvedStats.push(`Unresolved imported effect: ${id} (effect not identified)`);
  return {quality:itemQuality((item.affixes?.length||0)+(item.unresolvedModifiers?.length||0),item.sourceQuality),baseStats,affixes,unresolvedStats,stats:[...baseStats,...affixes.flatMap(a=>a.stats),...unresolvedStats]};
}
