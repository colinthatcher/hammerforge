// Synthetic profiles only. Never commit a player's real saves as fixtures.
import {gameHash} from '../save-codec.js';
export const u32=value=>{const b=Buffer.alloc(4);b.writeUInt32LE(value>>>0);return b;};
const string=value=>Buffer.from(value+'\0','utf8');
export function encodeValue(value){
  if(value===null)return Buffer.from([0]);
  if(Array.isArray(value))return Buffer.concat([Buffer.from([1]),u32(value.length),...value.map(encodeValue)]);
  if(value instanceof Uint8Array)return Buffer.concat([Buffer.from([7]),u32(value.length),value]);
  if(typeof value==='object')return Buffer.concat([Buffer.from([2]),u32(Object.keys(value).length),...Object.entries(value).flatMap(([k,v])=>[string(k),encodeValue(v)])]);
  if(typeof value==='boolean')return Buffer.from([value?103:104]);
  if(typeof value==='string')return value?Buffer.concat([Buffer.from([6]),string(value)]):Buffer.from([109]);
  if(value===0)return Buffer.from([110]);
  const b=Buffer.alloc(5);if(Number.isInteger(value)){b[0]=5;b.writeInt32LE(value|0,1);}else{b[0]=4;b.writeFloatLE(value,1);}return b;
}
export function literalBlock(bytes){const extra=[];if(bytes.length>=15){let remaining=bytes.length-15;while(remaining>=255){extra.push(255);remaining-=255;}extra.push(remaining);}return Buffer.concat([Buffer.from([Math.min(15,bytes.length)<<4,...extra]),bytes]);}
const block=bytes=>{const compressed=literalBlock(bytes);return Buffer.concat([u32(bytes.length),u32(compressed.length),compressed]);};
export function characterFixture(overrides={}){
  return {'unique-key':123456,name:'Fixture mage',class:'wizard',level:20,'picked-int':7,'elixir-int':2,'picked-skills':{wiz_magic_missiles:2,fireball:3},'picked-temp-skills':{wiz_magic_missiles_projectiles:2},equipped:[null,null,[4,gameHash('head_str_t1a')|0,.9,19,2,0,0,gameHash('mod_int')|0]],equipment:[],trinkets:['book_spells','book_spells'],'attuned-trinkets':[gameHash('book_spells')|0],...overrides};
}
export function profileFixture(records=[characterFixture()],{name='Synthetic profile',savedAt=1700000000000,scene=false,metadata=Buffer.alloc(6),town={buildings:[],ngp:0}}={}){
  const timestamp=Buffer.alloc(8);timestamp.writeBigUInt64LE(BigInt(savedAt));
  const scenes=scene?Buffer.concat([u32(1),string('Fixture scene'),block(Buffer.from([126,1,2,3])),block(Buffer.from([126,4,5])),string('levels/fixture.lvl'),Buffer.alloc(8)]):u32(0);
  return Buffer.concat([Buffer.from('H2SV'),u32(4),timestamp,string(name),metadata,block(encodeValue(town)),u32(records.length),...records.flatMap(record=>[u32(record['unique-key']),block(encodeValue(record)),scenes]),u32(0)]);
}
export function fileFixture(name,bytes,relativePath=''){
  return {name,size:bytes.length,webkitRelativePath:relativePath,arrayBuffer:async()=>bytes};
}
