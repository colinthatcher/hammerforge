const STORAGE_KEY='hammerforge.ui.panels.v2';
const MAX_KEY_LENGTH=200;

export function initializeDetailView({document=globalThis.document,storage}={}) {
  let store=storage;
  if(store===undefined){try{store=globalThis.localStorage;}catch{store=null;}}
  const states=new Map();
  try {
    const saved=JSON.parse(store?.getItem(STORAGE_KEY)??'null');
    if(saved&&saved.states&&typeof saved.states==='object'&&!Array.isArray(saved.states))
      for(const [key,value] of Object.entries(saved.states))
        if(validKey(key)&&typeof value==='boolean')states.set(key,value);
  }catch{}

  const nodes=root=>(root??document)?.querySelectorAll?.('details[data-disclosure]')??[];
  const connected=node=>node.isConnected!==false;
  const keyFor=node=>node?.getAttribute?.('data-disclosure');
  function persist(){try{store?.setItem(STORAGE_KEY,JSON.stringify({states:Object.fromEntries(states)}));}catch{}}
  function capture(root=document){for(const node of nodes(root))if(connected(node)){const key=keyFor(node);if(validKey(key))states.set(key,!!node.open);}}
  function apply(root=document){for(const node of nodes(root)){const key=keyFor(node);if(!validKey(key))continue;node.open=states.has(key)?states.get(key):node.hasAttribute('data-default-open');}}
  document?.addEventListener?.('toggle',event=>{const node=event.target;if(!node?.matches?.('details[data-disclosure]')||!connected(node))return;const key=keyFor(node);if(!validKey(key))return;states.set(key,!!node.open);persist();},{capture:true});
  apply();
  return {capture,apply};
}

function validKey(key){return typeof key==='string'&&key.length>0&&key.length<=MAX_KEY_LENGTH;}
