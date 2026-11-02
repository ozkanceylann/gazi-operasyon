const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const width of [375,1280]){
 const page=await browser.newPage({viewport:{width,height:900}});
 await page.setContent('<button id="btnCargo">Kargoya gönder</button><main id="root"></main>');
 await page.addStyleTag({content:fs.readFileSync('shipping-approval.css','utf8')});
 await page.addScriptTag({content:fs.readFileSync('shipping-approval.js','utf8')});
 await page.evaluate(async()=>{
  window.order={siparis_no:100};window.state={order_id:100,mobile:true,free:false,eft:false,approval_required:true,approved:false,can_ship:false,fingerprint:'reviewed-v1',reasons:['Mobil sipariş için Gazi Operasyon onayı gerekli.']};
  window.db={rpc:async(name,args)=>{if(name==='gazi_shipping_status')return{data:[window.state]};if(name==='gazi_shipping_approve'){if(args.p_fingerprint!=='reviewed-v1')throw Error('Stale');window.state={...window.state,approved:true,can_ship:true,reasons:[]};return{data:window.state}}if(name==='gazi_shipping_authorize')return window.state.can_ship?{data:{siparis_no:100}}:{error:Error('Dekont gerekli')};}};
  root.innerHTML=ShippingApproval.markup(window.order);await ShippingApproval.mount(window.db,window.order,root);
 });
 assert(await page.locator('#btnCargo').isDisabled());assert.equal(await page.locator('[data-shipping-approve]').count(),1);
 page.on('dialog',d=>d.accept());await page.locator('[data-shipping-approve]').click();await page.waitForFunction(()=>!document.querySelector('#btnCargo').disabled);
 await page.evaluate(async()=>{window.state={...window.state,mobile:false,eft:true,approval_required:false,approved:false,can_ship:false,reasons:['EFT siparişine dekont eklenmeden kargoya gönderilemez.']};await ShippingApproval.mount(window.db,window.order,root);});
 assert(await page.locator('#btnCargo').isDisabled());assert.equal(await page.locator('[data-shipping-approve]').count(),0);assert((await page.locator('.shipping-control').innerText()).includes('dekont eklenmeden'));
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.evaluate(async()=>{window.db.rpc=async()=>({error:Error('Offline')});await ShippingApproval.mount(window.db,window.order,root);});assert(await page.locator('#btnCargo').isDisabled());assert((await page.locator('.shipping-control').innerText()).includes('kontrol edilemedi'));
 await page.close();
 }
 await browser.close();console.log('PASS: mobile review enables cargo, EFT missing receipt blocks cargo, fail-closed API errors, 375/1280 layouts');
})().catch(e=>{console.error(e);process.exitCode=1});
