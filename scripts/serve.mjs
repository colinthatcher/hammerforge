import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, extname, sep} from 'node:path';
import {findLocalCharacters} from './local-import.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const port=Number(process.env.PORT||5173);
if(!Number.isInteger(port)||port<1||port>65535)throw Error('PORT must be an integer from 1 to 65535');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.wasm':'application/wasm'};
const server=createServer(async(req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  try {
   const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
   if(pathname==='/api/local-characters'){
     const hosts=[`localhost:${port}`,`127.0.0.1:${port}`];
     const allowedOrigins=hosts.map(host=>'http://'+host);
     if(!hosts.includes(req.headers.host)||(req.headers.origin&&!allowedOrigins.includes(req.headers.origin))||(req.headers['sec-fetch-site']&&!['same-origin','none'].includes(req.headers['sec-fetch-site']))){res.writeHead(403);res.end('Local import requires the local planner origin');return;}
     if(req.method==='HEAD'){res.writeHead(200,{'Cache-Control':'no-store'});res.end();return;}
     try{const catalog=JSON.parse(await readFile(resolve(root,'data/game-data.json'),'utf8'));const result=await findLocalCharacters(catalog);res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(result));}
     catch(error){res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error:error.message}));}
     return;
   }
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!path.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403);res.end();return;}
  const body=await readFile(path);
  res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?undefined:body);
 }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Hammerforge: http://localhost:${port} (Ctrl+C to stop)`));
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
