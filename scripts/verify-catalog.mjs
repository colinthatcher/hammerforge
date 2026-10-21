import {readFile} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
import {readArchive} from './game-resources.mjs';
const game=process.env.HOH2_GAME_DIR||join(homedir(),'.local/share/Steam/steamapps/common/Heroes of Hammerwatch 2');
const catalog=JSON.parse(await readFile('data/game-data.json','utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const archive=await readFile(join(game,'res/assets.bin'));
if(hash(archive)!==catalog.provenance.archiveSha256)throw new Error('Game archive has changed. Rebuild and review the catalog.');
const manifest=await readFile(join(dirname(dirname(game)),'appmanifest_619820.acf'),'utf8');
if(manifest.match(/"buildid"\s+"(\d+)"/)?.[1]!==catalog.buildId)throw new Error('Steam build ID has changed.');
const entries=readArchive(archive);
const native=catalog.provenance.nativeSaveHashEvidence;
if(native&&hash(await readFile(join(game,native.file)))!==native.sha256)throw new Error('Game executable differs from the native-save hash mapping evidence. Review the save importer.');
for(const [path,expected] of Object.entries(catalog.sources)){
 const bytes=path.startsWith('res/language/')?await readFile(join(game,path)):entries.get(path)?.read();
 if(!bytes||hash(bytes)!==expected)throw new Error(`Source hash mismatch: ${path}`);
}
console.log(`Verified archive, Steam build ${catalog.buildId}, and ${Object.keys(catalog.sources).length} source hashes against the installed game. This verifies provenance, not combat behavior.`);
