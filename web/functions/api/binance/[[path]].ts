/** Deprecated single-user Binance endpoint.
 * Public multi-user accounts must never share server-wide Testnet credentials.
 * Every authenticated request now uses /api/private/binance/* and a verified
 * Cloudflare Access identity with user-scoped encrypted keys.
 */
export async function onRequest():Promise<Response>{
 return new Response(JSON.stringify({error:"Legacy single-user connector is disabled. Sign in and use your individual Spot Testnet account via /api/private/binance.",code:"MULTI_USER_MIGRATION_REQUIRED"}),{
  status:410,headers:{"content-type":"application/json","cache-control":"no-store","x-content-type-options":"nosniff"}
 });
}
