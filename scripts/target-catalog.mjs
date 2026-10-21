import {parseSval,normalizeSval} from './sval.mjs';

// Reviewed town dummy definitions. Missing defenses default to zero in
// CompositeActorProperties; these are not generic enemy or NG+ presets.
export async function buildTargetCatalog({source}){
  const mechanicSources=['scripts/Behaviors/Actors/Enemies/CompositeActorProperties.as','scripts/Behaviors/Actors/Enemies/CompositeActorBehavior.as','scripts/Behaviors/Armor.as','scripts/Data/Misc.as'];
  for(const path of mechanicSources)await source(path);
  const targets=[];
  for(const [variant,name] of [['normal','Normal training dummy'],['magic','Green-robed magic dummy'],['armored','Armored training dummy']]){
    const path=`doodads/generic/target_dummy_${variant}.unit`;
    const text=await source(path);
    if(!/<behavior class="CompositeActorBehavior">/.test(text))throw Error(`Unreviewed target behavior: ${path}`);
    const unit=parseSval(text).children.find(n=>n.tag==='unit');
    const behavior=unit?.children.find(n=>n.tag==='behavior');
    if(!behavior)throw Error(`Missing target behavior: ${path}`);
    const def=normalizeSval({...behavior,tag:'dict'});
    if(def['mp-scale-fact']!==0||def['ngp-scale']!==0||def.hp!==10000000||!def.tags?.includes('target_dummy'))throw Error(`Training target scaling changed; review required: ${path}`);
    const armor=def.armor??0,resistances=Object.fromEntries(['fire','ice','lightning','poison'].map(e=>[e,def[`res-${e}`]??0]));
    if(!Number.isFinite(armor)||Object.values(resistances).some(v=>!Number.isFinite(v)))throw Error(`Nonliteral target defenses: ${path}`);
    const scenes=unit.children.find(n=>n.tag==='scenes');
    const scene=scenes?.children.find(n=>n.name==='pop');
    const sprite=scene?.children.find(n=>n.tag==='sprite');
    targets.push({id:`dummy-${variant}`,name,health:def.hp,armor,resistances,tags:def.tags,immuneBuffTags:def['buffs-immune-tags']||[],source:path,mechanicSources,...(sprite?{townSprite:{texture:'doodads/generic/target_dummy.png',frame:sprite.children.find(n=>n.tag==='frame')?.text.trim()}}:{})});
  }
  // Hash the sprite alongside definitions: the green-robed town "pop" frame
  // identifies the magic dummy, not the normal zero-resistance dummy.
  await source('doodads/generic/target_dummy.png');
  return targets;
}
