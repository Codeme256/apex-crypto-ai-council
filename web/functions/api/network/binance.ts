/**
 * Diagnostic probes use ONLY official Binance public /api/v3/time endpoints.
 * Never send API keys or secrets here. No account state is returned.
 */
const HOSTS=[
 "https://api.binance.com",
 "https://api-gcp.binance.com",
 "https://api1.binance.com",
 "https://api2.binance.com",
 "https://api3.binance.com",
 "https://api4.binance.com",
 "https://data-api.binance.vision"
] as const;
export async function onRequestGet():Promise<Response>{
 const results=await Promise.all(HOSTS.map(async host=>{
  try{
   const response=await fetch(host+"/api/v3/time",{method:"GET",redirect:"error",cache:"no-store",
     signal:AbortSignal.timeout(5500),headers:{accept:"application/json"}});
   let timeVerified=false;
   if(response.ok&&response.headers.get("content-type")?.includes("application/json")){
    const json=await response.json() as {serverTime?:number};
    timeVerified=typeof json.serverTime==="number"&&Number.isFinite(json.serverTime);
   }
   return {host,reachable:timeVerified,status:response.status};
  }catch(e){
   // Only the error name (AbortError, TypeError, etc.); never include full internal URLs or secrets.
   return {host,reachable:false,status:null,error:e instanceof Error?e.name:"Unavailable"};
  }
 }));
 return new Response(JSON.stringify({purpose:"public-network-diagnostic-only",checkedAt:Date.now(),
  accountApiStatus:"not tested; public connectivity does not imply signed-account permissions",
  hosts:results}),{status:200,headers:{"content-type":"application/json; charset=utf-8",
  "cache-control":"no-store","x-content-type-options":"nosniff"}});
}
