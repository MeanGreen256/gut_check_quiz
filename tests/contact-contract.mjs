import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCaptureConfig, publicCaptureConfig, parseCapture, captureContact, createCaptureRoute, normalizeEmail } from '../server/contact-register.mjs';
export const env = { CONTACT_CAPTURE_APPROVED:'true', CONTACT_REGISTER_URL:'https://register.example.test/api/contact-register/capture',CONTACT_REGISTER_TOKEN:'synthetic-write-only-token-for-tests-never-production',CONTACT_CAPTURE_ORIGIN:'https://tool.example.test',CONTACT_CAPTURE_PRIVACY_URL:'https://example.test/privacy',CONTACT_CAPTURE_DISCLOSURE:'Synthetic fixture notice, not an approved policy.',CONTACT_CAPTURE_NOTICE_VERSION:'fixture-v1' };
const body={email:'synthetic@example.test',requestId:'c7cd8eb7-c4ad-41da-9918-2eae721824de',noticeVersion:'fixture-v1'};
const request=(value=body,headers={})=>new Request('https://tool.example.test/api/contact-capture',{method:'POST',headers:{origin:env.CONTACT_CAPTURE_ORIGIN,'content-type':'application/json',...headers},body:JSON.stringify(value)});
test('unconfigured, partial, unapproved and nonisolated capture remains off without upstream calls',async()=>{
  assert.ok(readCaptureConfig(env));
  for(const key of Object.keys(env)) {const partial={...env,[key]:''};assert.equal(publicCaptureConfig(partial),null);assert.equal((await createCaptureRoute({env:partial,fetcher:()=>assert.fail('upstream')})(request())).status,503);}
  assert.equal(readCaptureConfig({...env,VERCEL_ENV:'preview'}),null);assert.ok(readCaptureConfig({...env,VERCEL_ENV:'preview',CONTACT_CAPTURE_ISOLATED_PREVIEW:'true'}));
});
test('only the approved notice is public; endpoint credentials and source stay on server',()=>{
  assert.deepEqual(Object.keys(publicCaptureConfig(env)).sort(),['disclosure','noticeVersion','privacyUrl']);
  for(const patch of [{CONTACT_REGISTER_URL:'https://other.example.test/other'},{CONTACT_REGISTER_URL:env.CONTACT_REGISTER_URL+'?secret=bad'},{CONTACT_CAPTURE_ORIGIN:'http://tool.example.test'},{CONTACT_REGISTER_TOKEN:'short'}])assert.equal(readCaptureConfig({...env,...patch}),null);
});
test('normalization matches register syntax and preserves distinct local parts',()=>{
  assert.equal(normalizeEmail(' Ab+c@EXAMPLE.TEST '),'Ab+c@example.test');
  for(const bad of ['example.test','a@b.123','a@@example.test','a\nb@example.test','.a@example.test'])assert.equal(normalizeEmail(bad),null);
});
test('validation rejects health/source/consent fields, stale notice and invalid UUID',()=>{
  for(const key of ['name','source','tenant','score','answers','marketingConsent','verified'])assert.throws(()=>parseCapture({...body,[key]:'forged'},readCaptureConfig(env)));
  assert.throws(()=>parseCapture({...body,noticeVersion:'old'},readCaptureConfig(env)),e=>e.status===409);
  assert.throws(()=>parseCapture({...body,requestId:'bad'},readCaptureConfig(env)),e=>e.status===400);
});
test('server forwards only contract fields with bearer auth, timeout and no redirects',async()=>{
  let saved;
  await captureContact(readCaptureConfig(env),body,async(url,options)=>{saved={url,options};return Response.json({captured:true});});
  assert.equal(saved.url,env.CONTACT_REGISTER_URL);assert.equal(saved.options.redirect,'error');assert.equal(saved.options.headers.Authorization,`Bearer ${env.CONTACT_REGISTER_TOKEN}`);assert.equal(saved.options.headers.Origin,undefined);assert.deepEqual(JSON.parse(saved.options.body),body);assert.ok(saved.options.signal);
});
test('false/invalid success, auth rejection and network errors never claim capture or leak upstream details',async()=>{
  for(const fetcher of [async()=>Response.json({captured:false}),async()=>new Response('not json'),async()=>Response.json({error:'secret'},{status:401}),async()=>{throw new Error('private email secret');}]) {
    await assert.rejects(captureContact(readCaptureConfig(env),body,fetcher),error=>error.status===503&&!/secret|private email/.test(error.message));
  }
  for(const status of [409,429])await assert.rejects(captureContact(readCaptureConfig(env),body,async()=>Response.json({}, {status})),error=>error.status===status);
});
test('public proxy enforces origin, body bounds and contract before forwarding',async()=>{
  let calls=0;const route=createCaptureRoute({env,fetcher:async()=>{calls++;return Response.json({captured:true});}});
  assert.equal((await route(request(body,{origin:'https://other.example.test'}))).status,403);
  assert.equal((await route(request(body,{'content-type':'text/plain'}))).status,415);
  assert.equal((await route(request({...body,email:'x'.repeat(3000)}))).status,413);
  assert.equal((await route(request({...body,source:'other'}))).status,400);
  assert.equal(calls,0);
  const response=await route(request());assert.equal(response.status,200);assert.deepEqual(await response.json(),{captured:true});assert.match(response.headers.get('cache-control'),/no-store/);
});
test('per-process abuse cap is bounded and expires; retry identity is passed unchanged',async()=>{
  let time=0,calls=0;const route=createCaptureRoute({env,now:()=>time,fetcher:async(_url,options)=>{calls++;assert.deepEqual(JSON.parse(options.body),body);return Response.json({captured:true});}});
  for(let i=0;i<10;i++)assert.equal((await route(request())).status,200);
  assert.equal((await route(request())).status,429);assert.equal(calls,10);
  time=60001;assert.equal((await route(request())).status,200);
});
