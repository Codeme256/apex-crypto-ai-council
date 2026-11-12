import {describe,it,expect} from "vitest";
import {checkOrigin,encrypt,decrypt,cryptoReady,identity,type Env} from "./security";
const env:Env={CREDENTIAL_ENCRYPTION_KEY:btoa(String.fromCharCode(...new Uint8Array(32).fill(73)))};
describe("Multi-user account security",()=>{
 it("requires per-user encryption binding and rejects malformed keys",async()=>{
  expect(await cryptoReady(env)).toBe(true);
  expect(await cryptoReady({CREDENTIAL_ENCRYPTION_KEY:"invalid"})).toBe(false);
 });
 it("encrypts Testnet credentials with unique nonce and user-specific authenticated data",async()=>{
  const a=await encrypt(env,"user-a","private-testnet-secret");
  const b=await encrypt(env,"user-a","private-testnet-secret");
  expect(a).not.toEqual(b);
  expect(await decrypt(env,"user-a",a)).toBe("private-testnet-secret");
  await expect(decrypt(env,"user-b",a)).rejects.toThrow();
 });
 it("refuses cross-origin mutations and missing JSON content type",()=>{
  expect(checkOrigin(new Request("https://apex.example/api/private/paper/orders",{method:"POST",headers:{origin:"https://evil.example","content-type":"application/json"}}))).toBe(false);
  expect(checkOrigin(new Request("https://apex.example/api/private/paper/orders",{method:"POST",headers:{origin:"https://apex.example","content-type":"application/json"}}))).toBe(true);
  expect(checkOrigin(new Request("https://apex.example/api/private/paper/orders",{method:"POST",headers:{origin:"https://apex.example","content-type":"text/plain"}}))).toBe(false);
 });
 it("never accepts a client-provided user id without verified Access JWT and D1",async()=>{
  expect(await identity(new Request("https://apex.example/api/private/me",{headers:{"x-user-id":"admin","cf-access-jwt-assertion":"fake"}}),env)).toBeNull();
 });
});
