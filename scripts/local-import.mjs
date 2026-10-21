import {readFile,readdir,stat,realpath} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {readCharacterFiles} from '../character-import.js';

// Discovery uses known save locations only; no request-supplied path is accepted.
export async function findLocalCharacters(catalog){
  const home=homedir();
  const roots=[join(home,'.local/share/Steam'),join(home,'.steam/steam'),join(home,'Library/Application Support/Steam'),...(process.env['ProgramFiles(x86)']?[join(process.env['ProgramFiles(x86)'],'Steam')]:[]),...(process.env.ProgramFiles?[join(process.env.ProgramFiles,'Steam')]:[])];
  const visited=new Set(),files=[],issues=[];
  async function scan(dir,namespace){
    let entries;try{const canonical=await realpath(dir);if(visited.has(canonical))return;visited.add(canonical);entries=await readdir(dir,{withFileTypes:true});}catch{return;}
    for(const entry of entries){if(!entry.isFile()||!/^\d+(?:_\d+)?\.hps$/i.test(entry.name))continue;
      const path=join(dir,entry.name);try{const info=await stat(path);files.push({name:entry.name,size:info.size,webkitRelativePath:`${namespace}/${entry.name}`,arrayBuffer:()=>readFile(path)});}catch{issues.push(`${entry.name}: could not read save`);}
      if(files.length>1000)throw Error('Too many local save files. Choose a specific saves folder.');
    }
  }
  for(const root of roots){
    let accounts=[];try{accounts=await readdir(join(root,'userdata'),{withFileTypes:true});}catch{}
    for(const account of accounts.filter(a=>a.isDirectory()&&/^\d+$/.test(a.name)))await scan(join(root,'userdata',account.name,'619820/remote/saves'),`steam/${account.name}`);
    await scan(join(root,'steamapps/common/Heroes of Hammerwatch 2/save'),'local');
  }
  const result=await readCharacterFiles(files,catalog);result.errors.push(...issues);return result;
}
