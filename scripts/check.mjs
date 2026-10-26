import {spawnSync} from 'node:child_process';
import {readdirSync} from 'node:fs';
const files=['app.js','model.js','planner-model.js','save-codec.js','character-import.js','character-import-ui.js','survival-ui.js','ui-details.js','ui-render.js',...readdirSync('combat').filter(f=>f.endsWith('.js')).map(f=>'combat/'+f),...readdirSync('scripts').filter(f=>f.endsWith('.mjs')).map(f=>'scripts/'+f)];
files.push('build-storage.js','app-version.js');
for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log(`Syntax checked ${files.length} JavaScript files.`);
