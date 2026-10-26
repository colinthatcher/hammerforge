import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

const root=fileURLToPath(new URL('../',import.meta.url));
const {name,version}=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));

// Snapshot once at startup/build time, not per request. Never require Git in the image.
export function applicationInfo({env=process.env,cwd=root}={}){
  let gitRevision=env.GIT_REVISION?.trim();
  if(!gitRevision){
    try{gitRevision=execFileSync('git',['rev-parse','HEAD'],{cwd,encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:1000}).trim();}
    catch{gitRevision='unknown';}
  }
  return {status:'ok',name,version,gitRevision,buildDate:env.BUILD_DATE?.trim()||null};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const json=JSON.stringify(applicationInfo())+'\n';
  if(process.argv[2])writeFileSync(process.argv[2],json);
  else process.stdout.write(json);
}
