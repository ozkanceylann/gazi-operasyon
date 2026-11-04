(function(root){
 'use strict';
 const DOT=72/203;
 function productItems(o){
  let raw=o.urun_bilgisi??'';
  if(typeof raw==='string'){try{const p=JSON.parse(raw);if(Array.isArray(p))raw=p;}catch{}}
  const products=(Array.isArray(raw)?raw:[raw]).map(String).flatMap(x=>x.split(/\\n|\r?\n/)).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
  return products.map(p=>p.normalize('NFC'));
 }
 function productText(o){
  return `Sipariş: ${o.siparis_no} / ${productItems(o).join(' / ')}`;
 }
 function amountText(o){
  let value=String(o.toplam_tutar??'').trim().replace(/(?:TL|TRY|₺)/gi,'').replace(/\s/g,'');
  if(!value)return '';
  if(/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(value))value=value.replace(/\./g,'').replace(',','.');
  else if(!/^\d+(?:\.\d{1,2})?$/.test(value))throw Error('Etiket fiyatı geçersiz.');
  return Number(value).toLocaleString('tr-TR',{maximumFractionDigits:2})+' TL';
 }
 function wrap(text,font,size,width){
  const lines=[];let line='';
  for(const word of text.split(/\s+/)){
   const test=line?line+' '+word:word;
   if(font.widthOfTextAtSize(test,size)<=width){line=test;continue;}
   if(line){lines.push(line);line='';}
   for(const ch of Array.from(word)){
    if(line&&font.widthOfTextAtSize(line+ch,size)>width){lines.push(line);line='';}
    line+=ch;
   }
  }
  if(line)lines.push(line);
  return lines;
 }
 function fit(text,font,width,height,maxSize){
  let low=0.001,high=maxSize,best;
  for(let i=0;i<30;i++){
   const size=(low+high)/2,lines=wrap(text,font,size,width),lineHeight=size*1.25;
   if(lines.length*lineHeight<=height&&lines.every(l=>font.widthOfTextAtSize(l,size)<=width)){
    best={size,lines,lineHeight};low=size;
   }else high=size;
  }
  if(!best)throw Error('Ürün metni etiket alanına sığdırılamadı.');
  return best;
 }
 async function render(bytes,order,{PDFLib,fontkit,fontBytes}={}){
  const {PDFDocument,rgb,degrees,pushGraphicsState,popGraphicsState,rectangle,clip,endPath}=PDFLib;
  const doc=await PDFDocument.load(bytes);doc.registerFontkit(fontkit);
  const font=await doc.embedFont(fontBytes,{subset:true});
  const products=productText(order),amount=amountText(order);
  const pages=doc.getPages();
  for(const page of pages){
   const {width,height}=page.getSize();
   if(Math.abs(width-831*DOT)>1||Math.abs(height-975*DOT)>2)throw Error('Etiket ölçüsü metin alanı için tanınmadı.');
   // Exactly the existing 90 x 640 dot footer; no carrier barcode is covered.
   page.drawRectangle({x:18*DOT,y:height-792*DOT,width:94*DOT,height:644*DOT,color:rgb(1,1,1)});
   function field(u,v,w,h,draw){
    page.pushOperators(pushGraphicsState(),rectangle((110-v-h)*DOT,height-(150+u+w)*DOT,h*DOT,w*DOT),clip(),endPath());
    draw();page.pushOperators(popGraphicsState());
   }
   function text(line,u,v,size){page.drawText(line,{x:(110-v)*DOT,y:height-(150+u)*DOT,size,font,rotate:degrees(-90),color:rgb(0,0,0)});}
   const productWidth=(amount?540:640)-4;
   if(Number(order.siparis_no)===10769){
    // Limited pilot: two bullet columns for order 10769 only.
    const items=productItems(order),middle=Math.ceil(items.length/2);
    const columns=[items.slice(0,middle),items.slice(middle)];
    const gap=16,columnWidth=(productWidth-gap)/2;
    let low=0.001,high=24*DOT,best;
    for(let i=0;i<30;i++){
     const size=(low+high)/2,lineHeight=size*1.25;
     const rows=columns.map(list=>list.flatMap(item=>wrap('• '+item,font,size,columnWidth*DOT)));
     if((1+Math.max(...rows.map(r=>r.length)))*lineHeight<=86*DOT&&font.widthOfTextAtSize('Sipariş: '+order.siparis_no,size)<=productWidth*DOT){best={size,lineHeight,rows};low=size;}else high=size;
    }
    if(!best)throw Error('Ürün listesi etiket alanına sığmadı.');
    field(0,0,amount?540:640,90,()=>{
     const baseline=2+font.heightAtSize(best.size,{descender:false})/DOT;
     text('Sipariş: '+order.siparis_no,2,baseline,best.size);
     best.rows.forEach((rows,column)=>rows.forEach((line,i)=>text(line,2+column*(columnWidth+gap),baseline+(i+1)*best.lineHeight/DOT,best.size)));
    });
   }else{
    const layout=fit(products,font,productWidth*DOT,86*DOT,24*DOT);
    field(0,0,amount?540:640,90,()=>layout.lines.forEach((line,i)=>text(line,2,2+(i*layout.lineHeight+font.heightAtSize(layout.size,{descender:false}))/DOT,layout.size)));
   }
   if(amount){
    let size=24*DOT;
    while(font.widthOfTextAtSize(amount,size)>80*DOT)size*=0.95;
    const tw=font.widthOfTextAtSize(amount,size),th=font.heightAtSize(size),pad=3*DOT;
    const bw=tw+pad*2,bh=th+pad*2,u=550+(90-bw/DOT)/2,v=(90-bh/DOT)/2;
    field(550,0,90,90,()=>{
     page.drawRectangle({x:(110-v-bh/DOT)*DOT,y:height-(150+u+bw/DOT)*DOT,width:bh,height:bw,borderColor:rgb(0,0,0),borderWidth:DOT});
     text(amount,u+pad/DOT,v+(pad+font.heightAtSize(size,{descender:false}))/DOT,size);
    });
   }
  }
  return doc.save();
 }
 let fontPromise;
 async function apply(bytes,order){
  if(!fontPromise)fontPromise=fetch('assets/label-font.ttf').then(r=>{if(!r.ok)throw Error('Etiket yazı tipi yüklenemedi.');return r.arrayBuffer();}).catch(e=>{fontPromise=null;throw e;});
  return render(bytes,order,{PDFLib:root.PDFLib,fontkit:root.fontkit,fontBytes:await fontPromise});
 }
 root.CargoPdfText={apply,render,fit,productText};
})(typeof window==='undefined'?globalThis:window);
