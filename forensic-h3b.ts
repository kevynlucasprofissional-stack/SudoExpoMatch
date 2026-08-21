const GW="https://connector-gateway.lovable.dev/apify";
const H={ "content-type":"application/json", Authorization:`Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key":process.env["APIFY_API_KEY"]! };
for(let i=0;i<3;i++){
  const t0=Date.now();
  const res=await fetch(`${GW}/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=45&maxItems=1`,{method:"POST",headers:H,body:JSON.stringify({usernames:["acirvoficial"],resultsLimit:12})});
  const j:any=await res.json().catch(()=>null);
  const it=j?.[0]??{};
  console.log(i,res.status,Date.now()-t0+"ms","posts="+(Array.isArray(it.latestPosts)?it.latestPosts.length:"n/a"),"bio="+((it.biography||"").length),"keys="+Object.keys(it).length);
}
