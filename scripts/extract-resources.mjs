import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join,dirname,resolve} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {readArchive} from './game-resources.mjs';

const game=process.env.HOH2_GAME_DIR||join(homedir(),'.local/share/Steam/steamapps/common/Heroes of Hammerwatch 2');
const output=resolve('.game-data');
const archive=await readFile(join(game,'res/assets.bin'));
const entries=readArchive(archive);
let written=0;
for(const [name,entry] of entries){
 const trainingTarget=/^doodads\/generic\/target_dummy_(normal|magic|armored)\.unit$/.test(name)||name==='doodads/generic/target_dummy.png';
 if(entry.external||!(trainingTarget||/^(players|scripts|tweak)\//.test(name)&&/\.(sval|as|inc|unit)$/.test(name)))continue;
 const path=join(output,name);await mkdir(dirname(path),{recursive:true});await writeFile(path,entry.read());written++;
}
await writeFile(join(output,'provenance.json'),JSON.stringify({archiveSha256:createHash('sha256').update(archive).digest('hex'),archiveEntries:entries.size,extractedResources:written},null,2)+'\n');
console.log(`Extracted ${written} reference resources to .game-data (${entries.size} archive entries). Game files were read only.`);
