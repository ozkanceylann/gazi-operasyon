const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('rapor.html','utf8');
const script=html.split('<script>').at(-1).split('</script>')[0];new vm.Script(script);
function extract(start,end){return script.slice(script.indexOf(start),script.indexOf(end,script.indexOf(start)));}
const context=vm.createContext({takerLabel:r=>r.siparis_alan});
vm.runInContext(extract('  function parseAmount','  let detailTrigger')+extract('  function productNames','  function ensureChartLibrary'),context);
context.rows=[
 {siparis_alan:'Ayşe',kargo_adet:'3',toplam_tutar:'1.250,50',tarih:'2026-10-25',kargo_durumu:'Bekliyor'},
 {siparis_alan:'Ayşe',kargo_adet:'2',toplam_tutar:'500',tarih:'2026-10-25',kargo_durumu:'İptal'},
 {siparis_alan:'Ali',kargo_adet:'7',toplam_tutar:'2000',tarih:'2026-10-24',kargo_durumu:'Tamamlandı'},
 {siparis_alan:'Ali',kargo_adet:'bad',toplam_tutar:'0',tarih:'2026-10-24',kargo_durumu:'Bekliyor'}];
const data=vm.runInContext('aggregateReport(rows)',context);
assert.equal(data.people.get('Ayşe'),2);assert.equal(data.parcels.get('Ayşe'),5);assert.equal(data.revenue.get('Ayşe'),1250.5);
assert.equal(data.parcels.get('Ali'),7);assert.equal(data.revenue.get('Ali'),2000);
assert.equal(data.daily.get('2026-10-25'),2);assert.equal(data.dailyParcels.get('2026-10-25'),5);
assert.equal(data.daily.get('2026-10-24'),2);assert.equal(data.dailyParcels.get('2026-10-24'),7);
assert.equal(vm.runInContext('aggregateReport([]).dailyParcels.size',context),0);
assert.equal(vm.runInContext('aggregateReport([]).revenue.size',context),0);
for(const value of ['',null,'-1','2.5','3+2']){context.value=value;assert.equal(vm.runInContext('reportParcels(value)',context),0);}
assert.match(html,/siparis_tel,kargo_adet,urun_bilgisi/);
assert.match(html,/make\("revenueByPerson",data.revenue/);
assert.match(html,/label:"Parça adedi"/);
assert.match(html,/escapeReport\(person\)/);
const elements=new Map();
context.document={getElementById:id=>{if(!elements.has(id))elements.set(id,{id,parentElement:{style:{}},getBoundingClientRect:()=>({top:9999})});return elements.get(id);}};
context.escapeReport=String;context.window={innerHeight:800};context.drawReportChart=()=>{};
vm.runInContext('let chartRevision=0;const chartInstances=new Map(),chartSpecs=new Map(),chartObserver={observe(){}};'+extract('  const chartColors','\n  /* =============================='),context);
vm.runInContext('buildCharts(rows)',context);
const daily=vm.runInContext('chartSpecs.get("dailyChart")',context);
assert.deepEqual(Array.from(daily.data.labels),['2026-10-24','2026-10-25']);
assert.deepEqual(Array.from(daily.data.datasets[0].data),[2,2]);
assert.deepEqual(Array.from(daily.data.datasets[1].data),[7,5]);
assert.equal(daily.data.datasets[1].label,'Parça sayısı');
assert.notEqual(daily.data.datasets[0].borderColor,daily.data.datasets[1].borderColor);
assert.equal(daily.options.plugins.legend.display,true);
console.log('PASS: daily/per-person parcel totals, chronological chart alignment, distinct colors and legend, Turkish amounts, cancellation scope, empty and invalid quantities');
