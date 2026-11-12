/**
 * Email/password identity for public APEX users. Never accepts an identity
 * supplied by the browser. Passwords and raw session tokens are not stored.
 */
import type { CouncilDatabase, Env, Identity } from "./security";

const enc=new TextEncoder();
const bytesToHex=(v:Uint8Array)=>Array.from(v,x=>x.toString(16).padStart(2,"0")).join("");
const fromHex=(value:string)=>new Uint8Array(value.match(/.{2}/g)?.map(v=>parseInt(v,16))??[]);
const random=(size:number)=>crypto.getRandomValues(new Uint8Array(size));
const digest=async(value:string)=>bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value))));
export const validEmail=(value:unknown):value is string=>typeof value==="string"&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validPassword=(value:unknown):value is string=>typeof value==="string"&&value.length>=12&&value.length<=128;
export const canonicalEmail=(value:string)=>value.trim().toLowerCase();

// Cloudflare production Workers enforce a 100,000-iteration ceiling per PBKDF2 call.
// Do not raise this above the runtime limit. Upgrade to stronger KDF infrastructure
// before treating public account authentication as production hardened.
export const PBKDF2_ITERATIONS=100000;
export async function derive(password:string,salt:Uint8Array){
 const key=await crypto.subtle.importKey("raw",enc.encode(password),"PBKDF2",false,["deriveBits"]);
 const hash=await crypto.subtle.deriveBits({name:"PBKDF2",salt:salt.buffer as ArrayBuffer,iterations:PBKDF2_ITERATIONS,hash:"SHA-256"},key,256);
 return bytesToHex(new Uint8Array(hash));
}
const parseToken=(req:Request)=>req.headers.get("cookie")?.match(/(?:^|;\s*)apex_session=([a-f0-9]{64})(?:;|$)/)?.[1]||null;
export const sessionCookie=(token:string,maxAge=604800)=>`apex_session=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export async function identifySession(request:Request,env:Env):Promise<Identity|null>{
 if(!env.APEX_USERS_DB)return null;
 const token=parseToken(request);
 if(!token)return null;
 const row=await env.APEX_USERS_DB.prepare(
  "SELECT u.id,u.email FROM council_auth_sessions s JOIN council_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"
 ).bind(await digest(token),Date.now()).first<Identity>();
 return row&&validEmail(row.email)?row:null;
}
export async function issueSession(db:CouncilDatabase,userId:string){
 const token=bytesToHex(random(32)),hash=await digest(token),now=Date.now();
 await db.prepare("INSERT INTO council_auth_sessions(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)")
  .bind(hash,userId,now,now+604800000).run();
 return sessionCookie(token);
}
export async function revokeSession(req:Request,db:CouncilDatabase){
 const token=parseToken(req);
 if(token)await db.prepare("DELETE FROM council_auth_sessions WHERE token_hash=?").bind(await digest(token)).run();
}
export async function rateLimit(db:CouncilDatabase,request:Request,scope:string,max:number,periodMs:number){
 const ip=request.headers.get("CF-Connecting-IP")||"unknown";
 const key=await digest(scope+":"+ip),bucket=Math.floor(Date.now()/periodMs);
 await db.prepare("INSERT INTO council_auth_rate(key,bucket,count) VALUES(?,?,1) ON CONFLICT(key,bucket) DO UPDATE SET count=count+1").bind(key,bucket).run();
 const row=await db.prepare("SELECT count FROM council_auth_rate WHERE key=? AND bucket=?").bind(key,bucket).first<{count:number}>();
 return (row?.count??max+1)<=max;
}
export async function register(db:CouncilDatabase,email:string,password:string){
 const id=crypto.randomUUID(),salt=random(16),hash=await derive(password,salt),now=Date.now();
 await db.prepare("INSERT INTO council_users(id,email,created_at,last_seen_at) VALUES(?,?,?,?)")
  .bind(id,email,now,now).run();
 await db.prepare("INSERT INTO council_auth_passwords(user_id,password_hash,password_salt,created_at) VALUES(?,?,?,?)")
  .bind(id,hash,bytesToHex(salt),now).run();
 return {id,email};
}
export async function login(db:CouncilDatabase,email:string,password:string):Promise<Identity|null>{
 const row=await db.prepare(
  "SELECT u.id,u.email,p.password_hash,p.password_salt FROM council_users u JOIN council_auth_passwords p ON p.user_id=u.id WHERE u.email=?"
 ).bind(email).first<{id:string;email:string;password_hash:string;password_salt:string}>();
 // Do the same expensive derivation for unknown users to limit email enumeration.
 const computed=await derive(password,row?fromHex(row.password_salt):random(16));
 if(!row||row.password_hash!==computed)return null;
 return {id:row.id,email:row.email};
}
