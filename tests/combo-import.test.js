import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {importCharacterProfile} from '../character-import.js';
import {characterFixture,profileFixture} from './save-fixtures.js';
import {gameHash} from '../save-codec.js';

const importRecord=combo=>importCharacterProfile(profileFixture([characterFixture({'picked-combo-skills':combo})]),catalog,'0.hps')[0];

test('imports picked combo skill IDs and caps ranks without inferring active combat state',()=>{
  const def=catalog.combos.skills[0], row=importRecord({[def.id]:def.rankCount+5});
  assert.equal(row.error,undefined);
  assert.deepEqual(row.build.combo,{skills:{[def.id]:def.rankCount},active:false,burstActive:false});
  assert.ok(row.warnings.some(w=>w.includes('capped')));
});

test('empty or missing combo dictionaries preserve legacy builds',()=>{
  assert.equal(importRecord({}).build.combo,undefined);
  const legacy=characterFixture();delete legacy['picked-combo-skills'];
  const row=importCharacterProfile(profileFixture([legacy]),catalog,'0.hps')[0];
  assert.equal(row.build.combo,undefined);
});

test('unknown combo IDs warn and malformed dictionaries or ranks are rejected',()=>{
  const unknown=importRecord({removed_combo_skill:1});
  assert.ok(unknown.warnings.some(w=>w.includes('removed_combo_skill')));
  assert.match(importRecord([]).error,/combo skill dictionary/);
  assert.match(importRecord({combo_kills:'1'}).error,/combo skill rank/);
});

test('mutually exclusive saved combo choices are rejected explicitly',()=>{
  const row=importRecord({combo_kills:1,combo_dash:1});
  assert.match(row.error,/mutually exclusive/);
});
test('legacy library activation migrates as in PlayerRecord without assuming active state',()=>{
  const row=importCharacterProfile(profileFixture([characterFixture({'library-skill':gameHash('combo_dash')})]),catalog)[0];
  assert.equal(row.error,undefined);assert.deepEqual(row.build.combo,{skills:{combo_dash:1},active:false,burstActive:false});
});
