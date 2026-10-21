// Structural reader, not the game's preprocessor/interpreter. Keep numeric text
// as text: identifiers, expressions and display values must not be guessed.
export function parseSval(source) {
 const clean=source.replace(/<!--[\s\S]*?-->/g,'').replace(/%defblock\b[^\r\n]*[\s\S]*?%endblock/g,'').replace(/^\s*%[^\r\n]*/gm,'');
 const root={tag:'root',children:[]},stack=[root];let last=0;
 for(const match of clean.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)){
  const parent=stack.at(-1);parent.text=(parent.text||'')+clean.slice(last,match.index);last=match.index+match[0].length;
  if(match[1]){if(stack.length===1||parent.tag!==match[2])throw new Error(`Mismatched SValue tag ${match[2]}`);stack.pop();}
  else {const node={tag:match[2],name:match[3].match(/\bname="([^"]*)"/)?.[1],text:'',children:[]};parent.children.push(node);if(!match[3].trimEnd().endsWith('/'))stack.push(node);}
 }
 if(stack.length!==1)throw new Error('Unclosed SValue tag');return root;
}
export const child=(node,name)=>node?.children.find(n=>n.name===name);
export const value=(node,name)=>child(node,name)?.text.trim()??null;
// Normalize literals only; expressions and unsupported scalar types stay explicit text.
export function normalizeSval(node){
 if(!node)return null;
 if(['dict','d'].includes(node.tag))return Object.fromEntries(node.children.map(n=>[n.name,normalizeSval(n)]));
 if(['array','a'].includes(node.tag))return node.children.map(normalizeSval);
 const text=node.text.trim(),literal=s=>/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(s)&&Number.isFinite(Number(s));
 if(['int','i','float','f'].includes(node.tag)&&literal(text))return Number(text);
 if(['ivec2','vec2'].includes(node.tag)){const parts=text.split(/\s+/);if(parts.length===2&&parts.every(literal))return parts.map(Number);}
 if(['bool','b'].includes(node.tag)){if(['true','t'].includes(text))return true;if(['false','f'].includes(text))return false;}
 return text;
}
export function mergeSval(base,upgrade){
 const dict=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 if(!dict(base)||!dict(upgrade))return structuredClone(upgrade);
 const result=structuredClone(base);
 for(const [key,val] of Object.entries(upgrade))result[key]=key in base?mergeSval(base[key],val):structuredClone(val);
 return result;
}
export function parseLanguage(text){
 const map=new Map();
 for(const m of text.replace(/<!--[\s\S]*?-->/g,'').matchAll(/<string name="([^"]+)">([\s\S]*?)<\/string>/g))map.set(m[1],m[2].replace(/\\c[0-9a-f]{6}|\\d/gi,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>'));
 return map;
}
