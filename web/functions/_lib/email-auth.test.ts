import {describe,it,expect} from "vitest";
import {PBKDF2_ITERATIONS,derive,validEmail,validPassword,canonicalEmail} from "./email-auth";

describe("APEX public signup hashing runtime compatibility",()=>{
 it("does not exceed the Cloudflare production PBKDF2 limit",()=>{
   expect(PBKDF2_ITERATIONS).toBe(100000);
 });
 it("generates consistent salted password digests and separates users",async()=>{
   const saltA=new Uint8Array(16).fill(1),saltB=new Uint8Array(16).fill(2);
   const a=await derive("SafeTestPassword-123!",saltA);
   expect(a).toHaveLength(64);
   expect(await derive("SafeTestPassword-123!",saltA)).toEqual(a);
   expect(await derive("SafeTestPassword-123!",saltB)).not.toEqual(a);
   expect(await derive("AnotherTestPassword-456!",saltA)).not.toEqual(a);
 });
 it("accepts independently registered Gmail addresses, not owner Cloudflare logins",()=>{
   expect(validEmail(canonicalEmail("USER.Name@GMAIL.COM"))).toBe(true);
   expect(validPassword("12characters!")).toBe(true);
   expect(validPassword("short")).toBe(false);
 });
});
