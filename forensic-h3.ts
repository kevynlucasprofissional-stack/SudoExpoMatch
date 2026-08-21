import { mapApifyItemToContext } from "@/lib/instagram-provider.server";
const GW="https://connector-gateway.lovable.dev/apify";
const H={ "content-type":"application/json", Authorization:`Bearer ${process.env["LOVABLE_API_KEY"]}`, "X-Connection-Api-Key":process.env["APIFY_API_KEY"]! };
for(const handle of ["acirvoficial","boticario"]){
  const res=await fetch(`${GW}/acts/apify~instagram-profile-scraper/run-sync-get-dataset-items?timeout=45&maxItems=1`,{method:"POST",headers:H,body:JSON.stringify({usernames:[handle],resultsLimit:12})});
  const json:any=await res.json();
  const it=json?.[0]??{};
  const lp=it.latestPosts;
  const ctx=mapApifyItemToContext(it,handle);
  console.log(JSON.stringify({handle,status:res.status,keys:Object.keys(it).length,private:it.private,postsCount:it.postsCount,latestPostsIsArray:Array.isArray(lp),rawPosts:Array.isArray(lp)?lp.length:0,mapped:ctx?.recentMedia?.length??0,captions:(ctx?.recentMedia??[]).filter(m=>m.caption).length,bioLen:ctx?.bio?.length??0,err:it.error??null}));
}
