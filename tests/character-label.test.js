import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const helper=source.slice(source.indexOf('function characterLabel('),source.indexOf('const detailView='));
const catalog={classes:[{id:'warrior',name:'Warrior',specializations:[{id:'berserker',name:'Berserker'}]}]};
function label(character){return vm.runInNewContext(`${helper}\ncharacterLabel(character)`,{catalog,character});}

test('character dropdown labels show base class and current level',()=>{
  assert.equal(label({name:'Hero',classId:'warrior',specializationId:'warrior',level:1}),'Hero (Warrior · Level 1)');
});
test('character dropdown labels prefer specialization over base class',()=>{
  assert.equal(label({name:'Hero',classId:'warrior',specializationId:'berserker',level:42}),'Hero (Berserker · Level 42)');
});
test('character dropdown labels keep the level when no class is available',()=>{
  assert.equal(label({name:'Hero',level:5}),'Hero (Level 5)');
});
