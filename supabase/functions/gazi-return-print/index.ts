const SUPABASE_URL=Deno.env.get("SUPABASE_URL")!;
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers={"Content-Type":"application/json; charset=utf-8","Access-Control-Allow-Origin":"https://gazi.ozkanceylan.uk","Vary":"Origin","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"};
Deno.serve(async(req:Request)=>{
 const fail=()=>new Response("İade fişi doğrulanamadı.",{status:404,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store"}});
 try{
  if(req.method!=="GET")return fail();
  const url=new URL(req.url),ref=url.searchParams.get("ref")||"",token=url.searchParams.get("rtnid")||"";
  if(!/^(?:GZI-\d+|AKH\d+)-R\d+$/.test(ref)||!/^[A-Za-z0-9]{8,80}$/.test(token))return fail();
  // The existing DHL label's unguessable token is required and matched to its saved reference.
  const query=new URLSearchParams({select:"reference_id,label_url",reference_id:"eq."+ref,status:"eq.ready",limit:"2"});
  const db=await fetch(SUPABASE_URL+"/rest/v1/gazi_iade_islemleri?"+query,{headers:{apikey:SERVICE,Authorization:"Bearer "+SERVICE},signal:AbortSignal.timeout(15000)});
  if(!db.ok)return fail();
  const rows=await db.json();
  if(!Array.isArray(rows)||rows.length!==1)return fail();
  const saved=new URL(rows[0].label_url);
  if(saved.protocol!=="https:"||saved.hostname!=="mn.tc"||saved.username||saved.password||saved.port||saved.pathname!=="/"||saved.searchParams.get("rtnid")!==token)return fail();
  const dhl=await fetch("https://mn.tc?rtnid="+encodeURIComponent(token),{redirect:"error",signal:AbortSignal.timeout(20000)});
  if(!dhl.ok)return fail();
  const html=await dhl.text();
  if(html.length>2000000)return fail();
  const encoded=html.match(/src\s*=\s*['"]data:image\/png;base64,\s*([A-Za-z0-9+/=\s]+)['"]/i)?.[1]?.replace(/\s/g,"");
  if(!encoded||!encoded.startsWith("iVBORw0KGgo"))return fail();
  return new Response(JSON.stringify({reference:ref,image:"data:image/png;base64,"+encoded}),{headers});
 }catch{return fail();}
});