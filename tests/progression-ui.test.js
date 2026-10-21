import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import catalog from '../data/game-data.json' with {type:'json'};
import {ATTRIBUTES,createBuild,validatePlannerBuild} from '../planner-model.js';
import {emptyProgression,emptyAccomplishmentAttributes} from '../combat/progression.js';

// Exercise the actual renderer and progression event branch without requiring a
// browser dependency. This is a DOM-boundary unit check, not a browser E2E test.
const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const renderer=source.slice(source.indexOf('function progressionMarkup(){'),source.indexOf('function townBuffMarkup(){'));
const disclosure=source.match(/^function disclosure\(.*$/m)[0];
const eventBranch=source.slice(source.indexOf('  if(d.progressionKind){'),source.indexOf('  if(d.conditionSide)'));
function context(build){
  const c={build,catalog,ATTRIBUTES,emptyProgression,emptyAccomplishmentAttributes,
    esc:v=>String(v??''),option:(v,label,selected)=>`<option value="${v}"${v===selected?' selected':''}>${label}</option>`,
    sourceLink:p=>p,modifierText:()=>'',updates:0,renders:0};
  c.update=()=>c.updates++;c.render=()=>c.renders++;
  vm.createContext(c);vm.runInContext(`${disclosure}\n${renderer}; function change(e,d){${eventBranch}}`,c);return c;
}
test('progression UI renders Armorer selected tier and five separate accomplishment inputs',()=>{
  const b=createBuild(catalog,'warrior');b.progression=emptyProgression();b.progression.armorerAttackPower=13;b.progression.accomplishmentAttributes.str=15;
  const c=context(b),markup=c.progressionMarkup();
  assert.match(markup,/data-progression-kind="armorerAttackPower"/);
  assert.match(markup,/<option value="13" selected>Weapon 13 · \+65 attack power<\/option>/);
  for(const [a,n] of Object.entries(b.progression.accomplishmentAttributes)){
    assert.ok(markup.includes(`data-progression-id="${a}" value="${n}"`));
  }
  assert.match(markup,/Native H2SV imports derive these bonuses from observed town statistics when available/);
  assert.match(markup,/enter only the Accomplishments contribution/);
  assert.match(markup,/data-disclosure="town-progression"/);
  assert.match(markup,/data-disclosure="accomplishments"/);
});
test('progression UI edits legacy fields as a scalar tier and a complete independent attribute record',()=>{
  const b=createBuild(catalog,'warrior');b.progression={mysticSpellPower:0,spellMasteries:{},heroTitles:{},townBuffs:{}};
  const c=context(b);assert.ok(c.progressionMarkup().includes('value="0"'));
  const event=value=>({target:{value,type:'number',checkValidity:()=>true}});
  c.change(event('13'),{progressionKind:'armorerAttackPower'});
  c.change(event('15'),{progressionKind:'accomplishmentAttributes',progressionId:'str'});
  assert.equal(b.progression.armorerAttackPower,13);
  assert.deepEqual(b.progression.accomplishmentAttributes,{str:15,dex:0,int:0,foc:0,vit:0});
  assert.doesNotThrow(()=>validatePlannerBuild(b,catalog));assert.equal(c.updates,2);
  c.change({target:{value:'-1',type:'number',checkValidity:()=>false,reportValidity:()=>{}}},{progressionKind:'accomplishmentAttributes',progressionId:'str'});
  assert.equal(b.progression.accomplishmentAttributes.str,15);assert.equal(c.updates,2);assert.equal(c.renders,1);
});
