const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const app=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const start=app.indexOf('    const saveCounters=async()=>');const end=app.indexOf('\n    bulkLabelStatus(',start);const handler=app.slice(start,end);
(async()=>{
let printed=0,writes=[],fail=false,failPrint=false,released=0;
const ctx=vm.createContext({panel:{hidden:true},job:{saving:false,pending:[{siparis_no:1},{siparis_no:2}]},preview:{print:{onclick:()=>{if(failPrint)throw Error('blocked');printed++}}},retry:{hidden:true},status:{},result:{orders:[1,2],failed:[]},bulkLabelStatus:()=>{},release:()=>released++,loadOrders:async()=>{},saveBulkLabelCounter:async o=>{if(fail&&o.siparis_no===2)throw Error('network');writes.push(o.siparis_no)},confirmBulkLabels:async(pending,save)=>{let remaining=[],errors=[];for(const o of pending){try{await save(o)}catch(e){remaining.push(o);errors.push({id:o.siparis_no,message:e.message})}}return {remaining,errors}}});
vm.runInContext(handler,ctx);assert.equal(printed,0);assert.equal(writes.length,0);failPrint=true;await ctx.preview.print.onclick();assert.equal(writes.length,0);
failPrint=false;fail=true;await ctx.preview.print.onclick();assert.equal(printed,1);assert.deepEqual(writes,[1]);assert.equal(ctx.retry.hidden,false);
fail=false;await ctx.retry.onclick();assert.equal(printed,1);assert.deepEqual(writes,[1,2]);assert.equal(ctx.retry.hidden,true);assert.equal(released,1);
await ctx.preview.print.onclick();assert.equal(printed,2);assert.deepEqual(writes,[1,2]);
assert(!app.includes("confirm.textContent='Yazdırma tamamlandı'"));
console.log('PASS: no counts on preview, print click saves, failed print leaves counters alone, failed saves retry without reprint, repeated print does not double count');
})().catch(e=>{console.error(e);process.exit(1)});
