const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');const a=s.indexOf('async function openCargoPdf('),b=s.indexOf('async function shipPreparedFromList',a);
(async()=>{
let count=0,prints=0,fail=false,unlock;const ctx=vm.createContext({Uint8Array,atob,cargoPdfFilename:()=> 'test.pdf',recordCargoLabelPrint:async()=>{count++;if(unlock===null)await new Promise(r=>unlock=r)},toast:()=>{}});vm.runInContext(s.slice(a,b),ctx);
const element=()=>({style:{},append(){},appendChild(){},replaceChildren(){},contentWindow:{focus(){},print(){if(fail)throw Error('blocked');prints++}}});
const w={closed:false,File:class{},URL:{createObjectURL:()=> 'blob:test'},document:{body:element(),createElement:element,addEventListener(){}}};
const preview=await ctx.openCargoPdf(w,'JVBERi0=',{siparis_no:1});assert.equal(count,0);assert.equal(prints,0);
unlock=null;const first=preview.print.onclick();await preview.print.onclick();assert.equal(prints,1);assert.equal(count,1);unlock();await first;
await preview.print.onclick();assert.equal(prints,2);assert.equal(count,2);
fail=true;await preview.print.onclick();assert.equal(count,2);assert.equal(preview.print.disabled,false);
fail=false;const bulk=await ctx.openCargoPdf(w,'JVBERi0=',{siparis_no:1},{trackPrint:false});bulk.print.onclick();assert.equal(prints,3);assert.equal(count,2);
console.log('PASS: preview does not count; Print increments once per click; double clicks locked; failed print does not count; bulk preview keeps its separate handler');
})().catch(e=>{console.error(e);process.exit(1)});
