// Optional real-browser regression test. No Playwright runtime dependency is
// needed by the planner; use PLAYWRIGHT_MODULE to point at a separate install.
import assert from 'node:assert/strict';
import catalog from '../data/game-data.json' with {type:'json'};
import {runtimeReconciliationBuild} from '../tests/runtime-reconciliation-fixtures.js';
let chromium;
try{({chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright'));}
catch{throw Error('UI tests require Playwright. Set PLAYWRIGHT_MODULE to its index.mjs in a separate installation.');}
const browser=await chromium.launch({headless:true,...(process.env.CHROME_BIN?{executablePath:process.env.CHROME_BIN}:{})});
try{
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(process.env.UI_TEST_URL||'http://localhost:5173');
  await page.locator('#planner').waitFor({state:'visible'});
  // No dispatchEvent(), fill(), or selectOption(): edits must commit through
  // real blur/Tab/native-select events, as they do for someone using the UI.
  const type=async(selector,value)=>{await page.locator(selector).click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(value);};
  const choose=async(selector,index)=>{await page.locator(selector).click();await page.keyboard.press('Home');for(let i=0;i<index;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');};
  const attr=id=>`[data-attribute="${id}"]`;
  const accomplishment=id=>`[data-progression-kind="accomplishmentAttributes"][data-progression-id="${id}"]`;
  const active=selector=>page.locator(selector).evaluate(el=>document.activeElement===el);
  const stored=()=>page.evaluate(()=>{const l=JSON.parse(localStorage.getItem('hammerforge.library.v2'));return l.builds.find(b=>b.id===l.activeId);});

  if(process.env.UI_TEST_SCOPE!=='reconciliation'){
  await page.locator('#tab-character').click();
  await page.locator('[data-disclosure="allocated-attributes"] > summary').click();
  await type(attr('str'),'25');
  // Hold the next click past a render timer to catch replacement between down/up.
  await page.locator(attr('dex')).evaluate(el=>window.__nextField=el);
  const box=await page.locator(attr('dex')).boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
  await page.waitForTimeout(75);
  assert.equal(await page.evaluate(()=>window.__nextField.isConnected),true,'Next input must survive a held mouse-down');
  await page.mouse.up();await page.waitForTimeout(20);
  assert.equal(await active(attr('dex')),true,'First click must focus the next field');
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('30');await page.keyboard.press('Tab');
  await page.waitForFunction(()=>document.activeElement?.dataset.attribute==='int');
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('40');
  await page.locator('#tab-game').click();
  assert.deepEqual((({str,dex,int})=>({str,dex,int}))((await stored()).attributes),{str:25,dex:30,int:40});

  await type(accomplishment('str'),'15');await page.locator(accomplishment('dex')).click();
  await page.waitForTimeout(20);assert.equal(await active(accomplishment('dex')),true);
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('20');
  await choose('[data-progression-kind="mysticSpellPower"]',2);
  await page.waitForFunction(()=>document.querySelector('[data-progression-kind="mysticSpellPower"]').value==='2');
  let build=await stored();assert.equal(build.progression.accomplishmentAttributes.str,15);assert.equal(build.progression.accomplishmentAttributes.dex,20);assert.equal(build.progression.mysticSpellPower,2);
  await choose('[data-combo-skill="combo_kills"]',1);await choose('[data-combo-skill="combo_nova"]',2);
  await page.locator('#tab-conditions').click();await page.locator('[data-combo-active]').click();
  await page.waitForFunction(()=>document.querySelector('[data-combo-active]').checked);
  assert.equal((await stored()).combo.active,true);

  await page.locator('#tab-abilities').click();
  const main=await page.locator('#focus-skill').inputValue();
  await choose(`[data-rank="${main}"]`,3);
  await page.locator('#tab-character').click();assert.equal((await stored()).skills[main].rank,3);
  // A native select canceled without a change must not leave rendering suspended.
  await page.locator('#class').click();await page.keyboard.press('Escape');
  await type(attr('vit'),'12');await page.locator('#tab-calcs').click();assert.equal((await stored()).attributes.vit,12);
  await type('#incoming-damage','250');await page.locator('#starting-health').click();
  assert.equal(await active('#starting-health'),true);
  await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('80');await page.keyboard.press('Tab');
  assert.match(await page.locator('#survival-output').innerText(),/Starting health/);

  await page.locator('#tab-trinkets').click();await page.locator('#add-trinket').click();
  await type('#trinket-search','Book of Spells');await page.locator('[data-pick-trinket]').click();
  await type('#trinket-search','Sands of Time');await page.locator('[data-pick-trinket]').click();
  await page.locator('#trinket-dialog [data-close]').click();
  const count=page.locator('[data-trinket-count]').first();await count.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('3');
  const attune=page.locator('[data-attune]').first();await attune.click();
  await page.waitForFunction(()=>document.querySelector('[data-attune]').checked);
  build=await stored();assert.equal(build.trinkets[0].count,3);assert.equal(build.trinkets[0].attuned,true);
  await page.locator('#tab-gear').click();await page.locator('[data-create-slot="mainhand"]').click();
  await type('#gear-name','Mouse interaction test');await page.locator('#gear-form button[type=submit]').click();
  await page.locator('#gear-dialog').waitFor({state:'hidden'});assert.equal((await stored()).gear[0].name,'Mouse interaction test');

  // Equip candidates per slot using the native dropdown and real keyboard.
  const gearBefore=(await stored()).gear;
  await page.locator('[data-create-slot="head"]').click();
  assert.equal(await page.locator('#gear-base').evaluate(el=>el.tagName),'SELECT','Base picker remains a dropdown');
  assert.equal(await page.locator('#gear-base').getAttribute('type'),null);
  assert.equal(await page.locator('#gear-base').evaluate(el=>el.type),'select-one');
  assert.equal(await page.locator('#gear-dialog input[type="search"]').count(),2,'Only prefix and suffix have search fields');
  await type('#gear-name','Second interaction item');await page.locator('#gear-form button[type=submit]').click();
  await page.locator('#gear-dialog').waitFor({state:'hidden'});
  let items=(await stored()).gear;assert.equal(items.length,gearBefore.length+1);
  const second=items.at(-1),first=items[0];
  const equip=async(slot,item)=>{
    const selector=`[data-slot-item="${slot}"]`;
    const optionIndex=await page.locator(selector).locator('option').evaluateAll((options,id)=>options.findIndex(option=>option.value===id),item.id);
    assert.ok(optionIndex>0,`${item.name} is an owned candidate for ${slot}`);
    await choose(selector,optionIndex);
    assert.equal(await page.locator(selector).inputValue(),item.id);
  };
  await equip('mainhand',first);await equip('head',second);
  await page.locator(`[data-select-gear="${second.id}"]`).click();
  assert.equal(await page.locator('#selected-item h2').innerText(),second.name);
  assert.equal(await page.locator('#gear-dialog').evaluate(el=>el.open),false,'Inspect does not edit');
  await page.locator('#selected-item [data-edit-gear]').click();
  assert.equal(await page.locator('#gear-title').innerText(),'Edit equipment');
  const editName=page.locator('#gear-name');await editName.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('Discard this edit');
  await page.locator('#gear-dialog').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal((await stored()).gear.find(g=>g.id===second.id).name,'Second interaction item','Cancel discards draft changes');
  await page.locator(`[data-select-gear="${second.id}"]`).click();
  await page.locator('#selected-item [data-edit-gear]').click();
  assert.equal(await page.locator('#gear-name').inputValue(),'Second interaction item','Edit reopens stored values');
  const findAffix=async(side,term)=>{
    const search=page.locator(`#gear-${side}-search`);await search.click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type(term);
     const visible=page.locator(`#gear-${side}es .affix-option:not([hidden])`);return visible;
  };
  // Source data puts Strength and Attack power in prefixes, not suffixes.
  assert.equal(await page.locator('#gear-slot').inputValue(),'head');
  const strength=await findAffix('prefix','strength');assert.ok(await strength.count(),'Full-word strength search');
  const attack=await findAffix('prefix','attack power');assert.ok(await attack.count(),'Full-word attack power search');
  const speed=await findAffix('suffix','attack speed');assert.ok(await speed.count(),'Suffix effect search');
  assert.equal(await page.locator('#gear-prefix-search').inputValue(),'attack power','Suffix search leaves prefix query unchanged');
  // Select one prefix, replace it with another, and independently select a suffix.
  await page.locator('#gear-prefix-search').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('strength');
  const strengthRadio=page.locator('#gear-prefixes .affix-option:not([hidden]) input[data-affix-side="prefix"][data-affix]').first();
  const strengthId=await strengthRadio.getAttribute('value');assert.ok(strengthId);
  await strengthRadio.click();
  await page.waitForFunction(()=>document.querySelector('#gear-prefix-count').innerText==='1 / 1 selected');
  assert.equal(await page.locator('#gear-prefix-count').innerText(),'1 / 1 selected');
  await page.locator('#gear-prefix-search').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('attack power');
  const attackRadio=page.locator('#gear-prefixes .affix-option:not([hidden]) input[data-affix="mod_attack_power"]');
  const attackId=await attackRadio.getAttribute('value');assert.ok(attackId);
  await attackRadio.click();
  await page.waitForFunction(()=>document.querySelector('#gear-prefixes input[data-affix="mod_attack_power"]').checked);
  await page.waitForFunction(id=>!document.querySelector(`[data-affix-side="prefix"][value="${id}"]`).checked,strengthId);
  assert.equal(await page.locator(`[data-affix-side="prefix"][value="${strengthId}"]`).isChecked(),false,'New prefix replaces previous prefix');
  assert.equal(await page.locator('#gear-prefix-count').innerText(),'1 / 1 selected');
  await page.locator('#gear-suffix-search').click();await page.keyboard.press('ControlOrMeta+A');await page.keyboard.type('attack speed');
  const suffix=page.locator('#gear-suffixes .affix-option:not([hidden]) input[data-affix-side="suffix"][data-affix]').first();
  const suffixId=await suffix.getAttribute('value');assert.ok(suffixId);
  await suffix.click();
  await page.waitForFunction(()=>document.querySelector('#gear-suffix-count').innerText==='1 / 1 selected');
  assert.equal(await page.locator(`[data-affix-side="prefix"][value="${attackId}"]`).isChecked(),true,'Suffix selection leaves prefix intact');
  assert.equal(await page.locator('#gear-suffix-count').innerText(),'1 / 1 selected');
  await page.locator('[data-affix-side="prefix"][value=""]').click();
  await page.locator('[data-affix-side="suffix"][value=""]').click();
  await page.locator('#gear-form button[type=submit]').click();
  const savedSecond=(await stored()).gear.find(g=>g.id===second.id);
  assert.equal(savedSecond.affixes.length,0,'Clearing both sides saves no affixes');
  }

  // Isolated browser profiles: never modify the user's actual build library.
  for(const [classId,hit] of [['paladin','103'],['ranger','124']]){
    const b=runtimeReconciliationBuild(catalog,classId);b.targetId='generic';
    const other={...structuredClone(b),id:crypto.randomUUID(),name:'Same build, different stored target',targetId:'dummy-armored'};
    if(classId==='paladin'){
      delete b.targetId;delete b.progression.heroTitles.title_mat_gold;delete b.progression.heroTitles.title_mat_wood;
      b.importInfo={sourceId:'synthetic',profile:'Synthetic',fileName:'fixture.hps',unresolvedEquipped:0,warnings:['Set donation-title levels manually under Upgrades.']};
    }
    const isolated=await browser.newContext({viewport:{width:1440,height:900}});
    await isolated.addInitScript(library=>{if(!localStorage.getItem('hammerforge.library.v2'))localStorage.setItem('hammerforge.library.v2',JSON.stringify(library));},{activeId:b.id,builds:[b,other]});
    const p=await isolated.newPage();p.on('pageerror',error=>errors.push(error.message));
    await p.goto(process.env.UI_TEST_URL||'http://localhost:5173');await p.locator('#planner').waitFor({state:'visible'});
    const normal=p.locator('#focus-output .stat-row').filter({hasText:'Non-critical hit:'}).locator('strong');
    assert.match(await p.locator('#focus-output .target-snapshot').getAttribute('title'),/Generic target.*no elemental resistance/);
    if(classId==='paladin'){
      assert.equal(await normal.innerText(),'105','Old export has no title or target settings');
      assert.match(await p.locator('#sidebar-model-warnings [role="status"]').getAttribute('title'),/no saved gold donation-title level/);
      await p.locator('#sidebar-model-warnings').getByRole('button',{name:'Upgrades → Hero titles',exact:true}).click();
      await p.locator('[data-progression-kind="heroTitles"][data-progression-id="title_mat_gold"]').click();
      await p.keyboard.press('ControlOrMeta+A');await p.keyboard.type('7');await p.keyboard.press('Tab');
      await p.waitForFunction(()=>[...document.querySelectorAll('#focus-output .stat-row')].some(el=>el.innerText.includes('Non-critical hit:')&&el.querySelector('strong').innerText==='108'));
      assert.equal(await p.locator('#sidebar-model-warnings [role="status"]').count(),0,'Explicit title entry clears the missing-data warning');
    }
    await p.locator('#tab-conditions').click();
    await p.locator('#target-preset').click();await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
    await p.waitForFunction(()=>document.querySelector('#target-preset').value==='dummy-magic');
    await p.waitForFunction(expected=>[...document.querySelectorAll('#focus-output .stat-row')].some(el=>el.innerText.includes('Non-critical hit:')&&el.querySelector('strong').innerText===expected),hit);
    assert.equal(await normal.innerText(),hit,`${classId} UI agrees with live floating damage`);
    assert.match(await p.locator('#target-details').innerText(),/10,000,000 health.*100 ice/);
    assert.equal(await p.locator('#armored').isDisabled(),true);
    await p.locator('.sidebar-compare > summary').click();
    await p.locator('#compare-build').click();await p.keyboard.press('Home');await p.keyboard.press('ArrowDown');await p.keyboard.press('Enter');
    await p.waitForFunction(()=>document.querySelector('#comparison').innerText.includes('0 DPS'));
    await p.reload();await p.locator('#planner').waitFor({state:'visible'});
    assert.equal(await p.locator('#target-preset').inputValue(),'dummy-magic','Target choice persists');
    assert.equal(await normal.innerText(),hit);
    await p.locator('#tab-calcs').click();assert.match(await p.locator('#calc-output').innerText(),/Green-robed magic dummy.*10,000,000 health/);
    await isolated.close();
  }
  assert.deepEqual(errors,[]);
  console.log(`${process.env.UI_TEST_SCOPE==='reconciliation'?'Damage reconciliation':'UI interaction'} regressions passed: live-reconciled 103/124 hits, native target selection, shared-target comparisons, and target persistence.`);
}finally{await browser.close();}
