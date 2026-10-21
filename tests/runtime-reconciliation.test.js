import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {calculateAbility,validatePlannerBuild} from '../planner-model.js';
import {runtimeReconciliationBuild} from './runtime-reconciliation-fixtures.js';

test('live-confirmed paladin mace and ranger dagger hits reconcile without per-class calibration',()=>{
  for(const [classId,normal,previous] of [['paladin',[93,10],105],['ranger',[124],120]]){
    const b=runtimeReconciliationBuild(catalog,classId),before=structuredClone(b);
    assert.deepEqual(validatePlannerBuild(b,catalog),b);
    const r=calculateAbility(b,catalog,b.focusSkill);
    assert.ok(r.supported);assert.deepEqual(r.components.map(c=>c.normalHit),normal);
    assert.ok(Math.abs(r.stats.damageMultiplier-1.035)<1e-12);
    assert.equal(r.stats.attackPower,classId==='paladin'?71:122);
    assert.equal(r.stats.mainHand.physical,classId==='paladin'?63:62);
    assert.ok(r.sources.includes('doodads/generic/target_dummy_magic.unit'));
    assert.equal(r.components.reduce((n,c)=>n+c.normalHit*c.hits,0)/r.hits,classId==='paladin'?103:124);
    assert.deepEqual(b,before);
    // Removing exactly the previously missing title and target settings
    // reproduces the user's original UI values, not a fitted correction.
    b.targetId='generic';b.progression.heroTitles.title_mat_gold=0;b.progression.heroTitles.title_mat_wood=0;
    const old=calculateAbility(b,catalog,b.focusSkill);
    assert.equal(old.components.reduce((n,c)=>n+c.normalHit*c.hits,0)/old.hits,previous);
  }
});

test('green-robed magic dummy has source-linked defenses and the reviewed town sprite frame',()=>{
  const t=catalog.targets.find(t=>t.id==='dummy-magic');
  assert.equal(t.armor,0);assert.equal(t.health,10000000);
  assert.deepEqual(t.resistances,{fire:100,ice:100,lightning:100,poison:100});
  assert.equal(t.townSprite.frame,'21 23 21 22');
  for(const path of [t.source,t.townSprite.texture,...t.mechanicSources])assert.match(catalog.sources[path],/^[a-f0-9]{64}$/);
});
