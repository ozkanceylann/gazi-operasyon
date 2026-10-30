const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const source=fs.readFileSync('app.js','utf8');assert(source.includes('order-code-support'), 'Icon is beside tracking code');
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+fs.readFileSync('style.css','utf8')+fs.readFileSync('theme.css','utf8')+'</style><body class="orders-page"><div id="fixture"></div><div id="alertRoot"></div></body>');
  await page.addScriptTag({content:`
   let currentTab='sorunlu';
   const cargoStatusInfo=o=>({key:o.key||'unknown'});
   const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
   window.notes={'1':{note:'Arandı. <img src=x onerror="window.injected=true">\\nYarın teslim istiyor.',updated_at:'2026-10-30T10:00:00Z'}};
   window.fail=false;window.requests=[];
   const db={rpc:async(name,args)=>{requests.push({name,args});if(window.fail)return {error:{message:'denied'}};return {data:Object.fromEntries(args.p_order_ids.filter(id=>notes[id]).map(id=>[id,notes[id]]))};}};
   ${source.slice(source.indexOf('const operationSupportOrders ='),source.indexOf('let extrasToken=0;'))}
   window.rows=[{siparis_no:1,ad_soyad:'Örnek <Müşteri>',key:'support'},{siparis_no:2,key:'failed'}];
   window.mount=()=>{document.getElementById('fixture').innerHTML=rows.map(o=>'<div class="order-code-support"><span>694073465945</span>'+operationSupportButton(o)+'</div>').join('');};
   window.load=()=>loadOperationSupportNotes(rows);
   window.pendingButton=()=>{currentTab='bekleyen';const markup=operationSupportButton({siparis_no:3,key:'unknown'});currentTab='sorunlu';return markup;};
   mount();
  `});
  assert.equal(await page.locator('.operation-support-note--unknown').count(),2);
  await page.evaluate(()=>load());await page.evaluate(()=>mount());
  assert.equal(await page.locator('.operation-support-note--saved').count(),1);
  assert.equal(await page.locator('.operation-support-note--missing').count(),1);
  assert.equal(await page.evaluate(()=>pendingButton()),'');
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:800});
   await page.locator('.operation-support-note--saved').click();
   const dialog=page.getByRole('dialog');await dialog.getByText('Yarın teslim istiyor.',{exact:false}).waitFor();
   assert.equal(await dialog.locator('textarea,input,img').count(),0,'Explanation remains read-only escaped text');
   assert((await dialog.textContent()).includes('<img src=x'));
   assert.equal(await page.evaluate(()=>window.injected),undefined);
   assert(await dialog.evaluate(el=>el.getBoundingClientRect().left>=0&&el.getBoundingClientRect().right<=innerWidth));
   await dialog.getByRole('button',{name:'Kapat'}).click();
   await page.locator('.operation-support-note--missing').click();
   await page.getByText('Satış ekibi henüz açıklama eklememiş.').waitFor();
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.evaluate(()=>{window.fail=true;});
  await page.locator('.operation-support-note--saved').click();await page.getByText('Açıklama alınamadı. Kapatıp yeniden deneyin.').waitFor();
  await page.getByRole('button',{name:'Kapat'}).click();
  await page.evaluate(async()=>{await load().catch(()=>{});mount();});
  assert.equal(await page.locator('.operation-support-note--unknown').count(),2,'RPC failure is not shown as missing explanation');
  assert(await page.evaluate(()=>requests.every(r=>r.name==='seller_support_notes')),'Only existing read RPC is used');
  console.log('PASS: saved/missing/loading/error states, existing read RPC, escaped read-only dialog, close/Escape, 320/390/1440px');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
