import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {importCharacterProfile,mapSavedCharacter} from '../character-import.js';
import {profileFixture,characterFixture} from './save-fixtures.js';

const donationCatalog={...catalog,progression:{...catalog.progression,heroTitles:catalog.progression.heroTitles.map(t=>t.donationMaterial?{...t,donationStat:`chapel-revive-${t.donationMaterial}`,donationDivisor:t.donationMaterial==='gold'?3000:10}:t)}};
const tuple=(id,value)=>[id,2,value,{},{}];
const importTown=(stats,chars=[characterFixture()])=>importCharacterProfile(profileFixture(chars,{town:{buildings:[],'stats-town':{stats}}}),donationCatalog);

test('native donation stats reconstruct rounded gold and wood title levels',()=>{
  const row=importTown([...tuple('chapel-revive-gold','150316'),...tuple('chapel-revive-wood','516')])[0];
  assert.equal(row.error,undefined);
  assert.equal(row.build.progression.heroTitles.title_mat_gold,7);
  assert.equal(row.build.progression.heroTitles.title_mat_wood,7);
  assert.ok(row.warnings.some(w=>w.includes('Donation titles reconstructed')));
  assert.ok(!row.warnings.some(w=>w.includes('Set donation-title levels manually')));
});

test('donation thresholds round inclusively and missing initialized stats are zero',()=>{
  for(const [amount,level] of [[749,0],[750,1],[6749,1],[6750,2]])assert.equal(importTown(tuple('chapel-revive-gold',String(amount)))[0].build.progression.heroTitles.title_mat_gold,level);
  const row=importTown(tuple('unrelated-stat','5'))[0];
  assert.equal(row.build.progression.heroTitles.title_mat_gold,0);
  assert.equal(row.build.progression.heroTitles.title_mat_wood,0);
});

test('malformed native tuples warn without applying donation levels',()=>{
  for(const stats of [['chapel-revive-gold',9,'150316',{},{}],['chapel-revive-gold',2,'-1',{},{}],['chapel-revive-gold',2,'1.5',{},{}],['chapel-revive-gold',2,'150316',{},{} , 'bad']]){
    const row=importTown(stats)[0];
    assert.equal(row.error,undefined);
    assert.equal(row.build.progression.heroTitles.title_mat_gold,0);
    assert.ok(row.warnings.some(w=>w.includes('Donation title levels could not be reconstructed')));
  }
});

test('donation statistics remain scoped to each imported profile',()=>{
  const rows=importTown(tuple('chapel-revive-gold','150316'),[characterFixture(),characterFixture({'unique-key':42})]);
  assert.equal(rows[0].build.progression.heroTitles.title_mat_gold,7);
  assert.equal(rows[1].build.progression.heroTitles.title_mat_gold,7);
  const other=importTown(tuple('chapel-revive-gold','750'))[0];
  assert.equal(other.build.progression.heroTitles.title_mat_gold,1);
  assert.equal(rows[0].build.progression.heroTitles.title_mat_gold,7);
});
test('wide donation totals cap explicitly and malformed numeric totals fall back safely',()=>{
  const row=importTown(tuple('chapel-revive-gold','9223372036854775807'))[0];
  assert.equal(row.build.progression.heroTitles.title_mat_gold,10000);
  assert.ok(row.warnings.some(w=>w.includes('capped')));
  for(const value of [NaN,Infinity,-1,1.5,Number.MAX_SAFE_INTEGER+1]){
    const record=characterFixture(),character={record,id:0};
    const b=mapSavedCharacter(character,{name:'Synthetic',characters:[character],town:{buildings:[],'stats-town':{stats:tuple('chapel-revive-gold',value)}}},donationCatalog,'0.hps');
    assert.equal(b.progression.heroTitles.title_mat_gold,0);
    assert.ok(b.importInfo.warnings.some(w=>w.includes('Donation title levels could not be reconstructed')));
  }
});
