const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx={};vm.createContext(ctx);vm.runInContext(fs.readFileSync('shipping-approval.js','utf8')+';globalThis.control=ShippingApproval',ctx);
(async()=>{
 const c=ctx.control,orders=[{siparis_no:123},{siparis_no:124}];
 const db={rpc:async(name,args)=>({data:args.p_ids.map(order_id=>({order_id,mobile:true,can_ship:false,reasons:['Onay gerekli <kontrol>']}))})};
 await c.load(db,orders);assert(orders.every(o=>o.shippingControl.order_id===o.siparis_no));assert(c.badge(orders[0]).includes('🔒'));assert(c.badge(orders[0]).includes('&lt;kontrol&gt;'));assert(!c.badge(orders[0]).includes('<kontrol>'));
 await c.load({rpc:async()=>({error:Error('Offline')})},orders);assert(orders.every(o=>o.shippingControlError));assert(c.badge(orders[0]).includes('kontrol edilemedi'));
 await assert.rejects(c.assert({rpc:async()=>({error:Error('Dekont gerekli')})},123),/Dekont gerekli/);
 await assert.rejects(c.assert({rpc:async()=>({data:{siparis_no:999}})},123),/doğrulanamadı/);
 assert.equal((await c.assert({rpc:async()=>({data:{siparis_no:123}})},123)).siparis_no,123);
 console.log('PASS: control retrieval, escaped warnings, fail-closed errors, authorizer error propagation and order identity.');
})().catch(e=>{console.error(e);process.exitCode=1});
