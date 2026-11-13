import {identity,ensureUser,respond,type Env} from "../../../_lib/security";

type Ctx={request:Request;env:Env};
/**
 * Honest readiness status for the future automated execution service.
 * This endpoint neither starts the bot nor routes exchange orders.
 */
export async function onRequest({request,env}:Ctx):Promise<Response>{
 if(request.method!=="GET")return respond({error:"Method not allowed"},405);
 if(!env.APEX_USERS_DB)return respond({error:"Account database not configured"},503);
 const who=await identity(request,env);
 if(!who)return respond({error:"Sign in required"},401);
 try{
  await ensureUser(env.APEX_USERS_DB,who,Date.now());
  const [binance,bybit]=await Promise.all([
   env.APEX_USERS_DB.prepare("SELECT user_id FROM council_live_spot_credentials WHERE user_id=?")
    .bind(who.id).first<{user_id:string}>(),
   env.APEX_USERS_DB.prepare("SELECT user_id FROM council_bybit_live_credentials WHERE user_id=?")
    .bind(who.id).first<{user_id:string}>()
  ]);
  return respond({
   state:"NOT_DEPLOYED",
   enabled:false,ordersEnabled:false,runnerOnline:false,
   markets:["SPOT","FUTURES"],
   exchanges:{BINANCE:{readOnlyKeyStored:Boolean(binance)},BYBIT:{readOnlyKeyStored:Boolean(bybit)}},
   maxRiskPerTradePct:2,
   maxOrderNotionalPct:2,
   dailyLossLimitPct:2,
   weeklyLossLimitPct:5,
   maxTradesPerDay:6,
   stopAfterConsecutiveLosses:2,
   leverageCap:1,
   blockers:[
    "24/7 execution service has not passed production validation",
    "Read-only API credentials cannot place orders",
    "Spot and Futures order handling, protective stops and reconciliation require testing",
    "Separate explicit owner authorization is required before any real order"
   ],
   note:"No actual exchange order will be placed by this dashboard."
  });
 }catch(e){
  console.error("Automation readiness unavailable",e instanceof Error?e.name:"unknown");
  return respond({error:"Automation readiness cannot be verified; trading remains disabled"},503);
 }
}
