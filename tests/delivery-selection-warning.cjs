const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const s=fs.readFileSync('app.js','utf8'),a=s.indexOf('function missingDeliveryFields('),b=s.indexOf('function deliveryWarning(',a),c={};vm.createContext(c);vm.runInContext(s.slice(a,b),c);
const base={sehir_kodu:'05',ilce_kodu:'1',sehir:'AMASYA',ilce:'MERKEZ',adres:'Adres',subeden_teslim:true,teslim_subesi:'AMASYA'};
assert.equal(c.missingDeliveryFields(base).length,0);
for(const branch of ['', 'DHL Kargo','DHL','Şube seçin','Kargo şubesi'])assert(c.missingDeliveryFields({...base,teslim_subesi:branch}).includes('Teslim şubesi eksik'),branch);
for(const o of [{...base,subeden_teslim:null},{...base,teslim_sekli_kontrol:true},{...base,subeden_teslim:false,teslim_subesi:'Teslim seçin'}])assert(c.missingDeliveryFields(o).includes('Teslim şekli seçilmeli'));
assert(c.missingDeliveryFields({...base,sehir_kodu:null}).includes('İl kodu eksik'));
assert(c.missingDeliveryFields({...base,ilce_kodu:' '}).includes('İlçe kodu eksik'));
console.log('PASS: generic branch and unselected delivery warnings; valid named branch passes.');
