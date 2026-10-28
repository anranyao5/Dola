"""Regression: embedded catalogue images never consume browser localStorage quota."""
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  page=await b.new_page();await page.goto('http://127.0.0.1:8876');page.on('dialog',lambda d:asyncio.create_task(d.accept()))
  await page.select_option('#cloudLogin [name=mode]','create');await page.fill('#cloudLogin [name=password]','cache-test-password');await page.fill('#cloudLogin [name=childPassword]','123456');await page.click('#cloudLogin button');await page.wait_for_selector('#cloudBar:visible')
  result=await page.evaluate('''()=>{
   const raw=JSON.stringify(state).length,small=localStorage.getItem(KEY);
   if(raw<1000000||small.length>100000||small.includes('data:image'))throw Error('Image cache was not compacted');
   localStorage.setItem('dola-family-growth-v1','preserved-demo');
   const original=Storage.prototype.setItem;let failures=0;
   Storage.prototype.setItem=function(k,v){if(k===KEY){failures++;throw new DOMException('Quota exceeded','QuotaExceededError');}return original.call(this,k,v);};
   cloudCacheEnabled=true;
   if(!persist()||!persist()||failures!==1)throw Error('Cloud saves depend on optional browser cache');
   Storage.prototype.setItem=original;
   if(localStorage.getItem('dola-family-growth-v1')!=='preserved-demo')throw Error('Old demo data changed');
   if(!cloudReady)throw Error('Cloud session lost');
   return {hydratedBytes:raw,cacheBytes:small.length,quotaFailureDoesNotBlock:true,originalDemoPreserved:true};
  }''')
  print(json.dumps(result));await b.close()
asyncio.run(main())
