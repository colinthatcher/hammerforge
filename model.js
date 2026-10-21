export const CLASSES = ['Warrior', 'Paladin', 'Ranger', 'Wizard', 'Rogue', 'Warlock', 'Sorcerer'];
export const SLOTS = ['Weapon', 'Off-hand', 'Head', 'Chest', 'Hands', 'Feet', 'Amulet', 'Ring 1', 'Ring 2'];
export const statLabels = {power:'Power',damage:'Damage bonus %',crit:'Critical chance %',critDamage:'Critical damage %',speed:'Speed bonus %',cdr:'Cooldown reduction %'};
export const zeroStats = () => ({power:0,damage:0,crit:0,critDamage:0,speed:0,cdr:0});
export function defaultBuild() {
 return {version:1,name:'Citadel theorycraft',class:'Wizard',level:20,spec:0,
  specs:[{name:'Offensive profile',description:'Lean into raw damage.',...zeroStats(),damage:15},{name:'Critical profile',description:'Make every critical hit count.',...zeroStats(),crit:10,critDamage:25},{name:'Rapid profile',description:'Less waiting. More casting.',...zeroStats(),speed:15,cdr:10}],
  base:{power:50,damage:0,crit:5,critDamage:150,speed:0,cdr:0,reduction:0,targets:1},
  gear:[{id:'starter-staff',name:'Emberwood staff',slot:'Weapon',rarity:'Epic',equipped:true,...zeroStats(),power:30,damage:10},{id:'starter-ring',name:'Band of the scholar',slot:'Ring 1',rarity:'Rare',equipped:true,...zeroStats(),crit:5,cdr:5}],
  abilities:[{id:'example-bolt',name:'Arcane bolt (example)',damage:40,scaling:1,cast:0.8,cooldown:0,hits:1,enabled:true,globes:0,globeDamage:15,globeHits:0,globeCdr:0},{id:'example-burst',name:'Flame burst (example)',damage:120,scaling:1.5,cast:0.6,cooldown:5,hits:1,enabled:true,globes:0,globeDamage:20,globeHits:0,globeCdr:5}]};
}
export function calculate(build) {
 const stats = {...build.base};
 for (const source of [build.specs[build.spec],...build.gear.filter(g=>g.equipped)]) for (const key of Object.keys(statLabels)) stats[key] += source[key];
 stats.crit = Math.min(100,Math.max(0,stats.crit)); stats.cdr = Math.min(80,Math.max(0,stats.cdr));
 const abilities = build.abilities.map(a=>{
  const hit = (a.damage+stats.power*a.scaling)*(1+stats.damage/100)*(1+a.globes*a.globeDamage/100);
  const expected = hit*(1+stats.crit/100*(stats.critDamage/100-1))*(1-build.base.reduction/100);
  const interval = Math.max(a.cast/(1+stats.speed/100), a.cooldown*(1-Math.min(80,stats.cdr+a.globes*a.globeCdr)/100));
  const hits = a.hits+a.globes*a.globeHits;
  return {...a,hit,expected,interval,totalHits:hits,dps:a.enabled?expected*hits/interval:0};
 });
 return {stats,abilities,total:abilities.reduce((sum,a)=>sum+a.dps,0)};
}
export function validateBuild(value) {
 const fail = () => {throw new Error('Invalid build file. Please use a version 1 Hammerforge JSON export.');};
 const obj = x => x && typeof x==='object' && !Array.isArray(x);
 const text = x => typeof x==='string' && x.trim().length>0 && x.length<=100;
 const num = (x,min=0,max=100000) => typeof x==='number' && Number.isFinite(x) && x>=min && x<=max;
 const stats = x => obj(x)&&Object.keys(statLabels).every(k=>num(x[k]));
 if(!obj(value)||value.version!==1||!text(value.name)||!CLASSES.includes(value.class)||!num(value.level,1,10000)||!Number.isInteger(value.level)||!Number.isInteger(value.spec)||value.spec<0||value.spec>2) fail();
 if(!Array.isArray(value.specs)||value.specs.length!==3||!value.specs.every(s=>stats(s)&&text(s.name)&&text(s.description))) fail();
 if(!stats(value.base)||!num(value.base.reduction,0,100)||!num(value.base.targets,1,100)||!Number.isInteger(value.base.targets)||value.base.critDamage<100) fail();
 if(!Array.isArray(value.gear)||value.gear.length>100||!value.gear.every(g=>stats(g)&&text(g.id)&&text(g.name)&&SLOTS.includes(g.slot)&&['Common','Rare','Epic','Legendary'].includes(g.rarity)&&typeof g.equipped==='boolean')) fail();
 if(!Array.isArray(value.abilities)||value.abilities.length>30||!value.abilities.every(a=>obj(a)&&text(a.id)&&text(a.name)&&typeof a.enabled==='boolean'&&['damage','scaling','cooldown','globeDamage','globeHits','globeCdr'].every(k=>num(a[k]))&&num(a.cast,0.05,1000)&&num(a.hits,1,100)&&num(a.globes,0,10)&&Number.isInteger(a.globes))) fail();
 for(const list of [value.gear,value.abilities]) if(new Set(list.map(x=>x.id)).size!==list.length) fail();
 const equipped=value.gear.filter(g=>g.equipped); if(new Set(equipped.map(g=>g.slot)).size!==equipped.length) fail();
 return structuredClone(value);
}
