import {identifySession} from "./email-auth";
import { createRemoteJWKSet, jwtVerify } from "jose";
export interface CouncilDatabase {
 prepare(sql:string):{bind(...args:unknown[]):{first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<{meta?:{changes?:number}}>;all<T=Record<string,unknown>>():Promise<{results?:T[]}>};first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<unknown>};
}
export type Env={
 APEX_USERS_DB?:CouncilDatabase;
 ACCESS_TEAM_DOMAIN?:string; ACCESS_AUD?:string; CREDENTIAL_ENCRYPTION_KEY?:string; MARKET_SYMBOLS?:string;
};
export type Identity={id:string;email:string};
const encoder=new TextEncoder();
export const respond=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store","x-content-type-options":"nosniff","referrer-policy":"no-referrer"}});
export function checkOrigin(req:Request):boolean{
 const origin=req.headers.get("origin"),expected=new URL(req.url).origin;
 return origin===expected&&req.headers.get("content-type")?.toLowerCase().startsWith("application/json")===true;
}
export async function identity(req:Request,env:Env):Promise<Identity|null>{return identifySession(req,env);}

function b64ToBytes(value:string):Uint8Array{
 const bin=atob(value);return Uint8Array.from(bin,c=>c.charCodeAt(0));
}
function bytesToB64(bytes:Uint8Array):string{
 let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s);
}
async function cipherKey(env:Env){
 if(!env.CREDENTIAL_ENCRYPTION_KEY)return null;
 let raw:Uint8Array;
 try{raw=b64ToBytes(env.CREDENTIAL_ENCRYPTION_KEY);}catch{return null;}
 if(raw.byteLength!==32)return null;
 return crypto.subtle.importKey("raw",raw.buffer as ArrayBuffer,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
export async function cryptoReady(env:Env){return Boolean(await cipherKey(env));}
export async function encrypt(env:Env,userId:string,plaintext:string,scope:"testnet"|"live-spot"="testnet"):Promise<string>{
 const key=await cipherKey(env);if(!key)throw Error("Credential encryption is not configured");
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:"AES-GCM",iv:iv.buffer as ArrayBuffer,additionalData:encoder.encode("apex-"+scope+":"+userId)},key,encoder.encode(plaintext)));
 return "v1:"+bytesToB64(iv)+":"+bytesToB64(ciphertext);
}
export async function decrypt(env:Env,userId:string,ciphertext:string,scope:"testnet"|"live-spot"="testnet"):Promise<string>{
 const key=await cipherKey(env);if(!key)throw Error("Credential encryption is not configured");
 const [version,nonce,data]=ciphertext.split(":");if(version!=="v1"||!nonce||!data)throw Error("Unknown encryption record");
 const iv=b64ToBytes(nonce),bytes=b64ToBytes(data);
 if(iv.length!==12)throw Error("Invalid encrypted record");
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:iv.buffer as ArrayBuffer,additionalData:encoder.encode("apex-testnet:"+userId)},key,bytes.buffer as ArrayBuffer);
 return new TextDecoder().decode(plain);
}
export async function ensureUser(db:CouncilDatabase,who:Identity,now:number){
 // Independent account and zero shared global Binance key.
 await db.prepare("INSERT OR IGNORE INTO council_users(id,email,created_at,last_seen_at) VALUES(?,?,?,?)").bind(who.id,who.email,now,now).run();
 const row=await db.prepare("SELECT id,email FROM council_users WHERE id=?").bind(who.id).first<{id:string;email:string}>();
 if(!row)throw Error("Identity cannot be enrolled");
 if(row.email!==who.email)await db.prepare("UPDATE council_users SET email=?,last_seen_at=? WHERE id=?").bind(who.email,now,who.id).run();
 return who;
}
export async function readJson(req:Request,max=4096):Promise<Record<string,unknown>>{
 const body=await req.text();if(body.length>max)throw Error("Request exceeds allowed size");
 const obj=JSON.parse(body);
 if(!obj||typeof obj!=="object"||Array.isArray(obj))throw Error("Invalid JSON object");
 return obj;
}
