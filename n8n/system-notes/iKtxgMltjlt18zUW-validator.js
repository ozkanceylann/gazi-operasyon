function parseCargoWeights(value, count, repeatSingle = true) {
  count = Number(count);
  if (!Number.isSafeInteger(count) || count < 1 || count > 100) throw new Error("Paket adedi 1–100 olmalı.");
  let raw = String(value ?? "").replace(/kg/gi, "").trim();
  if (raw.startsWith("[")) {
    let items; try { items = JSON.parse(raw); } catch { throw new Error("KG listesi geçersiz."); }
    if (!Array.isArray(items) || !items.length || items.some(x => !["string","number"].includes(typeof x))) throw new Error("KG listesi geçersiz.");
    raw = items.join("+");
  }
  if (!raw) throw new Error("Her paket için KG yazın. Örnek: 5+10+5+6");
  const plus = raw.includes("+");
  let parts = plus ? raw.split("+") : count === 1 ? [raw] : raw.split(/[,|/;\s]+|(?<=\d)-(?=\d)/);
  parts = parts.map(part => part.trim());
  if (parts.some(part => !/^\d+(?:[.,]\d+)?$/.test(part))) throw new Error("KG bilgisi geçersiz. Paketleri + ile ayırın.");
  let weights = parts.map(part => Number(part.replace(",", ".")));
  if (weights.some(kg => !Number.isFinite(kg) || kg <= 0)) throw new Error("Paket kilogramları sıfırdan büyük olmalı.");
  // A historical single weight applied to every parcel. Keep that interpretation on reads.
  if (!plus && repeatSingle && weights.length === 1 && count > 1) weights = Array(count).fill(weights[0]);
  if (weights.length !== count) throw new Error("KG sayısı paket adediyle aynı olmalı. Örnek: 5+10");
  return weights;
}
// Only combine when every product has one explicit, unambiguous weight.
// Do not infer a total from AI's already-rounded parcel weights (5+5).
function smallBoxProductTotal(products) {
  if(!Array.isArray(products)||!products.length)return null;
  let total=0;
  for(const product of products){
    const text=String(product).toLocaleLowerCase("tr-TR");
    if(/\d\s*[x×*]|[x×*]\s*\d|\b(?:adet|tane)\b|\b(?:[2-9]|\d{2,})\s*(?:kova|bidon|teneke|paket|koli)\b|\d+\s*['’]?\s*(?:li|lı|lu|lü)\b/.test(text))return null;
    const matches=[...text.matchAll(/(\d+(?:[.,]\d+)?)\s*(kilogram|kg|gram|gr|g|litre|lt|l)(?![a-zçğıöşü])/g)];
    if(matches.length!==1)return null;
    const quantity=Number(matches[0][1].replace(",","."));
    const weight=/^(?:gram|gr|g)$/.test(matches[0][2])?quantity/1000:quantity;
    if(!Number.isFinite(weight)||weight<=0)return null;
    total+=weight;
  }
  return Math.round(total*1000)/1000;
}

return $input.all().map((item, index) => {
  const defaults = {
    siparis_alan_isim:"", siparis_alan_numara:"", musteri_ad_soyad:"",
    musteri_telefon:"", adres:"", Sehir:"", ilce:"", urunler:[],
    toplam:"", odeme_yontemi:"Belirtilmemiş", notlar:"", sistem_notu:"",
    Siparis:"Hayır", firma:"", kargo_adet:"", kargo_kg:"", subeden_teslim:false, teslim_subesi:"", teslim_sekli_kontrol:false
  };
  const raw = item.json.output ?? item.json.data ?? item.json.text ?? item.json.message ?? item.json;
  let parsed;
  let parseError = "";
  try {
    parsed = typeof raw === "string"
      ? JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""))
      : raw;
    if (typeof parsed === "string") parsed = JSON.parse(parsed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON bir nesne olmalı");
    if (!["Siparis","siparis","musteri_ad_soyad","musteri_ad_soyadi","musteri_telefon","urunler","ürünler"].some(k => k in parsed)) {
      throw new Error("Beklenen sipariş alanları yok");
    }
  } catch (error) {
    parseError = error.message;
    parsed = {};
  }
  const aliases = {musteri_ad_soyadi:"musteri_ad_soyad",sehir:"Sehir","şehir":"Sehir",il:"Sehir","ürünler":"urunler",urun:"urunler",siparis:"Siparis"};
  for (const [from,to] of Object.entries(aliases)) {
    if (parsed[from] != null && (parsed[to] == null || parsed[to] === "")) parsed[to] = parsed[from];
  }
  const data = {...defaults,...parsed};
  for (const field of Object.keys(defaults).filter(k => !["urunler","subeden_teslim","teslim_sekli_kontrol"].includes(k))) {
    data[field] = data[field] == null ? defaults[field] : String(data[field]).trim();
  }
  const phone = value => {
    const s = String(value ?? "");
    if (s.includes("@") && !s.endsWith("@s.whatsapp.net")) return "";
    let digits = s.split("@")[0].replace(/\D/g,"");
    if (digits.length === 12 && digits.startsWith("90")) digits=digits.slice(2);
    if (digits.length === 11 && digits.startsWith("0")) digits=digits.slice(1);
    return /^5\d{9}$/.test(digits) ? digits : "";
  };
  const inputPhone = data.musteri_telefon;
  data.musteri_telefon = phone(inputPhone);
  const webhook = $("MESAJ_HAZIRLA").item.json;
  // Customer notes must be source excerpts; generated prose is kept separately.
  const sourceNoteText = String(webhook._message_text || "").normalize("NFC").replace(/\s+/g," ").trim().toLocaleLowerCase("tr-TR");
  const customerNotes = [], generatedNotes = [];
  for (const line of data.notlar.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)) {
    const normalized = line.normalize("NFC").replace(/\s+/g," ").trim().toLocaleLowerCase("tr-TR");
    (sourceNoteText.includes(normalized) ? customerNotes : generatedNotes).push(line);
  }
  data.notlar = customerNotes.join("\n");
  data.sistem_notu = [data.sistem_notu,...generatedNotes].filter(Boolean).join("\n");


  const bool = value => value === true || String(value).trim().toLowerCase() === "true";
  const validBool = value => typeof value === "boolean" || /^(?:true|false)$/i.test(String(value).trim());
  data.subeden_teslim = bool(data.subeden_teslim);
  data.teslim_sekli_kontrol = bool(data.teslim_sekli_kontrol) || !validBool(parsed.subeden_teslim) || !validBool(parsed.teslim_sekli_kontrol);
  // AI chooses intent. Missing or malformed fields require a human decision.
  data.teslim_subesi = data.subeden_teslim ? String(data.teslim_subesi || "").slice(0,150) : "";
  const deliveryText = String(webhook._message_text || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i");
  const branchMention = /\bsube(?:den|si|sinden)?\b/.test(deliveryText);
  const nearOnly = /\bsube(?:si|sinin)?\s+(?:yani|yaninda|yakini|yakininda)\b/.test(deliveryText);
  const pickup = /\bsubeden\s+(?:teslim|al)|\bsube\s+teslim(?:ati)?\b|\bsubesi(?:nden)?\s+(?:teslim|al)/.test(deliveryText);
  const negatedPickup = /\bsubeden\s+(?:teslim\s+(?:degil|olmasin|istemiyor)|alma(?:yacak|yacagim|yin))/.test(deliveryText);
  const home = /\b(?:eve|evine|adrese|adresine)\s+(?:teslim|gelsin|gonder)/.test(deliveryText);
  if (pickup && !negatedPickup && !nearOnly && !home) data.subeden_teslim = true;
  if (negatedPickup) { data.subeden_teslim = false; data.teslim_subesi = ""; }
  if (pickup && home && !negatedPickup || branchMention && /\b(?:veya|yahut|ya da|olmazsa|belki)\b/.test(deliveryText)) data.teslim_sekli_kontrol = true;
  if (nearOnly && !pickup && data.subeden_teslim) data.teslim_sekli_kontrol = true;
  if (data.subeden_teslim && !data.adres) data.adres = data.teslim_subesi ? data.teslim_subesi + " şubesi, şubeden teslim" : "Şubeden teslim";

  const sender = phone(webhook._sender_phone);
  data.siparis_alan_numara = sender ? "0"+sender : "";
  data.Sehir = data.Sehir.toLocaleUpperCase("tr-TR");
  data.ilce = data.ilce.toLocaleUpperCase("tr-TR");
  const productInput = data.urunler;
  if (Array.isArray(productInput)) {
    if (productInput.some(p => p != null && typeof p === "object")) parseError ||= "Ürünler metin dizisi olmalı";
    data.urunler = productInput.filter(p => typeof p === "string" || typeof p === "number").map(p => String(p).trim()).filter(Boolean);
  } else if (typeof productInput === "string") {
    data.urunler = productInput.split(/\r?\n|[•●]/).map(p=>p.trim()).filter(Boolean);
  } else {
    parseError ||= "Ürünler metin veya metin dizisi olmalı";
    data.urunler = [];
  }
  // Explicit payment instructions override only the collection amount.
  const paymentText=String(webhook._message_text||"").toLocaleLowerCase("tr-TR");
  const explicitFreeExchange=/(?:ücretsiz|ucretsiz|bedelsiz|ödemesiz|odemesiz)\s+(?:değişim|degisim)/i.test(paymentText);
  const exchangeMention=/(?:^|[^a-zçğıöşü])(?:değişim|degisim)(?=$|[^a-zçğıöşü])/i.test(paymentText);
  const freeProduct=/(?:^|[^a-zçğıöşü])(?:bedelsiz|ödemesiz|odemesiz)(?=$|[^a-zçğıöşü])/i.test(paymentText);
  const foldedPayment=paymentText.normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i");
  const paymentNotReceived=/\b(?:odenmedi|odemedi|alinmadi|yapilmadi|yatirilmadi|alinacak|odenecek|yapilacak|yatirilacak)\b/.test(foldedPayment);
  const bankPaid=!paymentNotReceived&&(
    /\b(?:iban|havale)\b[^\n.!?]{0,60}\b(?:odedi|odendi|yatirdi|yatirildi|yapildi|alindi|odendi)\b/.test(foldedPayment)||
    /\b(?:odeme(?:si)?|tutar|bedel)\b[^\n.!?]{0,30}\b(?:alindi|yapildi|odendi)\b/.test(foldedPayment)||
    /\b(?:pesin odendi|odendi)\b/.test(foldedPayment));
  const productFree=/\bucretsiz\b/.test(foldedPayment)&&!(/\bkargo\s+(?:bedava|ucretsiz)\b|\bucretsiz\s+kargo\b/.test(foldedPayment)&&!/(?:urun|siparis|degisim|gonderim)\s+(?:bedelsiz|ucretsiz)|(?:bedelsiz|ucretsiz)\s+(?:urun|siparis|degisim|gonderim)/.test(foldedPayment));
  // Explicit outstanding balance takes precedence over a partial EFT/IBAN payment.
  const moneyPattern="(?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:[.,]\\d{1,2})?)";
  const parsePaymentAmount=value=>{
    let text=String(value);
    if(/^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$/.test(text))text=text.replace(/\./g,'').replace(',','.');
    else text=text.replace(',','.');
    const amount=Number(text);
    return Number.isFinite(amount)&&amount>=0?amount:null;
  };
  // A stated exchange charge is collectible; "değişim" alone cannot erase it.
  const exchangeAmounts=[...new Set([
    ...[...foldedPayment.matchAll(new RegExp("(?<![\\d.,])("+moneyPattern+")\\s*(?:₺|tl|try|lira)(?![a-z])","g"))].map(m=>parsePaymentAmount(m[1])),
    ...[...foldedPayment.matchAll(new RegExp("(?:^|\\n)\\s*("+moneyPattern+")\\s+(?:ucretli\\s+)?degisim\\b","g"))].map(m=>parsePaymentAmount(m[1]))
  ].filter(x=>x!==null&&x>0))];
  const freeExchange=explicitFreeExchange||exchangeMention&&!exchangeAmounts.length&&!/(?:ücretli|ucretli|fiyat farkı|fiyat farki|ek ödeme|ek odeme)/i.test(paymentText);
  const remainderValues=[];
  const balancePatterns=[
    new RegExp("\\b(?:kalan(?:\\s+(?:tutar|tutari|borc|borcu|odeme|bedel|miktar|tahsilat))?|bakiye(?:\\s+(?:tutar|tutari))?)\\s*[:=\\-–]?\\s*("+moneyPattern+")(?![\\d.,])","g"),
    new RegExp("(?<![\\d.,])("+moneyPattern+")\\s*(?:₺|tl|try|lira)?\\s*(?:daha\\s+)?(?:kaldi|kalacak)(?![a-z])","g")
  ];
  for(const pattern of balancePatterns)for(const match of foldedPayment.matchAll(pattern)){
    const amount=parsePaymentAmount(match[1]);if(amount!==null)remainderValues.push(amount);
  }
  const totalValues=[...foldedPayment.matchAll(new RegExp("\\btoplam(?:\\s+(?:tutar|tutari|bedel))?\\s*[:=\\-–]?\\s*("+moneyPattern+")(?![\\d.,])","g"))].map(m=>parsePaymentAmount(m[1]));
  const paidValues=[...foldedPayment.matchAll(new RegExp("(?<![\\d.,])("+moneyPattern+")\\s*(?:₺|tl|try|lira)?\\s*(?:(?:eft|iban|havale|ile|pesin|nakit|olarak|a|ya)\\s*['’]?\\s*)*(?:odedi|odendi|yolladi|gonderdi|yatirdi|yatirildi)(?![a-z])","g"))].map(m=>parsePaymentAmount(m[1]));
  const totals=[...new Set(totalValues.filter(x=>x!==null))],paid=[...new Set(paidValues.filter(x=>x!==null))];
  const explicitRemainders=[...new Set(remainderValues)];
  let accountingConflict=false;
  if(totals.length===1&&paid.length===1){
    const computed=Math.round((totals[0]-paid[0])*100)/100;
    if(computed<0||explicitRemainders.length===1&&Math.abs(explicitRemainders[0]-computed)>0.005)accountingConflict=true;
    else if(!explicitRemainders.length&&computed>=0)remainderValues.push(computed);
  }
  const bankMention=/\b(?:eft|iban|havale)\b/.test(foldedPayment);
  const fullPayment=/\b(?:tamami|tamamini|tumunu|hepsi|tamamen)\s+(?:eft|iban|havale|ile|olarak|pesin|\s)*(?:odendi|odedi|yolladi|gonderdi|yatirdi)|\b(?:borcu|kalan)\s+yok\b/.test(foldedPayment);
  const amountWithBank=new RegExp("(?:"+moneyPattern+")\\s*(?:₺|tl|try|lira)?\\s*(?:eft|iban|havale)\\b").test(foldedPayment);
  const unquantifiedPartial=!explicitRemainders.length&&!totals.length&&bankMention&&(paid.length>0||amountWithBank)&&!fullPayment;
  const uniqueRemainders=[...new Set(remainderValues)];
  const hasRemaining=uniqueRemainders.length>0;
  const remainingAmount=uniqueRemainders.length===1?uniqueRemainders[0]:null;
  const remainingMention=/\b(?:kalan(?:\s+(?:tutar|tutari|borc|borcu|odeme|bedel))?|bakiye|kaldi|kalacak)\b/.test(foldedPayment);
  const paymentNeedsReview=accountingConflict||unquantifiedPartial||uniqueRemainders.length>1||remainingMention&&!hasRemaining&&!/\b(?:kalan|bakiye|borc)\s+(?:tutar\s+)?(?:yok|kalmadi)\b/.test(foldedPayment);
  const noCollection=(freeExchange || freeProduct || productFree || bankPaid || /(?:^|[^a-zçğıöşü])eft(?=$|[^a-zçğıöşü])/i.test(paymentText) ) && !hasRemaining && !paymentNeedsReview;
  // Bank payment requires an explicit word, never a substring in a business/address name.
  const explicitBankPayment=/(?:^|[^a-z0-9])(?:eft|iban|havale|fast)(?=$|[^a-z0-9])/.test(foldedPayment);
  if(/^(?:eft|iban|havale|fast)$/i.test(data.odeme_yontemi)&&!explicitBankPayment&&!bankPaid&&!fullPayment){
    const card=/\b(?:kk|kart|kredi\s+karti)\b/.test(foldedPayment),cash=/\bnakit\b/.test(foldedPayment);
    data.odeme_yontemi=card&&cash?"Kapıda Kart/Nakit":card?"Kapıda Kart":cash?"Kapıda Nakit":"Kapıda Ödeme";
    if(Number(data.toplam)===0&&!noCollection&&!hasRemaining&&!paymentNeedsReview){
      const amounts=[...new Set([...foldedPayment.matchAll(new RegExp("(?<![\\d.,])("+moneyPattern+")\\s*(?:₺|tl|try|lira)(?![a-z])","g"))].map(m=>parsePaymentAmount(m[1])).filter(x=>x!==null&&x>0))];
      if(amounts.length===1)data.toplam=String(amounts[0]);
      else {data.toplam="";data.Siparis="Hayır";data.sistem_notu=[data.sistem_notu,"Ödeme kontrolü gerekli – EFT talimatı yok; tahsilat tutarı doğrulanmalı."].filter(Boolean).join("\n");}
    }
  }
  if(exchangeMention&&!noCollection&&!hasRemaining&&!paymentNeedsReview&&!explicitBankPayment&&!bankPaid&&!fullPayment){
    const card=/\b(?:kk|kart|kredi\s+karti)\b/.test(foldedPayment),cash=/\bnakit\b/.test(foldedPayment);
    if(exchangeAmounts.length===1){
      data.toplam=String(exchangeAmounts[0]);
      data.odeme_yontemi=card&&cash?"Kapıda Kart/Nakit":card?"Kapıda Kart":cash?"Kapıda Nakit":"Kapıda Ödeme";
    }else if(exchangeAmounts.length>1||/^(?:bedelsiz|ücretsiz|ucretsiz)$/i.test(data.odeme_yontemi)&&/(?:ucretli|fiyat farki|ek odeme)/.test(foldedPayment)){
      data.toplam="";data.Siparis="Hayır";
      data.sistem_notu=[data.sistem_notu,"Ödeme kontrolü gerekli – değişim tahsilat tutarı belirsiz."].filter(Boolean).join("\n");
    }
  }
  if(noCollection){
    data.toplam="0";
    data.odeme_yontemi=bankPaid||/(?:^|[^a-z])eft(?=$|[^a-z])/i.test(paymentText) ? "EFT" : "Bedelsiz";
    const originalNotes=data.sistem_notu;
    const priceMissing=/Eksik bilgi\s*[–-]\s*fiyat(?:\s*\([^)]*\))?(?=\s*(?:[.\n]|$))/i.test(originalNotes);
    data.sistem_notu=originalNotes.replace(/Eksik bilgi\s*[–-]\s*fiyat(?:\s*\([^)]*\))?\s*\.?\s*/gi,"").trim();
    const priceOnly=priceMissing && !/Eksik bilgi\s*[–-]/i.test(data.sistem_notu);
    if(data.Siparis.toLocaleLowerCase("tr-TR")==="hayır"&&(priceOnly||freeExchange)&&!parseError&&data.musteri_ad_soyad&&data.musteri_telefon&&data.urunler.length&&data.adres&&data.Sehir&&data.ilce&&!/Eksik bilgi\s*[–-]\s*(?!fiyat)/i.test(data.sistem_notu)){
      data.Siparis="Evet";
    }
  }
  if(hasRemaining&&!paymentNeedsReview){
    data.toplam=String(remainingAmount);
    const card=/\b(?:kk|kart|kredi\s+karti)\b/.test(foldedPayment),cash=/\bnakit\b/.test(foldedPayment);
    data.odeme_yontemi=remainingAmount===0?'EFT':card&&cash?'Kapıda Kart/Nakit':card?'Kapıda Kart':cash?'Kapıda Nakit':'Kapıda Ödeme';
  }
  if(paymentNeedsReview){
    data.toplam='';
    data.Siparis='Hayır';
    data.sistem_notu=[data.sistem_notu,'Ödeme kontrolü gerekli – kalan tutar belirsiz veya çelişkili.'].filter(Boolean).join('\n');
  }
  // A single 10 kg black olive order is one parcel unless packaging is explicit.
  const blackOlive10=/^10(?:[.,]0+)?\s*(?:kg|kilo|kilogram)\s+siyah(?:\s+zeytin)?(?:\s+kampanya\s*li)?[.!]?\s*$/;
  const foldProduct=value=>String(value||"").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/ı/g,"i").trim();
  const rawOrder=String(webhook._message_text||"");
  const rawFolded=foldProduct(rawOrder);
  const explicitPackaging=/\b(?:paket|koli|kova|bidon|teneke|adet|tane)\b|\b(?:ayri|bol|bolun|bolunsun)\b|\d\s*[x×*+]|\d\s*kg\s*['’]?\s*lik/.test(rawFolded);
  const rawWeights=[...rawFolded.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kilogram|kilo|kg)(?![a-z])/g)];
  if(!parseError&&data.urunler.length===1&&blackOlive10.test(foldProduct(data.urunler[0]))&&
     rawOrder.split(/\r?\n/).some(line=>blackOlive10.test(foldProduct(line)))&&
     rawWeights.length===1&&Number(rawWeights[0][1].replace(",","."))===10&&!explicitPackaging){
    data.kargo_adet="1";
    data.kargo_kg="10";
  }
  const smallBoxTotal=smallBoxProductTotal(data.urunler);
  const explicitSeparateParcels=/\bayri\s+(?:ayri\s+)?(?:koli|kargo|gonderi)\b|\b(?:[2-9]\d*|iki|uc|dort|bes|alti|yedi)\s+koli\b/.test(foldedPayment);
  if(!parseError&&!explicitSeparateParcels&&smallBoxTotal>0&&smallBoxTotal<=7){
    data.kargo_adet="1";
    data.kargo_kg="5";
  }
  // An explicit valid parcel list is authoritative for its own item count.
  // Never infer parcels from a single weight or repair malformed weight values.
  if (String(data.kargo_kg).includes("+")) {
    const parcelParts = String(data.kargo_kg).replace(/kg/gi, "").split("+").map(p => p.trim());
    if (parcelParts.length >= 2 && parcelParts.length <= 100 &&
        parcelParts.every(p => /^\d+(?:[.,]\d+)?$/.test(p) && Number(p.replace(",", ".")) > 0)) {
      data.kargo_adet = String(parcelParts.length);
    }
  }
  if (data.kargo_kg) {
    try { data.kargo_kg = parseCargoWeights(data.kargo_kg, data.kargo_adet, false).map(kg => kg <= 8 ? 5 : kg).join("+"); }
    catch (error) { parseError ||= error.message; }
  }
  const status = data.Siparis.toLocaleLowerCase("tr-TR");
  const missing = [];
  if (status === "evet") data.Siparis = "Evet";
  else if (status === "hayır" || status === "hayir") data.Siparis = "Hayır";
  else { data.Siparis = "Hayır"; parseError ||= "Siparis alanı Evet veya Hayır olmalı"; }
  if (!data.musteri_ad_soyad) missing.push("müşteri adı");
  if (!data.musteri_telefon) missing.push(inputPhone ? "geçersiz müşteri telefonu" : "müşteri telefonu");
  if (!data.urunler.length) missing.push("ürün bilgisi");
  if (!data.toplam) missing.push("fiyat");
  if (missing.length) {
    data.Siparis = "Hayır";
    const reason = "Eksik bilgi – " + missing.join(", ");
    data.sistem_notu = [data.sistem_notu,reason].filter(Boolean).join("\n");
  }
  if (!data.odeme_yontemi) data.odeme_yontemi = "Belirtilmemiş";
  data.teknik_hata = Boolean(parseError);
  data.teknik_hata_detay = parseError;
  if (parseError) {
    data.Siparis = "Hayır";
    data.sistem_notu = "AI çıktısı işlenemedi – " + parseError;
  }
  return {json:data,pairedItem:{item:index}};
});