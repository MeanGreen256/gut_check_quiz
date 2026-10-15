import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { readFile, mkdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
const gut=JSON.parse(await readFile('package.json','utf8')).name.includes('gut');
let browser;const servers=[];
async function start(enabled){
 const reservation=createServer();reservation.listen(0,'127.0.0.1');await once(reservation,'listening');const port=reservation.address().port;await new Promise(r=>reservation.close(r));
 const env={...process.env,NEXT_TELEMETRY_DISABLED:'1'};
 for(const k of Object.keys(env))if(/^(CONTACT_|CONVERTKIT_|ANTHROPIC_)/.test(k))delete env[k];
 if(enabled)Object.assign(env,{CONTACT_CAPTURE_APPROVED:'true',CONTACT_REGISTER_URL:'https://register.example.test/api/contact-register/capture',CONTACT_REGISTER_TOKEN:'synthetic-write-only-token-for-tests-never-production',CONTACT_CAPTURE_ORIGIN:'https://tool.example.test',CONTACT_CAPTURE_PRIVACY_URL:'https://example.test/privacy',CONTACT_CAPTURE_DISCLOSURE:'Synthetic central capture disclosure. Not a published privacy policy.',CONTACT_CAPTURE_NOTICE_VERSION:'fixture-v1',CONTACT_CAPTURE_ISOLATED_PREVIEW:'true'});
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p',String(port)],{env,stdio:['ignore','pipe','pipe']});servers.push(server);let output='';server.stdout.on('data',c=>output+=c);server.stderr.on('data',c=>output+=c);
 const origin=`http://127.0.0.1:${port}`;
 for(let i=0;i<100;i++){if(server.exitCode!==null)throw new Error(output);try{if((await fetch(origin)).ok)return origin;}catch{}await delay(100);}throw new Error('Local server did not start');
}
let disabledOrigin,enabledOrigin;
before(async()=>{disabledOrigin=await start(false);enabledOrigin=await start(true);browser=await chromium.launch({headless:true,...(process.env.CONTACTS_CHROME_PATH?{executablePath:process.env.CONTACTS_CHROME_PATH}:{})});});
after(async()=>{await browser?.close();for(const server of servers){if(server.exitCode!==null)continue;const done=once(server,'exit');server.kill('SIGTERM');const timer=setTimeout(()=>server.kill('SIGKILL'),5000);await done;clearTimeout(timer);}});
async function pageAt(origin,width=390){const context=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});await context.route('**/*',route=>route.request().url().startsWith(origin)?route.continue():route.abort());const page=await context.newPage();await page.goto(origin);return {context,page};}
async function lead(page){
 if(gut){await page.getByRole('button',{name:/Start the check/}).click();for(let i=0;i<10;i++){await page.locator('.answer').first().click();}await page.getByLabel('First name',{exact:true}).fill('Synthetic');await page.getByLabel('Email',{exact:true}).fill('synthetic@example.test');}
 else{await page.getByRole('button',{name:/Type 1 Diabetes/}).click();for(let i=0;i<10;i++){await page.locator('button[aria-pressed]').first().click();await page.getByRole('button',{name:i===9?'See My Results':'Next',exact:true}).click();}await page.getByLabel('First Name',{exact:true}).fill('Synthetic');await page.getByLabel('Email Address',{exact:true}).fill('synthetic@example.test');}
}
const continueButton=page=>page.getByRole('button',{name:gut?/Show my results/:'Get My Results'});
const result=page=>gut?page.getByText('Your 3 next steps',{exact:true}):page.getByText('Your Next Steps:',{exact:true});
function mockOtherApis(page,counts){return page.route('**/api/**',route=>{const path=new URL(route.request().url()).pathname;if(path==='/api/contact-capture')return route.fallback();if(path==='/api/subscribe')counts.subscriptions++;return route.fulfill({status:503,json:{error:'Synthetic unavailable provider'}});});}
test('actual local production-mode build preserves public flow when unconfigured',async()=>{
 const response=await fetch(`${disabledOrigin}/api/contact-capture`,{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(response.status,503);
 const {context,page}=await pageAt(disabledOrigin);const counts={subscriptions:0};let captures=0;
 try{await mockOtherApis(page,counts);await page.route('**/api/contact-capture',route=>{captures++;return route.abort();});await lead(page);await expect(page.locator('#central-capture-notice')).toHaveCount(0);await continueButton(page).click();await expect(result(page)).toBeVisible();assert.equal(captures,0);assert.equal(counts.subscriptions,gut?0:1);}finally{await context.close();}
});
test('enabled mobile/desktop form captures separately, retries safely and preserves newsletter behavior',async()=>{
 for(const width of [320,390,1280]){
 const {context,page}=await pageAt(enabledOrigin,width);const counts={subscriptions:0};const captures=[];
 try{await mockOtherApis(page,counts);await page.route('**/api/contact-capture',route=>{captures.push(route.request().postDataJSON());return captures.length===1?route.fulfill({status:503,json:{error:'Synthetic capture failure. Retry.'}}):route.fulfill({json:{captured:true}});});
 await lead(page);await expect(page.locator('#central-capture-notice')).toContainText('Synthetic central');
 if(gut&&width===390)await page.getByRole('checkbox').check();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const email=page.getByLabel(gut?'Email':'Email Address',{exact:true});await email.focus();await page.keyboard.press('Tab');await expect(page.getByRole('link',{name:/Privacy information/})).toBeFocused();
 if(process.env.CONTACTS_EVIDENCE_DIR){await mkdir(process.env.CONTACTS_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:`${process.env.CONTACTS_EVIDENCE_DIR}/${gut?'gut':'diabetes'}-${width}.png`,fullPage:true});}
 await continueButton(page).click();await expect(page.getByRole('alert').filter({hasText:'Synthetic capture failure'})).toContainText('Synthetic capture failure');assert.equal(counts.subscriptions,0);
 await continueButton(page).click();await expect(result(page)).toBeVisible();assert.deepEqual(captures[0],captures[1]);assert.deepEqual(Object.keys(captures[0]).sort(),['email','noticeVersion','requestId']);assert.equal(counts.subscriptions,gut?(width===390?1:0):1);
 }finally{await context.close();}}
});
test('direct results shortcut cannot skip approved capture and reload/back remains usable',async()=>{
 const {context,page}=await pageAt(enabledOrigin);try{await page.goto(enabledOrigin+'/?dev=results&type=thriving');await expect(page.getByRole('button',{name:gut?/Start the check/:/Type 1 Diabetes/})).toBeVisible();await page.reload();await expect(page.getByRole('button',{name:gut?/Start the check/:/Type 1 Diabetes/})).toBeVisible();await page.goto(enabledOrigin+'/missing-fixture');await page.goBack();await expect(page.getByRole('button',{name:gut?/Start the check/:/Type 1 Diabetes/})).toBeVisible();}finally{await context.close();}
});
