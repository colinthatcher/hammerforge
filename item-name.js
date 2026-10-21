const qualities=['Common','Uncommon','Rare','Epic','Legendary','Cursed'];
const clean=s=>typeof s==='string'?s.trim():'';
export function itemDisplayName(item,catalog={}){
  const base=catalog.equipment?.find(d=>d.id===item?.baseId),baseName=clean(base?.name);
  const defs=catalog.affixes||[], sides={prefix:[],suffix:[]};
  for(const state of item?.affixes||[]){const def=defs.find(d=>d.id===state.id);if(!def)continue;for(const side of ['prefix','suffix']){const value=clean(def[side]);if(value&&!sides[side].includes(value))sides[side].push(value);}}
  const generated=[...sides.prefix,baseName,...sides.suffix].filter(Boolean).join(' ');
  const saved=clean(item?.name);if(!baseName)return saved;if(!generated)return saved||baseName;
  if(!sides.prefix.length&&!sides.suffix.length)return saved||baseName;
  const quality=qualities.find(q=>saved.startsWith(`${q} `)&&saved.slice(q.length+1)===baseName);
  const name=quality?`${quality} ${generated}`:generated;
  if(saved===generated||saved===name)return name;
  if(saved&&saved!==baseName&&saved!==`${quality||''}${quality?' ':''}${baseName}`)return `${saved} — ${name}`;
  return name;
}
