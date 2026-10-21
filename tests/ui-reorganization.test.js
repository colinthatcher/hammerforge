import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild,collectStats,validatePlannerBuild,ATTRIBUTES} from '../planner-model.js';
import {STAT_OVERRIDE_FIELDS} from '../combat/stat-overrides.js';
import {createUuid} from '../uuid.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const func=(name,next)=>source.slice(source.indexOf(`function ${name}(`),source.indexOf(`function ${next}(`));
function harness(build=createBuild(catalog),extra={}){
 const elements=new Map();
 const $=s=>{if(!elements.has(s))elements.set(s,{innerHTML:'',textContent:'',value:'',checked:false,hidden:false,disabled:false,close(){this.closed=true;}});return elements.get(s);};
  const context={build,catalog,library:{builds:[build],activeId:build.id},STAT_OVERRIDE_FIELDS,ATTRIBUTES,collectStats,validatePlannerBuild,createUuid,$,
   structuredClone,JSON,Blob,crypto:{randomUUID:()=>`copy-${Math.random()}`},esc:v=>String(v??''),fmt:v=>v===null||!Number.isFinite(v)?'—':String(Math.round(v*10)/10),option:()=>'',detailView:{capture(){}},toast(){},chooseBuild(id){context.library.activeId=id;context.build=context.library.builds.find(b=>b.id===id);},...extra};
 vm.createContext(context);return {context,$};
}
test('character stats render grouped calculated and manually overridden values with reset controls without mutation',()=>{
 const b=createBuild(catalog);b.statOverrides={health:12345};const before=structuredClone(b),{context,$} = harness(b);
 $('#edit-character-stats').checked=true;
 const code=func('renderCharacterStats','renderNow');vm.runInContext(`${code}\nrenderCharacterStats()`,context);
 assert.match($('#character-stats').innerHTML,/character-stat-group/);assert.match($('#character-stats').innerHTML,/data-stat-override="health"/);
  const natural=structuredClone(b);delete natural.statOverrides;
  assert.match($('#character-stats').innerHTML,/Reset Health/);assert.ok($('#character-stats').innerHTML.includes(`Calculated: ${collectStats(natural,catalog).health}`));
 assert.match($('#stat-override-warning').innerHTML,/\(1\)/);assert.equal($('#stat-override-warning').hidden,false);assert.equal($('#reset-stat-overrides').disabled,false);
  assert.deepEqual(b,before);
  delete b.statOverrides;$('#edit-character-stats').checked=false;vm.runInContext('renderCharacterStats()',context);
  assert.equal($('#stat-override-warning').hidden,true);assert.equal($('#reset-stat-overrides').disabled,true);
  assert.doesNotMatch($('#character-stats').innerHTML,/data-stat-override=/);
});
test('build import validates before changing the library and imports as a separate copy',()=>{
 const b=createBuild(catalog);b.statOverrides={health:12345};const {context,$}=harness(b);
 const start=source.indexOf('function importBuildText('),end=source.indexOf("$('#import-file')",start),fn=source.slice(start,end);
 vm.runInContext(fn,context);
 const raw={...b,version:2,gameBuildId:catalog.buildId};
 context.importBuildText(JSON.stringify(raw));assert.equal(context.library.builds.length,2);assert.notEqual(context.library.builds[1].id,b.id);assert.deepEqual(context.library.builds[1].statOverrides,b.statOverrides);assert.equal($('#import-dialog').closed,true);
 for(const raw of ['{',JSON.stringify({...b,version:2,gameBuildId:'wrong'}),JSON.stringify({...b,version:2,gameBuildId:catalog.buildId,statOverrides:{health:-1}})]){
   const count=context.library.builds.length,snapshot=structuredClone(context.library.builds);assert.throws(()=>context.importBuildText(raw));assert.equal(context.library.builds.length,count);assert.deepEqual(context.library.builds,snapshot);
 }
 context.library.builds=Array.from({length:100},(_,i)=>({...b,id:`${i}`}));assert.throws(()=>context.importBuildText(JSON.stringify(raw)),/Maximum 100/);assert.equal(context.library.builds.length,100);
});
test('conditions place skill buffs before Character conditions',()=>{
 const b=createBuild(catalog),{context,$}=harness(b);
 context.playerConditions=()=>[];context.emptyCombo=()=>({skills:{},active:false,burstActive:false});context.comboSummary=()=>({});context.comboEstimateMarkup=()=>'';context.townBuffMarkup=()=>'';context.disclosure=(id,title)=>`<h2>${title}</h2>`;
 context.sourceLink=()=>'';context.parameterTable=()=>'';
 vm.runInContext(`${func('renderConditions','comboEstimateMarkup')}\nrenderConditions()`,context);
  const html=$('#player-conditions').innerHTML;assert.ok(html.indexOf('Skill buffs')<html.indexOf('Character conditions'));
  for(const field of ['currentManaPercent','ngp','shadowCurses'])assert.ok(html.includes(`data-defence-setting="${field}"`));
});
test('defence scenario and manual recovery/resistance values validate and roundtrip independently',()=>{
 const b=createBuild(catalog);b.ngp=2;b.currentManaPercent=25;b.shadowCurses=3;
 b.statOverrides={healthRegen:8,manaRegen:9,moveSpeed:1.5,'resistances.fire':-10,armor:-20};
 const imported=validatePlannerBuild(JSON.parse(JSON.stringify(b)),catalog);
 assert.deepEqual(imported,b);imported.statOverrides.healthRegen=99;assert.equal(b.statOverrides.healthRegen,8);
 for(const [field,values] of [['ngp',[-1,1.5,10001,NaN,'1']],['currentManaPercent',[-1,101,Infinity,'50']]])for(const value of values){const bad=structuredClone(b);bad[field]=value;assert.throws(()=>validatePlannerBuild(bad,catalog));}
 for(const invalid of [{'resistances.physical':2},{'resistances.pure':2},{healthRegen:Infinity},{manaRegen:'2'}])assert.throws(()=>validatePlannerBuild({...b,statOverrides:invalid},catalog));
});
