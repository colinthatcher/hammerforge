import {parseSval,normalizeSval,child,value} from './sval.mjs';
import {expandLiteralBlocks} from './status-catalog.mjs';
import {findObjects} from '../combat/definitions.js';

export async function buildWeaponCatalog({source,localize,equipment}){
  const referenced=new Set(equipment.flatMap(e=>Object.values(e.attacks||{})).filter(Boolean)),attacks={},resources={};
  for(const slot of ['mainhand','offhand','twohanded']){
    const path=`players/attacks/attacks_${slot}.sval`,root=parseSval(expandLiteralBlocks(await source(path)));
    if(root.children.find(n=>n.tag==='loader')?.text.trim()!=='Item::ItemSkillDef::LoadMultiple')throw Error(`Unexpected weapon loader: ${path}`);
    for(const node of root.children.find(n=>n.tag==='array').children.filter(n=>n.tag==='dict')){
      const id=value(node,'id');if(!referenced.has(id))continue;
      if(attacks[id])throw Error(`Duplicate weapon attack: ${id}`);
      const definition=normalizeSval(child(node,'skill'));
      attacks[id]={id,source:`weapon:${id}`,definitionSource:path,weaponAttack:true,name:localize(value(node,'name')),description:localize(value(node,'description')),type:value(node,'type'),tags:normalizeSval(child(node,'tags')),parameters:[],rankCount:1,ranks:[definition],upgrades:[],status:'extracted-definition'};
    }
  }
  for(const id of referenced)if(!attacks[id])throw Error(`Equipment references missing weapon attack: ${id}`);
  async function loadResources(definition){
    for(const obj of findObjects(definition,v=>['ShootProjectile','ShootProjectileFan','SpawnUnit'].includes(v.class))){
      const path=obj.projectile||obj.unit;if(!path?.startsWith('players/')||!path.endsWith('.unit')||resources[path])continue;
      const text=await source(path);resources[path]={source:path,behaviors:[]};
      // Refuse non-literal preprocessing instead of silently discarding branches.
      let expanded;try{expanded=expandLiteralBlocks(text);}catch(error){resources[path].unsupported=error.message;continue;}
      for(const match of expanded.matchAll(/<behavior\b[^>]*class="([^"]+)"[^>]*>([\s\S]*?)<\/behavior>/g)){
        const params=normalizeSval(parseSval(`<dict>${match[2]}</dict>`).children[0]);
        resources[path].behaviors.push({class:match[1],...params});
        await loadResources(params);
      }
    }
  }
  for(const attack of Object.values(attacks))await loadResources(attack.ranks[0]);
  return {attacks,resources};
}
