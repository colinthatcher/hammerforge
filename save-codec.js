// Read-only decoder for observed Heroes of Hammerwatch II H2SV v4 saves.
// No engine code is executed; all lengths and decompressed allocations are bounded.
export const SAVE_LIMITS = {file:16*1024*1024,block:16*1024*1024,total:64*1024*1024,characters:1000};
class Reader {
  constructor(bytes){this.bytes=bytes;this.view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);this.pos=0;}
  need(n){if(!Number.isSafeInteger(n)||n<0||this.pos+n>this.bytes.length)throw Error('Truncated save data');}
  u8(){this.need(1);return this.bytes[this.pos++];}
  u32(){this.need(4);const v=this.view.getUint32(this.pos,true);this.pos+=4;return v;}
  i32(){this.need(4);const v=this.view.getInt32(this.pos,true);this.pos+=4;return v;}
  f32(){this.need(4);const v=this.view.getFloat32(this.pos,true);this.pos+=4;if(!Number.isFinite(v))throw Error('Non-finite save number');return v;}
  wide(signed=false){this.need(8);const v=signed?this.view.getBigInt64(this.pos,true):this.view.getBigUint64(this.pos,true);this.pos+=8;return v<=BigInt(Number.MAX_SAFE_INTEGER)&&v>=BigInt(Number.MIN_SAFE_INTEGER)?Number(v):v.toString();}
  string(){const start=this.pos;while(this.pos<this.bytes.length&&this.bytes[this.pos]!==0&&this.pos-start<=65536)this.pos++;if(this.pos>=this.bytes.length||this.pos-start>65536)throw Error('Invalid save string');const text=new TextDecoder('utf-8',{fatal:true}).decode(this.bytes.subarray(start,this.pos));this.pos++;return text;}
  take(n){this.need(n);const bytes=this.bytes.subarray(this.pos,this.pos+n);this.pos+=n;return bytes;}
}
export function decompressSaveBlock(input,size){
  if(!Number.isInteger(size)||size<0||size>SAVE_LIMITS.block)throw Error('Save block is too large');
  const output=new Uint8Array(size);let src=0,dst=0;
  const byte=()=>{if(src>=input.length)throw Error('Truncated LZ4 save block');return input[src++];};
  const length=initial=>{let n=initial;if(n===15){let extra;do{extra=byte();n+=extra;}while(extra===255);}return n;};
  while(src<input.length){const token=byte(),literals=length(token>>4);if(src+literals>input.length||dst+literals>size)throw Error('Invalid LZ4 save literals');output.set(input.subarray(src,src+literals),dst);src+=literals;dst+=literals;if(src===input.length)break;const offset=byte()|(byte()<<8),match=length(token&15)+4;if(!offset||offset>dst||dst+match>size)throw Error('Invalid LZ4 save match');for(let i=0;i<match;i++){output[dst]=output[dst-offset];dst++;}}
  if(dst!==size)throw Error('Save decompression length mismatch');return output;
}
export function decodeSaveValue(bytes){
  const reader=new Reader(bytes);let nodes=0;
  function read(depth=0){
    if(depth>64||++nodes>500000)throw Error('Save structure is too complex');
    const offset=reader.pos,type=reader.u8();
    switch(type){
      case 0:return null;
      case 1:{const count=reader.u32();if(count>200000||count>reader.bytes.length-reader.pos)throw Error('Invalid save array length');return Array.from({length:count},()=>read(depth+1));}
      case 2:{const count=reader.u32();if(count>50000)throw Error('Invalid save dictionary length');const dict=Object.create(null);for(let i=0;i<count;i++){const key=reader.string();if(Object.hasOwn(dict,key))throw Error(`Duplicate save dictionary key ${JSON.stringify(key)} at offset ${reader.pos}`);dict[key]=read(depth+1);}return dict;}
      case 3:return reader.u8()!==0;
      case 4:return reader.f32();
      case 5:return reader.i32();
      case 6:return reader.string();
      case 7:{const length=reader.u32();if(length>SAVE_LIMITS.block)throw Error('Save binary value is too large');return reader.take(length);}
      case 8:return [reader.f32(),reader.f32()];
      case 9:return [reader.f32(),reader.f32(),reader.f32()];
      case 10:return [reader.f32(),reader.f32(),reader.f32(),reader.f32()];
      case 11:return reader.wide(true);
      case 12:{reader.need(8);const v=reader.view.getFloat64(reader.pos,true);reader.pos+=8;if(!Number.isFinite(v))throw Error('Non-finite save double');return v;}
      case 101:return [];
      case 102:return Object.create(null);
      case 103:return true;
      case 104:return false;
      case 105:return 0;
      case 109:return '';
      case 110:return 0;
      case 115:return 0;
      case 120:return null;
      default:throw Error(`Unsupported save value type ${type} at offset ${offset}`);
    }
  }
  const result=read();if(reader.pos!==bytes.length)throw Error(`Unconsumed save value data at ${reader.pos}/${bytes.length}`);return result;
}
export function decodeCharacterProfile(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);if(bytes.length>SAVE_LIMITS.file)throw Error('Save exceeds 16 MB limit');
  const reader=new Reader(bytes);
  if(new TextDecoder().decode(reader.take(4))!=='H2SV')throw Error('Not a Heroes of Hammerwatch II save');
  if(reader.u32()!==4)throw Error('Unsupported save version (expected H2SV v4)');
  const savedAt=reader.wide(),name=reader.string();
  // Profile flags/mod metadata precede the town block and vary by mod selection.
  // Locate only a bounded candidate whose town value and every character record
  // decode exactly, including matching unique keys and the end of the file.
  const begin=reader.pos;let lastError,budget=SAVE_LIMITS.total;
  for(let offset=begin;offset<Math.min(bytes.length-12,begin+4096);offset++){
    const raw=reader.view.getUint32(offset,true),compressed=reader.view.getUint32(offset+4,true);
    if(raw<5||raw>SAVE_LIMITS.block||compressed<5||offset+8+compressed+4>bytes.length)continue;
    try{
      reader.pos=offset;let total=0;
      const block=(decode=true)=>{const size=reader.u32(),length=reader.u32();total+=size;budget-=size;if(budget<0)throw Error('Save header discovery exceeds shared decoding budget');if(size>SAVE_LIMITS.block||total>SAVE_LIMITS.total)throw Error('Decompressed profile exceeds limit');const bytes=length?decompressSaveBlock(reader.take(length),size):reader.take(size);return decode?decodeSaveValue(bytes):null;};
      const town=block();if(!town||Array.isArray(town)||!Object.hasOwn(town,'buildings'))continue;
      const count=reader.u32();if(count>SAVE_LIMITS.characters)throw Error('Too many characters in profile');
      const characters=[],ids=new Set();
      for(let i=0;i<count;i++){
        const id=reader.u32(),record=block();
        if(!record||Array.isArray(record)||(record['unique-key']>>>0)!==id||ids.has(id))throw Error('Invalid character record');
        ids.add(id);
        const scenes=reader.u32();if(scenes>1000)throw Error('Too many saved scenes');
        for(let j=0;j<scenes;j++){
          reader.string();block(false);block(false);
          reader.string();reader.take(8); // Scene resource and opaque engine identifiers.
        }
        if(id!==0&&typeof record.name==='string'&&typeof record.class==='string'&&record.level>0)characters.push({id,record});
      }
      if(reader.pos!==bytes.length-4)throw Error(`Trailing profile data at ${reader.pos}/${bytes.length}`);
      reader.u32(); // Opaque engine checksum; not currently verified.
      return {version:4,name,savedAt,town,characters,headerMetadata:Array.from(bytes.subarray(begin,offset))};
    }catch(error){if(budget<0)throw error;lastError=error;}
  }
  throw Error(`Unable to decode this save profile${lastError?`: ${lastError.message}`:'. Its header/layout may be unsupported.'}`);
}

// MurmurHash3 x86-32 with the seed used by this game's registered HashString.
// Corroborated against multiple serialized equipment and modifier IDs.
export function hashBytes(bytes,seed=0xf808409c){
  const rotate=(x,n)=>(x<<n)|(x>>>(32-n));
  const mix=k=>Math.imul(rotate(Math.imul(k,0xcc9e2d51),15),0x1b873593);
  let hash=seed,i=0;
  for(;i+4<=bytes.length;i+=4){hash^=mix(bytes[i]|bytes[i+1]<<8|bytes[i+2]<<16|bytes[i+3]<<24);hash=(Math.imul(rotate(hash,13),5)+0xe6546b64)|0;}
  let tail=0;for(let j=i;j<bytes.length;j++)tail|=bytes[j]<<((j-i)*8);if(i<bytes.length)hash^=mix(tail);
  hash^=bytes.length;hash^=hash>>>16;hash=Math.imul(hash,0x85ebca6b);hash^=hash>>>13;hash=Math.imul(hash,0xc2b2ae35);return (hash^(hash>>>16))>>>0;
}
export const gameHash=id=>hashBytes(new TextEncoder().encode(id));
