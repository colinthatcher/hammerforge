import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import catalog from '../data/game-data.json' with {type:'json'};
import {createBuild} from '../planner-model.js';
import {renderSurvival} from '../survival-ui.js';
import {calculateSurvival} from '../combat/survival.js';

test('sidebar resources and defences show numeric source-backed stats without placeholders',()=>{
 const nodes=new Map(),document=globalThis.document;
 globalThis.document={querySelector(selector){if(!nodes.has(selector))nodes.set(selector,{innerHTML:'',value:selector==='#incoming-damage'?'100':selector==='#starting-health'?'100':'0'});return nodes.get(selector);}};
 try{
  const build=createBuild(catalog),before=structuredClone(build);renderSurvival(build,catalog);
  const resources=nodes.get('#hero-resources').innerHTML,defences=nodes.get('#sidebar-defences').innerHTML;
  assert.match(resources,/resource-color-health/);assert.match(resources,/resource-color-mana/);
  assert.doesNotMatch(resources+defences,/<p\b|defence-row|class="resource"|<h[123]\b/);
  for(const label of ['Armor','Physical maximum hit','Health regeneration','Mana regeneration'])assert.ok(defences.includes(`${label}:`),label);
  assert.equal([...defences.matchAll(/Physical maximum hit:/g)].length,1);
  assert.doesNotMatch(defences,/Physical attack maximum hit|Physical spell maximum hit/);
  const result=calculateSurvival(build,catalog);
  assert.equal(result.maximumHits.filter(hit=>hit.label==='Physical').length,1);
  const tooltip=element=>defences.match(new RegExp(`title="([^"]*)"><span>${element} maximum hit:`))?.[1];
  assert.match(tooltip('Fire'),/67%.*immediately.*33%.*damage-over-time/);
  assert.match(tooltip('Fire'),/rounds resistance mitigation first.*initial hit.*can still kill afterward/);
  assert.match(tooltip('Poison'),/20%.*immediately.*80%.*damage-over-time/);
  assert.match(tooltip('Poison'),/nonlethal by themselves.*initial hit can still kill/);
  for(const element of ['Fire','Poison']){
   const hit=result.maximumHits.find(hit=>hit.label===`${element} attack / spell`);
   const number=new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(hit.damage);
   assert.ok(defences.includes(`${element} maximum hit:</span><strong>${number}</strong>`));
  }
  for(const element of ['Fire','Ice','Lightning','Poison']){
   assert.ok(defences.includes(`${element} maximum hit:`));assert.ok(defences.includes(`${element} resistance:`));
  }
  assert.doesNotMatch(defences,/Not modeled|not modeled|—|NaN|undefined/);
  assert.match(defences,/Health regeneration:<\/span><strong>[\d.,]+\/s/);
  assert.match(defences,/Mana regeneration:<\/span><strong>[\d.,]+\/s/);
  assert.match(defences,/Movement speed:<\/span><strong>[\d.,]+×/);
  assert.match(defences,/Full health; no penetration/);assert.match(defences,/Max hits: initial damage only/);
  assert.match(nodes.get('#survival-output').innerHTML,/Survival mechanics &amp; exclusions|Survival mechanics & exclusions/);
  assert.deepEqual(build,before);
 }finally{if(document===undefined)delete globalThis.document;else globalThis.document=document;}
});

test('sidebar keeps controls and warnings outside the scrolling PoB-style stat list',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8'),css=readFileSync(new URL('../pob.css',import.meta.url),'utf8');
 const sidebar=html.slice(html.indexOf('<aside class="build-sidebar"'),html.indexOf('</aside>'));
 const order=['id="focus-skill"','class="sidebar-stat-scroll"','id="focus-output"','id="sidebar-stats"','id="hero-resources"','id="sidebar-defences"','class="sidebar-footer"','id="sidebar-model-warnings"','id="stat-override-warning"'];
 for(let i=1;i<order.length;i++)assert.ok(sidebar.indexOf(order[i])>sidebar.indexOf(order[i-1]),order[i]);
 assert.match(css,/\.sidebar-stat-scroll\s*\{[^}]*overflow: auto/);
 assert.match(css,/\.sidebar-footer\s*\{[^}]*flex: 0 0 auto/);
 assert.doesNotMatch(sidebar,/Offence<\/h2>|sidebar-panel-survival/);
});
