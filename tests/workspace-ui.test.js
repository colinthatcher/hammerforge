import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/game-data.json' with {type:'json'};
import {ATTRIBUTES,resolveTarget,createBuild,createGear,availableSkills,calculateAbility,abilityDefinition} from '../planner-model.js';
import {runtimeReconciliationBuild} from './runtime-reconciliation-fixtures.js';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function renderFocus(){'),source.indexOf('function chooseBuild('));
const disclosure=source.match(/^function disclosure\(.*$/m)[0];
function render(build){
  const elements=new Map();
  const $=selector=>{
    if(!elements.has(selector))elements.set(selector,{innerHTML:'',textContent:'',insertAdjacentHTML(where,markup){this.innerHTML=where==='afterbegin'?markup+this.innerHTML:this.innerHTML+markup;}});
    return elements.get(selector);
  };
  const context={build,catalog,library:{builds:[build]},compareId:'',ATTRIBUTES,resolveTarget,calculateAbility,abilityDefinition,$,
    detailView:{capture(){},apply(){}},renderScheduler:{request:job=>job()},esc:v=>String(v??''),fmt:v=>v===null||!Number.isFinite(v)?'—':String(Math.round(v*10)/10),
    option:(v,label)=>`<option value="${v}">${label}</option>`,statusLabel:r=>r.status==='unlearned'?'Not learned':r.status,
    sourceLink:p=>`<code>${p}</code>`};
  vm.createContext(context);vm.runInContext(`${disclosure}\n${renderer}\nrenderFocus();`,context);return $;
}
const metric=(label,value)=>`<span>${label}:</span><strong>${Math.round(value*10)/10}</strong>`;
test('desktop summary and Calcs render the same model without changing build data',()=>{
  const build=createBuild(catalog),before=structuredClone(build),result=calculateAbility(build,catalog,build.focusSkill),$=render(build);
  assert.match($('#focus-output').innerHTML,/>DPS:</);
  assert.doesNotMatch($('#focus-output').innerHTML,/core DPS|Core DPS|CORE DPS/);
  assert.doesNotMatch($('#focus-output').innerHTML,/big-number|Damage breakdown/);
  assert.match($('#focus-output').innerHTML,/data-open-details="focus-assumptions"/);
  assert.match($('#calc-output').innerHTML,/component-table/);
  assert.ok($('#calc-output').innerHTML.includes(String(result.components[0].normalHit)));
  assert.match($('#focus-stats').innerHTML,/Spell power/);
  assert.match($('#sidebar-stats').innerHTML,/attr-str/);
  assert.equal($('#calc-skill-name').textContent,abilityDefinition(catalog,build.focusSkill).name);
  assert.equal($('#character-name').textContent,build.name);
  assert.deepEqual(build,before);
});
test('focus summary reports weighted non-critical and critical hits without changing DPS or build data',()=>{
  const build=createBuild(catalog),before=structuredClone(build),result=calculateAbility(build,catalog,build.focusSkill),$=render(build),html=$('#focus-output').innerHTML;
  const normal=result.components.reduce((sum,c)=>sum+c.normalHit*c.hits,0)/result.hits;
  const critical=result.components.reduce((sum,c)=>sum+c.criticalHit*c.hits,0)/result.hits;
  assert.match(html,/Non-critical hit/);assert.match(html,/Critical hit/);assert.doesNotMatch(html,/Average hit/);
  assert.ok(html.includes(metric('Non-critical hit',normal)));assert.ok(html.includes(metric('Critical hit',critical)));
  assert.ok(html.includes(metric('DPS',result.dps)));assert.deepEqual(build,before);
});
test('mixed-element multi-hit weapon summaries weight contacts rather than full-cycle damage',()=>{
  for(const [classId,baseId] of [['paladin','mainhand_mace_01'],['ranger','twohanded_daggers_01']]){
    const build=createBuild(catalog,classId),gear=createGear(catalog,baseId);
    gear.affixes=[{id:'mod_weapon_dmg_fire_1',roll:.5}];build.gear=[gear];
    const skill=availableSkills(build,catalog).find(s=>s.weaponAttack&&!s.secondary);assert.ok(skill);
    build.focusSkill=skill.source;
    const before=structuredClone(build),result=calculateAbility(build,catalog,build.focusSkill),$=render(build),html=$('#focus-output').innerHTML;
    assert.ok(result.supported);assert.ok(result.components.length>1);
    assert.equal(result.hits,classId==='paladin'?1:2);
    const expected=result.components.reduce((sum,c)=>sum+c.normalHit*c.hits,0)/result.hits;
    const critical=result.components.reduce((sum,c)=>sum+c.criticalHit*c.hits,0)/result.hits;
    assert.equal(expected,result.components.reduce((sum,c)=>sum+c.normalHit,0));
    assert.match(html,/Non-critical hit/);assert.match(html,/Critical hit/);assert.doesNotMatch(html,/Average hit/);
    assert.ok(html.includes(metric('Non-critical hit',expected)));assert.ok(html.includes(metric('Critical hit',critical)));
    assert.ok(html.includes(metric('DPS',result.dps)));
    assert.match(html,/Critical chance is included in DPS/);
    assert.deepEqual(build,before);
  }
});
test('unlearned abilities retain an explicit unavailable status in summary and Calcs',()=>{
  const build=createBuild(catalog);build.skills[build.focusSkill]={rank:0,upgrades:{}};const $=render(build);
  assert.match($('#focus-output').innerHTML,/Not learned/);
  assert.match($('#calc-output').innerHTML,/Not learned/);
  assert.doesNotMatch($('#focus-output').innerHTML,/Non-critical hit|Critical hit|Average hit/);
  assert.doesNotMatch($('#calc-output').innerHTML,/component-table/);
});
test('live-reconciled 103/124 hits render with the magic dummy defenses and correct TTK health',()=>{
  for(const [classId,hit] of [['paladin',103],['ranger',124]]){
    const b=runtimeReconciliationBuild(catalog,classId),$=render(b),result=calculateAbility(b,catalog,b.focusSkill);
    assert.ok($('#focus-output').innerHTML.includes(metric('Non-critical hit',hit)));
    assert.match($('#target-details').textContent,/10,000,000 health.*100 ice/);
    assert.match($('#calc-output').innerHTML,/Green-robed magic dummy/);
    assert.ok($('#calc-output').innerHTML.includes(String(Math.round(10000000/result.dps*10)/10)));
    assert.equal($('#armored').disabled,true);assert.equal($('#generic-armor').hidden,true);
    assert.match($('#target-preset').innerHTML,/dummy-magic/);
  }
});
test('old paladin exports distinguish missing donation titles, generic 108 and magic-dummy 103',()=>{
  const b=runtimeReconciliationBuild(catalog,'paladin');delete b.targetId;
  b.progression.heroTitles={title_ranger:17,title_wizard:0};
  b.importInfo={sourceId:'synthetic',profile:'Synthetic',fileName:'fixture.hps',unresolvedEquipped:0,warnings:['Set donation-title levels manually under Upgrades.']};
  const before=structuredClone(b),legacy=render(b);
  assert.ok(legacy('#focus-output').innerHTML.includes(metric('Non-critical hit',105)));
  assert.match(legacy('#focus-output').innerHTML,/title="Target: Generic target · no elemental resistance/);
  assert.match(legacy('#sidebar-model-warnings').innerHTML,/no saved gold donation-title level/);
  assert.deepEqual(b,before,'Rendering must not invent title levels or a target');
  b.progression.heroTitles.title_mat_gold=7;
  const generic=render(b);
  assert.ok(generic('#focus-output').innerHTML.includes(metric('Non-critical hit',108)));
  assert.equal(generic('#sidebar-model-warnings').innerHTML,'');
  b.targetId='dummy-magic';
  const magic=render(b);
  assert.ok(magic('#focus-output').innerHTML.includes(metric('Non-critical hit',103)));
  assert.match(magic('#focus-output').innerHTML,/Target: <strong>Green-robed magic dummy/);
});
test('workspace has unique IDs, real calculation/character tabs and inline incoming hits',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,new Set(ids).size);
  for(const id of ['tab-calcs','view-calcs','tab-character','view-character','calc-output','sidebar-stats','gear-slots','hero-resources','incoming-damage'])assert.ok(ids.includes(id),id);
  assert.doesNotMatch(html,/id="detail-level"|ui-review\.css|Find your next upgrade/);
  assert.match(html,/<section[^>]+aria-labelledby="incoming-hits-heading"/);
  assert.match(html,/<h2 id="incoming-hits-heading">Test incoming hits<\/h2>/);
  assert.match(html,/<link rel="stylesheet" href="pob.css">/);
  assert.ok(html.indexOf('id="target-preset"')>html.indexOf('id="view-conditions"'),'Target selection belongs in Configuration');
  assert.ok(html.indexOf('id="target-preset"')<html.indexOf('id="enemy-conditions"'),'Target selection sits with enemy conditions');
  assert.doesNotMatch(html,/data-sidebar-tab|sidebar-panel-survival/,'Incoming hits is no longer a tab');
  for(const id of ['sidebar-defences','character-stats','stat-override-warning','clipboard-copy','clipboard-read','clipboard-import'])assert.ok(ids.includes(id),id);
});
