// Reader for the HW2R v4 resource archive observed in Steam build 25509441.
// Reads only; never modifies the game installation.
export function decodeLz4(input, size) {
 if(!Number.isInteger(size)||size<0||size>64*1024*1024)throw new Error('Invalid decoded size');
 const output=Buffer.alloc(size);let src=0,dst=0;
 const byte=()=>{if(src>=input.length)throw new Error('Truncated LZ4 block');return input[src++];};
 const length=initial=>{let n=initial;if(n===15){let extra;do{extra=byte();n+=extra;}while(extra===255);}return n;};
 while(src<input.length){
  const token=byte(),literals=length(token>>4);
  if(src+literals>input.length||dst+literals>size)throw new Error('Invalid LZ4 literals');
  input.copy(output,dst,src,src+literals);src+=literals;dst+=literals;
  if(src===input.length)break;
  const distance=byte()|(byte()<<8),match=length(token&15)+4;
  if(distance===0||distance>dst||dst+match>size)throw new Error('Invalid LZ4 match');
  for(let i=0;i<match;i++){output[dst]=output[dst-distance];dst++;}
 }
 if(dst!==size)throw new Error(`LZ4 size mismatch: ${dst} != ${size}`);
 return output;
}
export function readArchive(buffer) {
 if(buffer.length<21||buffer.toString('ascii',0,4)!=='HW2R'||buffer[4]!==4)throw new Error('Unsupported archive; expected HW2R v4');
 const count=buffer.readUInt32LE(17),entries=new Map();let pos=21;
 if(count>100000)throw new Error('Unreasonable archive entry count');
 const requireBytes=n=>{if(pos+n>buffer.length)throw new Error('Truncated archive');};
 for(let i=0;i<count;i++){
  requireBytes(4);const length=buffer.readUInt32LE(pos);pos+=4;
  if(length<1||length>1024)throw new Error('Invalid resource name length');
  requireBytes(length+1);const name=buffer.toString('utf8',pos,pos+length);pos+=length;
  if(name.startsWith('/')||name.includes('\\')||name.split('/').includes('..')||name.includes('\0')||entries.has(name))throw new Error('Unsafe or duplicate resource name');
  const flag=buffer[pos++];
  // External files have a 0xff flag followed by a 0xffffffff sentinel.
  if(flag===255){requireBytes(4);if(buffer.readUInt32LE(pos)!==0xffffffff)throw new Error('Invalid external resource');pos+=4;entries.set(name,{external:true});continue;}
  if(![1,3,7].includes(flag))throw new Error(`Unknown resource flag ${flag} for ${name}`);
  requireBytes(8);const size=buffer.readUInt32LE(pos),compressed=buffer.readUInt32LE(pos+4);pos+=8;
  requireBytes(compressed||size);const data=buffer.subarray(pos,pos+(compressed||size));pos+=data.length;
  entries.set(name,{size,compressed,read:()=>compressed?decodeLz4(data,size):data});
 }
 if(pos!==buffer.length)throw new Error('Unexpected trailing archive bytes');
 return entries;
}
