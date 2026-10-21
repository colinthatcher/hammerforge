import test from 'node:test';
import assert from 'node:assert/strict';
import {expandLiteralBlocks,buildStatusCatalog} from '../scripts/status-catalog.mjs';
import {parseSval,normalizeSval} from '../scripts/sval.mjs';

test('literal blocks preserve numeric text, quoted arguments, nested calls and comments',()=>{
 const text=`<!-- %include "ignored" -->
%defblock Inner ID AMOUNT UNUSED
<dict name="%%ID%%"><float name="amount">%%AMOUNT%%</float><int name="timer">6000</int></dict>
%endblock
%defblock Outer ID VALUE
%block Inner "%%ID%%" %%VALUE%%
%endblock
%// %if ignored
%block Outer "quoted id" -1.25e-2
%block Inner second 0.30`;
 const expanded=expandLiteralBlocks(text);
 assert.match(expanded,/>0\.30</);
 assert.doesNotMatch(expanded,/%|ignored/);
 assert.deepEqual(parseSval(expanded).children.map(n=>[n.name,normalizeSval(n)]),[
  ['quoted id',{amount:-0.0125,timer:6000}],['second',{amount:0.3,timer:6000}],
 ]);
});

test('literal blocks reject unresolved placeholders, unknown calls, malformed and recursive blocks',()=>{
 for(const [text,pattern] of [
  ['%defblock A X\n<float>%%X%%</float>\n%endblock\n%block A',/Unresolved/],
  ['%defblock A\n<float>%%OTHER%%</float>\n%endblock\n%block A',/Unresolved/],
  ['<float>%%OUTSIDE%%</float>',/Unresolved/],
  ['%block Missing',/Unknown block/],
  ['%defblock A\n%block B\n%endblock\n%defblock B\n%block A\n%endblock\n%block A',/Recursive/],
  ['%defblock A\n%block A\n%endblock\n%block A',/Recursive/],
  ['%defblock A\n<int>1</int>',/Unclosed/],
  ['%defblock A\n%endblock\n%defblock A\n%endblock',/Duplicate/],
  ['%defblock A\n%endblock\n%block A extra',/Too many/],
  ['%block A "unclosed',/Unterminated/],
 ])assert.throws(()=>expandLiteralBlocks(text),pattern);
});

test('literal blocks explicitly reject active conditionals, includes and other directives',()=>{
 for(const directive of ['%if FLAG','%else','%endif','%include "other.sval"','%define VALUE 1']){
  assert.throws(()=>expandLiteralBlocks(directive),/Unsupported preprocessor/);
  assert.throws(()=>expandLiteralBlocks(`%defblock A\n${directive}\n%endblock\n%block A`),/Unsupported preprocessor/);
 }
 // An unused declaration cannot contribute conditional values to the output.
 assert.equal(expandLiteralBlocks('%defblock Unused\n%if X\n%endblock\n<int>2</int>'),'\n<int>2</int>'.trimStart());
});

// Synthetic definitions, not game mechanics. Every required source and ID is
// provided without an installation, generated catalog, or main-builder import.
function fixture(){
 const sources=new Map();
 const buff=id=>`<dict name="${id}"><int name="duration">1234</int><float name="armor-mul">0.73</float></dict>`;
 const enemyIDs=['vulnerability','marked','armor_break','weakness','cripple','stun','freeze','blindness','slow','disarm','silence'];
 sources.set('tweak/buffs/status_effects.sval',`<svals>${enemyIDs.flatMap(id=>[`${id}_minor`,id,`${id}_greater`,`${id}_area`]).map(buff).join('')}</svals>`);
 for(const [id,classId,count] of [['warcry','warrior',5],['powersurge','sorcerer',3]])sources.set(`players/${classId}/buffs_${classId}.sval`,`<svals>${Array.from({length:count},(_,i)=>buff(`${id}_${i+1}`)).join('')}</svals>`);
  const stackIDs={wizard:['haste','incanters_flow','barrier','barrier_fire'],warrior:['killing_spree','rage'],rogue:['slice_and_dice','sidestep'],warlock:['essence'],priest:[...Array.from({length:9},(_,i)=>`divine_favor_${i+2}`),'ecstasy'],sorcerer:['elementalist_fire','elementalist_ice','elementalist_lightning'],ranger:['rhythm','survivalist'],paladin:['inner_flame','divine_protection']};
 for(const [classId,ids] of Object.entries(stackIDs))sources.set(`players/${classId}/stacks_${classId}.sval`,`<loader>ActorBuffStackDef::LoadMultiple</loader><array>${ids.map(id=>`<dict><string name="id">${id}</string><string name="name">.fixture.${id}</string><int name="max">17</int><bool name="extrapolate-intensity">false</bool><dict name="timer"><int name="time">3210</int><int name="add-stack">-999</int></dict><dict name="buff"><array name="tags"><string>fixture-tag</string></array><array name="modifiers"><dict><string name="class">Modifiers::DummyModifier</string></dict></array></dict></dict>`).join('')}</array>`);
 return sources;
}

