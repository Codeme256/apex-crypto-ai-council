import {respond,checkOrigin,readJson,type Env} from "../../_lib/security";
import {canonicalEmail,validEmail,validPassword,register,login,rateLimit,issueSession,identifySession,revokeSession,sessionCookie} from "../../_lib/email-auth";
type Ctx={request:Request;env:Env};
export async function onRequest({request,env}:Ctx):Promise<Response>{
 if(!env.APEX_USERS_DB)return respond({error:"Account database is not configured"},503);
 const url=new URL(request.url);
 const path=url.pathname.replace(/^\/api\/auth\/?/,"").replace(/\/$/,"");
 if(!["GET","POST"].includes(request.method))return respond({error:"Method not allowed"},405);
 if(request.method==="POST"&&!checkOrigin(request))return respond({error:"Invalid request origin"},403);
 const db=env.APEX_USERS_DB;
 try{
  if(path==="health"&&request.method==="GET"){
    const checks:{database:boolean;random:boolean;passwordDerivation:boolean}={database:false,random:false,passwordDerivation:false};
    try{
      await db.prepare("SELECT COUNT(*) AS count FROM council_users").first();
      checks.database=true;
    }catch(e){console.error("Auth health database error",e instanceof Error?e.name:"unknown");}
    try{
      const salt=crypto.getRandomValues(new Uint8Array(16));
      checks.random=!!crypto.randomUUID()&&salt.length===16;
      const key=await crypto.subtle.importKey("raw",new TextEncoder().encode("health-test-password-not-a-user"),"PBKDF2",false,["deriveBits"]);
      const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:310000,hash:"SHA-256"},key,256);
      checks.passwordDerivation=bits.byteLength===32;
    }catch(e){console.error("Auth health crypto error",e instanceof Error?e.name:"unknown");}
    return respond({ready:Object.values(checks).every(Boolean),checks},Object.values(checks).every(Boolean)?200:503);
  }
  if(path==="me"&&request.method==="GET"){
   const who=await identifySession(request,env);
   return who?respond({user:who}):respond({error:"Sign in required"},401);
  }
  if(path==="logout"&&request.method==="POST"){
   await revokeSession(request,db);
   const response=respond({ok:true});
   response.headers.set("set-cookie",sessionCookie("",0));
   return response;
  }
  if((path==="register"||path==="login")&&request.method==="POST"){
   if(!await rateLimit(db,request,path,path==="register"?5:12,path==="register"?3600000:900000))
    return respond({error:"Too many attempts. Try again later."},429);
   const data=await readJson(request,2000);
   const email=typeof data.email==="string"?canonicalEmail(data.email):"";
   const password=data.password;
   if(!validEmail(email)||!validPassword(password))return respond({error:"Enter a valid email and a password of 12–128 characters"},400);
   let user:{id:string;email:string}|null;
   if(path==="register"){
    const already=await db.prepare("SELECT id FROM council_users WHERE email=?").bind(email).first();
    if(already)return respond({error:"Email already registered. Please sign in."},409);
    user=await register(db,email,password);
   }else{
    user=await login(db,email,password);
    if(!user)return respond({error:"Invalid email or password"},401);
   }
   const cookie=await issueSession(db,user.id);
   const response=respond({user,registered:path==="register"},path==="register"?201:200);
   response.headers.set("set-cookie",cookie);
   return response;
  }
  return respond({error:"Not found"},404);
 }catch(e){
  if(String(e).includes("UNIQUE"))return respond({error:"Email already registered"},409);
  console.error("Authentication failed",e instanceof Error?e.message:"unknown");
  return respond({error:"Account service unavailable"},503);
 }
}
