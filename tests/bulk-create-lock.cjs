const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');const s=fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8');
function button(operation,id,disabled=false){return {disabled,dataset:{labelOperation:operation},classList:{contains:()=>false},closest:()=>({dataset:{orderId:String(id)}})}}
const create=button('create',1),print=button('print',2),previouslyDisabled=button('create',3,true);const buttons=[create,print,previouslyDisabled];const ctx=vm.createContext({bulkLabelJob:{kind:'create'},document:{querySelectorAll:()=>buttons},busy:{kargola:new Set(),barkod:new Set()},selectedOrder:null});
vm.runInContext(s.slice(s.indexOf('function syncSingleLabelCreateButtons'),s.indexOf('function syncBulkLabelButton')),ctx);
ctx.syncSingleLabelCreateButtons();assert(create.disabled);assert(!print.disabled);assert(previouslyDisabled.disabled);assert(!previouslyDisabled.dataset.bulkCreateLocked);
const added=button('create',4);buttons.push(added);ctx.syncSingleLabelCreateButtons();assert(added.disabled);
ctx.bulkLabelJob=null;ctx.syncSingleLabelCreateButtons();assert(!create.disabled);assert(!added.disabled);assert(previouslyDisabled.disabled);assert(!print.disabled);
ctx.bulkLabelJob={kind:'create'};ctx.syncSingleLabelCreateButtons();create.dataset.labelOperation='print';ctx.syncSingleLabelCreateButtons();assert(!create.disabled);
assert(s.includes('if(operation==="create"&&bulkLabelJob?.kind==="create")'));
console.log('PASS: create buttons lock; print stays enabled; newly rendered buttons lock; completion restores only owned locks; existing disabled state preserved; action guard present');
