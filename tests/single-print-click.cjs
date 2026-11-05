const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const s=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');const a=s.indexOf('async function openCargoPdf('),b=s.indexOf('async function shipPreparedFromList',a);
(async()=>{
let count=0,prints=0,fail=false,unlock;const ctx=vm.createContext({Uint8Array,atob,cargoPdfFilename:()=> 'test.pdf',recordCargoLabelPrint:async()=>{count++;if(unlock===null)await new Promise(r=>unlock=r)},toast:()=>{}});vm.runInContext(s.slice(a,b),ctx);
const element=()=>({style:{},append(){},appendChild(){},replaceChildren(){},contentWindow:{focus(){},print(){if(fail)throw Error('blocked');prints++}}});
const w={closed:false,File:class{},URL:{createObjectURL:()=> 'blob:test'},document:{body:element(),createElement:element,addEventListener(){}}};
const preview=await ctx.openCargoPdf(w,'JVBERi0=',{siparis_no:1});assert.equal(count,1);assert.equal(prints,0);
await preview.print.onclick();await preview.print.onclick();assert.equal(prints,2);assert.equal(count,1);
fail=true;await preview.print.onclick();assert.equal(count,1);
fail=false;const bulk=await ctx.openCargoPdf(w,'JVBERi0=',{siparis_no:1},{trackPrint:false});assert.equal(count,1);bulk.print.onclick();assert.equal(prints,3);assert.equal(count,1);
await ctx.openCargoPdf(w,'JVBERi0=',{siparis_no:1});assert.equal(count,2);
await assert.rejects(ctx.openCargoPdf(w,'invalid',{siparis_no:1}));assert.equal(count,2);
await assert.rejects(ctx.openCargoPdf({...w,closed:true},'JVBERi0=',{siparis_no:1}));assert.equal(count,2);
console.log('PASS: single preview counts once; inner Print does not double-count; reopening counts again; failed preview does not count; bulk keeps its separate handler');
})().catch(e=>{console.error(e);process.exit(1)});
