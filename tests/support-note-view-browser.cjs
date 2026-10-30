const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const source=fs.readFileSync('app.js','utf8');assert(source.includes('order-taker-support'), 'Icon is inside the order-taker block');
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+fs.readFileSync('style.css','utf8')+fs.readFileSync('theme.css','utf8')+'</style><body class="orders-page"><div id="fixture"></div><div id="alertRoot"></div></body>');
  await page.addScriptTag({content:`
   let currentTab='sorunlu';
   const cargoStatusInfo=o=>({key:o.key||'unknown'});
   const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
   window.notes={'1':{note:'Arandı. <img src=x onerror="window.injected=true">\\nYarın teslim istiyor.',updated_at:'2026-10-30T10:00:00Z'}};
   window.fail=false;window.requests=[];
   const db={rpc:async(name,args)=>{requests.push({name,args});if(window.fail)return {error:{message:'denied'}};return {data:Object.fromEntries(args.p_order_ids.filter(id=>notes[id]).map(id=>[id,notes[id]]))};}};
   ${source.slice(source.indexOf('const operationSupportOrders ='),source.indexOf('let extrasToken=0;'))}
   window.rows=[{siparis_no:1,ad_soyad:'Örnek <Müşteri>',key:'support',taker:'Özkan'},{siparis_no:2,key:'failed',taker:'Ceylan'}];
   window.mount=()=>{document.getElementById('fixture').innerHTML='<div class="table-wrapper"><table class="orders-table"><thead><tr>'+['number','count','customer','product','total','status','code','taker','actions'].map(role=>'<th class="order-cell--'+role+'">'+role+'</th>').join('')+'</tr></thead><tbody id="ordersBody">'+rows.map(o=>'<tr><td class="order-cell--number">'+o.siparis_no+'</td><td class="order-cell--count">1</td><td class="order-cell--customer">Örnek Müşteri</td><td class="order-cell--product">10 kg zeytin</td><td class="order-cell--total">1100</td><td class="order-cell--status">Destek</td><td class="order-cell--code">694073465945</td><td class="order-cell--taker" data-label="Sipariş alan"><span class="order-taker-support"><span class="order-taker-person">'+o.taker+'</span>'+operationSupportButton(o)+'</span></td><td class="order-cell--actions"></td></tr>').join('')+'</tbody></table></div>';};
   window.load=()=>loadOperationSupportNotes(rows);
   window.pendingButton=()=>{currentTab='bekleyen';const markup=operationSupportButton({siparis_no:3,key:'unknown'});currentTab='sorunlu';return markup;};
   mount();
  `});
  assert.equal(await page.locator('.operation-support-note--unknown').count(),2);
  await page.evaluate(()=>load());await page.evaluate(()=>mount());
  assert.equal(await page.locator('.operation-support-note--saved').count(),1);
  assert.equal(await page.locator('.operation-support-note--missing').count(),1);
  assert.equal(await page.evaluate(()=>pendingButton()),'');
  for(const width of [320,390,1280,1440]){
   await page.setViewportSize({width,height:800});
   const names=await page.locator('.order-taker-person').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,line:parseFloat(getComputedStyle(el).lineHeight),padding:parseFloat(getComputedStyle(el).paddingTop)+parseFloat(getComputedStyle(el).paddingBottom),wrap:getComputedStyle(el).whiteSpace,width:el.clientWidth,textWidth:el.scrollWidth})));
   assert(names.every(n=>n.wrap==='nowrap'),'Seller names must stay on one line at '+width);
   if(width>1200)assert(names.every(n=>n.textWidth<=n.width),'Özkan/Ceylan must fit beside the icon in the actual fixed table at '+width);
   assert.equal(await page.locator('.order-cell--taker .operation-support-note').count(),2,'Icons stay inside seller cells');
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
