const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{});
 try{
  const page=await browser.newPage();
  const css=fs.readFileSync('style.css','utf8')+fs.readFileSync('theme.css','utf8');
  const tools=fs.readFileSync('index.html','utf8').match(/<section id="cargoTools"[\s\S]*?<\/section>/)[0].replace(' hidden','');
  await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body class="orders-page"><main class="content-area">'+tools+'</main><script>window.filterCargo=key=>{window.selected=key;document.querySelectorAll("[data-cargo-filter]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cargoFilter===key)));}</script>');
  const source=fs.readFileSync('app.js','utf8');
  await page.addScriptTag({content:`
   const CONFIG={webhooks:{hareket_toplu:'https://gazi.test/bulk'}};const selectedOrder=null;
   window.requestCount=0;window.reloadCount=0;
   function cargoRequest(){window.requestCount++;return new Promise((resolve,reject)=>{window.finishRequest=resolve;window.failRequest=reject;});}
   function loadOrders(){window.reloadCount++;return new Promise(resolve=>{window.finishReload=resolve;});}
   function toast(){}
   ${source.slice(source.indexOf('let cargoSyncBusy=false;'),source.indexOf('let cargoDetailBusy=false;'))}
  `});
  for(const width of [320,375,430,768,900]){
   await page.setViewportSize({width,height:740});
   assert(await page.locator('#cargoSyncStatus').isVisible(),'Cargo sync feedback visible at '+width);
   const geometry=await page.locator('.cargo-legend').evaluate(el=>({tops:[...el.children].map(b=>b.offsetTop),overflow:document.documentElement.scrollWidth>innerWidth,scroll:el.scrollWidth,client:el.clientWidth}));
   assert.equal(new Set(geometry.tops).size,1,'All seven labels stay in one row at '+width);
   assert(!geometry.overflow,'Page must not scroll sideways at '+width);
   for(const key of ['all','created','transit','delivery','delivered','problem','return']){
    await page.locator('[data-cargo-filter="'+key+'"]').click();
    assert.equal(await page.evaluate(()=>window.selected),key);
    assert.equal(await page.locator('[data-cargo-filter][aria-pressed="true"]').count(),1);
   }
  }
  await page.setViewportSize({width:375,height:740});
  const button=page.locator('#refreshCargoBtn'),status=page.locator('#cargoSyncStatus');
  const label=await button.textContent();
  await button.click();
  assert(await button.isDisabled());assert.equal(await button.getAttribute('aria-busy'),'true');
  assert.equal(await button.textContent(),'Sorgulanıyor…');
  assert.equal(await status.textContent(),'Kargo durumları toplu sorgulanıyor…');
  assert(await status.isVisible());
  await page.evaluate(()=>{void refreshCargoMovements();void refreshCargoMovements();});
  assert.equal(await page.evaluate(()=>window.requestCount),1,'Repeated activation must not start duplicate requests');
  await page.evaluate(()=>window.finishRequest({received:12,updated:3,unchanged:9,unmatched:0}));
  await page.waitForFunction(()=>window.reloadCount===1);
  assert(await button.isDisabled(),'Keep button locked until the list reload finishes');
  await page.evaluate(()=>window.finishReload());
  await page.waitForFunction(()=>!document.getElementById('refreshCargoBtn').disabled);
  assert.equal(await button.textContent(),label);assert.equal(await button.getAttribute('aria-busy'),'false');
  assert((await status.textContent()).includes('12 gönderi incelendi · 3 kayıt güncellendi'));
  for(const message of ['Kargo bağlantısına ulaşılamadı.','DHL canlı isteği zaman aşımına uğradı.']){
   await button.click();assert(await button.isDisabled());
   await page.evaluate(text=>window.failRequest(new Error(text)),message);
   await page.waitForFunction(()=>!document.getElementById('refreshCargoBtn').disabled);
   assert.equal(await button.textContent(),label);assert.equal(await button.getAttribute('aria-busy'),'false');
   assert((await status.textContent()).includes(message));assert(await status.isVisible());
  }
  assert.equal(await page.evaluate(()=>window.requestCount),3,'Failed requests can be retried');
  console.log('PASS: visible mobile progress/results/errors, button stays locked through request and reload, duplicate clicks blocked, failure/timeout unlock for retry');
  console.log('PASS: all seven labels on a single row at 320/375/430/768/900 px, no page overflow, horizontal reachability and active state');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
