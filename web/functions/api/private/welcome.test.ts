import {describe,it,expect} from "vitest";
import {onRequest} from "./[[path]]";
import type {Env} from "../../_lib/security";

describe("Legacy welcome link",()=>{
 it("redirects unsigned-in visitors to the account form without exposing a 401 JSON error",async()=>{
  const request=new Request("https://apex-crypto-ai-council.pages.dev/api/private/welcome");
  const response=await onRequest({request,env:{} as Env});
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("https://apex-crypto-ai-council.pages.dev/?view=console#account-access");
 });
 it("does not provide any access to protected private account resources",async()=>{
  const request=new Request("https://apex-crypto-ai-council.pages.dev/api/private/me");
  const response=await onRequest({request,env:{} as Env});
  expect(response.status).toBe(503);
 });
});
