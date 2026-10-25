const fs=require('node:fs'),assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
(async()=>{
 const css=fs.readFileSync('style.css','utf8')+(fs.existsSync('theme.css')?fs.readFileSync('theme.css','utf8'):'')+fs.readFileSync('viewport-lock.css','utf8');
 const guard=fs.readFileSync('viewport-lock.js','utf8');
 for(const file of ['index.html','login.html','rapor.html','gonderi-sorgulama.html'].filter(f=>fs.existsSync(f))){
  const source=fs.readFileSync(file,'utf8');
  assert.match(source, /maximum-scale=1,user-scalable=no/);assert.match(source,/viewport-lock\.css/);assert.match(source,/viewport-lock\.js/);
 }
 const browser=await chromium.launch({executablePath:process.env.BROWSER_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('https://viewport.test/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,minimum-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover"><style>'+css+'</style><body><main style="width:100%;padding:20px"><input aria-label="Telefon" style="font-size:12px;width:100%"><select aria-label="Seçim" style="font-size:12px"><option>Şube</option></select><textarea aria-label="Mesaj" style="font-size:12px;width:100%"></textarea><div class="viewport-scroll" style="width:100%;overflow:auto"><div style="width:1100px;height:40px">Yatay liste</div></div><div style="height:1800px">Dikey liste</div></main><script>'+guard+'</script></body>'}));
  await page.goto('https://viewport.test/');
  for(const width of [320,390,430,844]){
   await page.setViewportSize({width,height:width===844?390:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).touchAction),'pan-x pan-y');
   for(const tag of ['input','select','textarea'])assert.equal(await page.locator(tag).evaluate(el=>getComputedStyle(el).fontSize),'16px');
  }
  await page.setViewportSize({width:390,height:844});await page.locator('input').focus();assert.equal(await page.evaluate(()=>visualViewport.scale),1);
  const events=await page.evaluate(()=>{
   const touch=n=>{const e=new Event('touchstart',{bubbles:true,cancelable:true});Object.defineProperty(e,'touches',{value:Array(n).fill({})});document.dispatchEvent(e);return e.defaultPrevented;};
   const gesture=new Event('gesturestart',{cancelable:true});document.dispatchEvent(gesture);const doubleTap=new Event('dblclick',{cancelable:true});document.dispatchEvent(doubleTap);
   return {single:touch(1),pinch:touch(2),gesture:gesture.defaultPrevented,doubleTap:doubleTap.defaultPrevented};
  });assert.deepEqual(events,{single:false,pinch:true,gesture:true,doubleTap:true});
  const cdp=await context.newCDPSession(page);await cdp.send('Input.synthesizePinchGesture',{x:190,y:330,scaleFactor:1.8,gestureSourceType:'touch'});
  assert.equal(await page.evaluate(()=>visualViewport.scale),1,'Pinch must leave the viewport at scale 1');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:600,id:1}]});
  for(const y of [560,510,460,410,360,310])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:190,y,id:1}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForFunction(()=>scrollY>0,{},{timeout:3000}).catch(async e=>{console.log(await page.evaluate(()=>({y:scrollY,h:innerHeight,doc:document.documentElement.scrollHeight,body:document.body.scrollHeight,overflow:getComputedStyle(document.documentElement).overflow,bodyOverflow:getComputedStyle(document.body).overflow})));throw e;});
  assert.ok(await page.locator('.viewport-scroll').evaluate(el=>{el.scrollLeft=100;return el.scrollLeft>0;}),'Internal horizontal lists remain scrollable');
  assert.deepEqual(errors,[]);console.log('PASS fixed viewport: 320/390/430/landscape, 16px fields, scale 1 after pinch/focus, multi-touch/gesture guard, vertical and internal horizontal scrolling.');
  await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
