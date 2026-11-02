"""Controlled browser time verifies bounded automatic reads, idle suspension and retry backoff."""
import asyncio,json,datetime
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=await b.new_page();await page.clock.install(time=datetime.datetime(2026,11,2,3,0,tzinfo=datetime.timezone.utc));errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.goto('http://127.0.0.1:8876')
  await page.evaluate('''()=>{cloudSession={familyCode:'TEST',role:'parent',token:'test'};const s=seed();normalizePets();s.pets=state.pets;s.pet=state.pet;s.activePetId=state.activePetId;s.partners=state.partners;window.__snapshot={state:s,version:1,serverTime:Date.now(),assetUrls:{}};cloudAccept(__snapshot);window.__reads=0;window.__fail=false;window.__quota=false;}''')
  async def state_route(route):
   mode=await page.evaluate('()=>{__reads++;return {fail:__fail,quota:__quota,snapshot:{...__snapshot,serverTime:Date.now()}};}')
   await route.fulfill(status=503 if mode['fail'] or mode['quota'] else 200,content_type='application/json',body=json.dumps({'message':'Function is Unavailable, AvailableStatus = InsufficientBalance'} if mode['quota'] else {'error':'临时不可用'} if mode['fail'] else mode['snapshot']))
  await page.route('**/api/dva/state',state_route)
  async def settle():
   for _ in range(80):
    if not await page.evaluate('cloudBusy'):return
    await asyncio.sleep(.025)
   raise AssertionError('Sync did not finish')
  await page.clock.run_for(119000);assert await page.evaluate('__reads')==0
  await page.clock.run_for(1000);await settle();assert await page.evaluate('__reads')==1
  await page.clock.run_for(3600000);await settle();assert await page.evaluate('__reads')==1
  # Returning after idle schedules just one request; duplicate focus/visibility events coalesce.
  await page.evaluate("cloudNoteActivity();window.dispatchEvent(new Event('focus'));document.dispatchEvent(new Event('visibilitychange'))");await page.clock.run_for(2000);await settle();assert await page.evaluate('__reads')==2
  # Hidden and offline pages do not poll even with recent user activity.
  await page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))");await page.clock.run_for(240000);assert await page.evaluate('__reads')==2
  await page.evaluate("Object.defineProperty(document,'hidden',{value:false,configurable:true});Object.defineProperty(navigator,'onLine',{value:false,configurable:true});cloudNoteActivity();cloudScheduleSync()");await page.clock.run_for(240000);assert await page.evaluate('__reads')==2
  await page.evaluate("Object.defineProperty(navigator,'onLine',{value:true,configurable:true});__fail=true;cloudNoteActivity();cloudScheduleSync()");await page.clock.run_for(2000);await settle();assert await page.evaluate('__reads')==3;assert 235000<=await page.evaluate('cloudRetryAt-Date.now()')<=240000
  await page.clock.run_for(120000);await page.evaluate('cloudNoteActivity()');await page.clock.run_for(119000);assert await page.evaluate('__reads')==3;await page.clock.run_for(1000);await settle();assert await page.evaluate('__reads')==4;assert 475000<=await page.evaluate('cloudRetryAt-Date.now()')<=480000
  # Explicit refresh is immediate and resets backoff on recovery.
  await page.evaluate('__fail=false');await page.evaluate('cloudPull(true)');assert await page.evaluate('__reads')==5;assert await page.evaluate('cloudSyncFailures')==0
  await page.evaluate('__quota=true');await page.evaluate('cloudPull(true)');assert await page.evaluate('cloudQuotaPaused');await page.clock.run_for(3600000);await page.evaluate('cloudNoteActivity()');await page.clock.run_for(2000);assert await page.evaluate('__reads')==6
  await page.evaluate('__quota=false');await page.evaluate('cloudPull(true)');assert not await page.evaluate('cloudQuotaPaused');assert not errors,errors
  print(json.dumps({'twoMinuteReads':True,'idleStops':True,'hiddenAndOfflineStop':True,'eventsCoalesced':True,'backoff4Then8Minutes':True,'manualRefreshImmediate':True,'quotaStopsAutomaticRetries':True,'errors':errors}));await b.close()
asyncio.run(main())
