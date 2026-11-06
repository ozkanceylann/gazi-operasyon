const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
const code=source.slice(source.indexOf('async function createAllMissingLabels('),source.indexOf('window.createAllMissingLabels='));
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
(async()=>{
  const pending=new Map([1,2,3].map(id=>[id,deferred()])),started=[],statuses=[],reported=[];let reloads=0;
  const ctx=vm.createContext({bulkLabelJob:null,operationFilter:'label',syncBulkLabelButton(){},showBulkLabelErrors(errors){reported.push([...errors]);},bulkLabelStatus(text){statuses.push(text);},bulkLabelIds:async()=>[1,2,3,1],createBulkLabel(id){started.push(id);return pending.get(id).promise;},loadOrders:async()=>{reloads++;}});
  vm.runInContext(code,ctx);
  const running=ctx.createAllMissingLabels();await new Promise(setImmediate);
  assert.deepEqual(started,[1,2,3],'Every unique order starts before any response');
  await ctx.createAllMissingLabels();assert.deepEqual(started,[1,2,3],'Repeated clicks cannot start another batch');
  pending.get(2).reject(Error('DHL error'));await new Promise(setImmediate);await new Promise(setImmediate);
  assert(ctx.bulkLabelJob,'Failure must not unlock while other orders are pending');assert.equal(reloads,0);
  pending.get(3).resolve(false);pending.get(1).resolve(true);await running;
  assert.equal(ctx.bulkLabelJob,null);assert.equal(reloads,1);
  assert.equal(reported.at(-1)[0].id,2);assert.equal(reported.at(-1)[0].message,'DHL error');
  assert(statuses.some(text=>text.includes('3 / 3')));assert(statuses.at(-1).includes('1 siparişin etiketi oluşturuldu · 1 zaten oluşmuştu · 1 hata'));
  ctx.bulkLabelIds=async()=>[];await ctx.createAllMissingLabels();assert.equal(ctx.bulkLabelJob,null);
  ctx.bulkLabelIds=async()=>{throw Error('Query failed')};await ctx.createAllMissingLabels();assert.equal(ctx.bulkLabelJob,null);assert.equal(statuses.at(-1),'Query failed');
  console.log('PASS: all orders start before responses; deduplication; repeated-click lock; partial failure; completion progress; single reload; empty/error cleanup');
})().catch(error=>{console.error(error);process.exitCode=1;});