test('catalog maps all curated families, source keys and raw definitions from injected sources',async()=>{
 const sources=fixture(),reads=[];
 const catalog=await buildStatusCatalog({source:async path=>{reads.push(path);assert.ok(sources.has(path),path);return sources.get(path);},localize:key=>`Localized ${key}`});
 assert.equal(catalog.enemy.length,11);
  assert.equal(catalog.player.length,20);
  assert.equal(reads.length,11);
 assert.equal(new Set(reads).size,reads.length);
 for(const family of catalog.enemy){
  assert.deepEqual(family.variants.map(v=>v.id),[`${family.id}_minor`,family.id,`${family.id}_greater`]);
  assert.deepEqual(family.variants.map(v=>v.name),['Minor','Normal','Greater']);
  for(const v of family.variants){assert.equal(v.sourceKey,v.id);assert.equal(v.definition['armor-mul'],0.73);}
 }
 const byID=Object.fromEntries(catalog.player.map(f=>[f.id,f]));
 assert.equal(byID.warcry.classId,undefined);
 assert.equal(byID.warcry.variants.length,5);
 assert.equal(byID.powersurge.classId,'sorcerer');
 assert.equal(byID.powersurge.variants.length,3);
 assert.equal(byID.slice_and_dice.sourceKey,'slice_and_dice');
 assert.equal(byID.slice_and_dice.skillId,'rog_slice_and_dice');
 assert.equal(byID.elemental_fire.sourceKey,'elementalist_fire');
 assert.equal(byID.divine_favor.sourceKeyBinding,'stacks-buff');
  assert.equal(byID.divine_favor.sourceKey,undefined);
  for(const [id,classId,skillId,sourceKey] of [
   ['rhythm','ranger','ran_rhythm','rhythm'],['survivalist','ranger','ran_survivalist','survivalist'],
   ['inner_flame','paladin','radiance_flames','inner_flame'],['barrier','wizard','wiz_barrier','barrier'],
   ['barrier_fire','wizard','wiz_barrier','barrier_fire'],['sidestep','rogue','rog_evasion','sidestep'],
   ['divine_protection','paladin','divine_protection','divine_protection'],['ecstasy','priest','flagellate','ecstasy'],
  ]){assert.equal(byID[id].classId,classId);assert.equal(byID[id].skillId,skillId);assert.equal(byID[id].sourceKey,sourceKey);}
  assert.deepEqual({maxAddBinding:byID.barrier.maxAddBinding,selectionMax:byID.barrier.selectionMax},{maxAddBinding:'barrier-stacks',selectionMax:5});
  assert.equal(byID.barrier_fire.requiredUpgrade,'wiz_barrier_fire');
  assert.equal(byID.ecstasy.requiredUpgrade,'flagellate_ecstasy');
 assert.deepEqual(Object.keys(byID.divine_favor.definitions),Array.from({length:9},(_,i)=>`divine_favor_${i+2}`));
 const raw=byID.haste.definitions.haste;
 assert.equal(byID.haste.name,'Localized .fixture.haste');
 assert.equal(raw.name,'.fixture.haste');
 assert.equal(raw.max,17);
 assert.equal(raw['extrapolate-intensity'],false);
 assert.deepEqual(raw.timer,{time:3210,'add-stack':-999});
 assert.deepEqual(raw.buff,{tags:['fixture-tag'],modifiers:[{class:'Modifiers::DummyModifier'}]});
});

test('missing required fixed, stack and partial enemy definitions fail with source IDs',async()=>{
 for(const [path,id] of [
  ['players/warrior/buffs_warrior.sval','warcry_5'],
  ['players/rogue/stacks_rogue.sval','slice_and_dice'],
  ['players/priest/stacks_priest.sval','divine_favor_10'],
  ['tweak/buffs/status_effects.sval','vulnerability_greater'],
 ]){
  const sources=fixture();sources.set(path,sources.get(path).replace(id,'removed'));
  await assert.rejects(buildStatusCatalog({source:async path=>sources.get(path),localize:key=>key}),error=>error.message.includes(id)&&error.message.includes(path));
 }
});
