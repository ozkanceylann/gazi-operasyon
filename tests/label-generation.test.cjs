const fs=require('fs'),assert=require('assert/strict');
const code=p=>new Function('$input','$','Buffer',fs.readFileSync(p,'utf8'));
const old={siparis_no:10456,kargo_durumu:'Kargolandı',kargo_siparis_no:'REF10456-R1',orderinvoiceid:'ORDER1',kargo_takip_kodu:'123456789012',kargo_zpl:'OLD_LABEL',zpl_base64:'JVBEROLD',etiket_yazdirma_sayisi:3,kargo_api_yanit:JSON.stringify({tracking:{status:{shipmentId:'123456789012'}},bulk_tracking:{status:{shipmentId:'123456789012'}},barcodeResult:[{referenceId:'REF10456-R1',shipmentId:'123456789012'}]})};
const response={statusCode:200,body:{statusCode:200,messages:'İşlem Başarılı'}};
const patch=code('n8n/cancellation-record.js')({first:()=>({json:response})},name=>({first:()=>({json:name==='İptal · İptal · Sipariş Oku'?old:name==='İptal · Gazi Kargo Canlı'?{body:{reason:'test',labelCancellationConfirmed:true,labelsDestructionConfirmed:true}}:{operation:'gonderi_iptal'}})}),Buffer)[0].json;
for(const key of ['kargo_zpl','zpl_base64','kargo_qr_kod','kargo_takip_kodu','invoiceid','orderinvoiceid','etiket_olusturma_tarihi','etiket_son_yazdirma'])assert.equal(patch[key],null,key+' must clear on successful cancellation');
assert.equal(patch.etiket_yazdirma_sayisi,0);assert.equal(patch.kargo_siparis_no,'REF10456-R2');assert.equal(patch.kargo_durumu,'Bekliyor');
const meta=JSON.parse(patch.kargo_api_yanit);assert.equal(meta.tracking,undefined);assert.equal(meta.bulk_tracking,undefined);assert.equal(meta.barcodeResult,undefined);assert.equal(meta.cancellation.previousShipment.kargo_zpl,'OLD_LABEL');
assert.throws(()=>code('n8n/cancellation-record.js')({first:()=>({json:{statusCode:500,body:{error:{message:'no'}}}})},()=>({first:()=>({json:old})}),Buffer));
const recreated=code('n8n/cargo-create-record.js')({first:()=>({json:{statusCode:200,body:[{referenceId:'REF10456-R2',orderInvoiceId:'ORDER2',orderInvoiceDetailId:'DETAIL2'}]}})},name=>({first:()=>({json:name==='Kargola · Siparişi Kontrol Et'?{...old,...patch}: {order:{referenceId:'REF10456-R2',isCOD:1,codAmount:1100}}})}),Buffer)[0].json;
const fresh=JSON.parse(recreated.kargo_api_yanit);assert.equal(fresh.tracking,undefined);assert.equal(fresh.barcodeResult,undefined);assert.equal(fresh.cancellation.previousShipment.kargo_zpl,'OLD_LABEL');assert.equal(fresh.activeShipmentCancelled,false);
for(const prefix of ['barcode','cargo']){
 const validate=code('n8n/'+prefix+'-validate-labels.js'),source={siparis_no:10456,kargo_siparis_no:'REF10456-R2',orderinvoiceid:'ORDER2'},get=name=>({first:()=>({json:name.endsWith('Etiket Kontrol')?{count:1}:source})});
 const freshLabel={statusCode:200,body:[{referenceId:'REF10456-R2',shipmentId:'234567890123',invoiceId:'INV2',barcodes:[{barcode:'NEW_BARCODE',pieceNumber:1,value:'^XA^FDNEW_BARCODE^FS^XZ'}]}]};
 assert.equal(validate({first:()=>({json:freshLabel})},get,Buffer)[0].json.labels[0].barcode,'NEW_BARCODE');
 const stale=structuredClone(freshLabel);stale.body[0].referenceId='REF10456-R1';assert.throws(()=>validate({first:()=>({json:stale})},get,Buffer));
}
const filters=JSON.parse(fs.readFileSync('n8n/label-write-conditions.json'));
for(const {parameters:p} of filters){assert.deepEqual(p.filters.conditions.map(c=>c.keyName),['siparis_no','kargo_siparis_no','orderinvoiceid']);
 const expected={siparis_no:10456,kargo_siparis_no:'REF10456-R1',orderinvoiceid:'ORDER1'};
 const match=row=>p.filters.conditions.every(c=>row[c.keyName]===expected[c.keyName]);
 assert(match(old));assert(!match({...old,kargo_siparis_no:'REF10456-R2',orderinvoiceid:'ORDER2'}),'Late write from cancelled shipment must not match recreated row');}
console.log('PASS: cancel clears labels/PDF/IDs/print counters, old API data quarantined, new order reset, stale DHL label rejected, delayed old-generation write blocked');
