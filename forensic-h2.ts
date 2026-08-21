import { mapApifyItemToContext } from "@/lib/instagram-provider.server";
const GW="https://connector-gateway.lovable.dev/apify";
const H={ "content-type":"application/json", Authorization:`Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key":process.env["APIFY_API_KEY"]! };
for(const handle of ["burgerking","nubank"]){
  const res=await fetch(`${GW}/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=45&maxItems=1`,{method:"POST",headers:H,body:JSON.stringify({usernames:[handle],resultsLimit:12})});
  const json:any=await res.json();
  const it=json[0];
  const raw=(it.latestPosts||[]).length;
  const ctx=mapApifyItemToContext(it,handle);
  console.log(JSON.stringify({handle,rawLatestPostsCount:raw,ctxNull:ctx===null,mappedRecentMediaCount:ctx?.recentMedia?.length??0,captionsPresentCount:(ctx?.recentMedia??[]).filter(m=>m.caption).length,mediaTypes:[...new Set((ctx?.recentMedia??[]).map(m=>m.mediaType))],keywords:ctx?.keywords.length,signals:ctx?.signals.length,bioLen:ctx?.bio?.length??0,category:ctx?.category??null}));
}
