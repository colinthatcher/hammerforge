// Copy the pinned npm package's browser assets for offline, same-origin hosting.
import {cp,mkdir,rm} from 'node:fs/promises';
const target=new URL('../vendor/pglite/',import.meta.url);
await rm(target,{recursive:true,force:true});
await mkdir(target,{recursive:true});
await cp(new URL('../node_modules/@electric-sql/pglite/dist/',import.meta.url),target,{recursive:true});
console.log('Prepared local PGlite browser assets.');
