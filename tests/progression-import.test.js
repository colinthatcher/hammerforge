import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {gameHash} from '../save-codec.js';
import {importCharacterProfile} from '../character-import.js';
import {profileFixture,characterFixture} from './save-fixtures.js';
import {collectStats,validatePlannerBuild} from '../planner-model.js';

const armorer=(n,shop='armorer')=>[gameHash(shop),gameHash('attack-power'),n];
const imported=upgrades=>importCharacterProfile(profileFixture([characterFixture({'shop-upgrades':upgrades})]),catalog)[0];

test('native Armorer tier maps to selected catalog tier and includes tier thirteen mechanics',()=>{
  const row=imported(armorer(12));
  assert.equal(row.error,undefined);
  assert.equal(row.build.progression.armorerAttackPower,13);
  const tier=catalog.progression.armorer.steps[12];
  assert.equal(tier.modifiers[0]['attack-power'],65);
  assert.equal(collectStats(row.build,catalog).attackPower,65);
});

test('Armorer absent, zero-based first, invalid negative and unrelated shop tiers behave safely',()=>{
  assert.equal(imported([]).build.progression.armorerAttackPower,0);
  assert.equal(imported(armorer(0)).build.progression.armorerAttackPower,1);
  assert.equal(imported(armorer(-1)).build.progression.armorerAttackPower,0);
  assert.equal(imported(armorer(12,'mystic')).build.progression.armorerAttackPower,0);
  assert.ok(imported(armorer(catalog.progression.armorer.steps.length)).warnings.some(w=>w.includes('Armorer attack power tier capped')));
  assert.ok(imported([gameHash('armorer'),gameHash('attack-power'),1.5]).error);
});

test('missing native town accomplishment statistics default to zero with an actionable warning',()=>{
  const row=imported([]);
  assert.deepEqual(row.build.progression.accomplishmentAttributes,{str:0,dex:0,int:0,foc:0,vit:0});
  assert.ok(row.warnings.some(w=>w.includes('accomplishment attribute bonuses could not be fully reconstructed')));
  const rows=importCharacterProfile(profileFixture([characterFixture({class:'warrior','picked-str':61,'elixir-str':2}),characterFixture({'unique-key':42})]),catalog);
  assert.equal(rows[0].build.attributes.str,63);
  assert.equal(collectStats(rows[0].build,catalog).attributes.str,73);
  rows[0].build.progression.accomplishmentAttributes.str=15;
  assert.equal(collectStats(rows[0].build,catalog).attributes.str,88);
  assert.equal(rows[1].build.progression.accomplishmentAttributes.str,0);
});

const accomplishmentCatalog={...catalog,progression:{...catalog.progression,accomplishments:[
  {id:'achievement-alpha',source:'fixture',rewards:[{value:'3',attributes:{str:1,dex:0,int:2,foc:0,vit:0}},{value:'5',attributes:{str:2,dex:1,int:0,foc:1,vit:1}}]},
  {id:'achievement-beta',source:'fixture',rewards:[{value:'2',attributes:{str:0,dex:3,int:0,foc:0,vit:2}}]}
]}};
const accomplishmentProfile=(stats)=>profileFixture([characterFixture()],{town:{buildings:[],'stats-town':{stats}}});
const importAccomplishments=(stats)=>importCharacterProfile(accomplishmentProfile(stats),accomplishmentCatalog)[0];
const statTuple=(id,value,type=2)=>[id,type,value,{},{}];

test('native stat tuples apply ordered rewards inclusively and stack every attribute',()=>{
  const stats=['achievement-alpha',2,5,{}, {},'achievement-beta',3,2,{},{}];
  const row=importAccomplishments(stats);
  assert.equal(row.error,undefined);
  assert.deepEqual(row.build.progression.accomplishmentAttributes,{str:3,dex:4,int:2,foc:1,vit:3});
});

test('native accomplishment reward thresholds use exact inclusive boundaries',()=>{
  assert.deepEqual(importAccomplishments(['achievement-alpha',2,2,{}, {},'achievement-beta',2,0,{},{}]).build.progression.accomplishmentAttributes,{str:0,dex:0,int:0,foc:0,vit:0});
  assert.deepEqual(importAccomplishments(['achievement-alpha',2,3,{}, {},'achievement-beta',2,0,{},{}]).build.progression.accomplishmentAttributes,{str:1,dex:0,int:2,foc:0,vit:0});
});

test('malformed and unsupported town stats warn, preserve zero totals, and do not fail character import',()=>{
  for(const stats of [['achievement-alpha',9,5,{},{}],['achievement-alpha',2,-1,{},{}],['achievement-alpha',2,true,{},{}],['achievement-alpha',2,{}, {},{}],['achievement-alpha',2,5,{},[]],['achievement-alpha',2,5,{}]]){
    const row=importAccomplishments(stats);
    assert.equal(row.error,undefined);
    assert.deepEqual(row.build.progression.accomplishmentAttributes,{str:0,dex:0,int:0,foc:0,vit:0});
    assert.ok(row.warnings.some(w=>w.toLowerCase().includes('accomplishment')));
  }
});

test('absent defined statistics are treated as initialized zero while present accomplishment totals import',()=>{
  const row=importAccomplishments(statTuple('achievement-alpha',3));
  assert.deepEqual(row.build.progression.accomplishmentAttributes,{str:1,dex:0,int:2,foc:0,vit:0});
  assert.ok(row.warnings.includes('Town accomplishment attribute bonuses imported from saved town statistics.'));
});

test('wide decimal stat values compare exactly without unsafe Number conversion',()=>{
  const wideCatalog={...accomplishmentCatalog,progression:{...accomplishmentCatalog.progression,accomplishments:[{id:'wide-stat',source:'fixture',rewards:[{value:'9007199254740993',attributes:{str:4,dex:0,int:0,foc:0,vit:0}}]}]}};
  const row=importCharacterProfile(profileFixture([characterFixture()],{town:{buildings:[],'stats-town':{stats:statTuple('wide-stat','9007199254740993',3)}}}),wideCatalog)[0];
  assert.equal(row.error,undefined);assert.equal(row.build.progression.accomplishmentAttributes.str,4);
});

test('real accomplishment catalog imports all five attributes at exact thresholds and survives planner JSON roundtrip',()=>{
  const stats=catalog.progression.accomplishments.flatMap(d=>statTuple(d.id,'0'));
  const definition=catalog.progression.accomplishments.find(d=>d.id==='pickup-health');
  const index=catalog.progression.accomplishments.findIndex(d=>d.id===definition.id)*5;
  stats[index+2]=definition.rewards[0].value;
  const town={buildings:[], 'stats-town':{stats}};
  const char=characterFixture({'shop-upgrades':[gameHash('mystic'),gameHash('spell-power'),0,gameHash('armorer'),gameHash('attack-power'),1]});
  const row=importCharacterProfile(profileFixture([char],{town}),catalog)[0];
  assert.equal(row.error,undefined);assert.equal(row.build.progression.accomplishmentAttributes.vit,1);
  assert.equal(row.build.progression.mysticSpellPower,1);assert.equal(row.build.progression.armorerAttackPower,2);
  assert.ok(row.warnings.includes('Town accomplishment attribute bonuses imported from saved town statistics.'));
  const copy=validatePlannerBuild(JSON.parse(JSON.stringify(row.build)),catalog);
  assert.deepEqual(copy.progression,row.build.progression);
});
