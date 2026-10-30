"""Read-only completion calendar derives days from real task status, never bonus flowers."""
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=await b.new_page(viewport={'width':1180,'height':900});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.goto('http://127.0.0.1:8876')
  await page.evaluate('''()=>{document.body.classList.remove('cloud-locked');$('#cloudAuth').hidden=true;cloudPull=async()=>{};dayOf=()=> '2026-10-30';completionCalendarMonth='2026-10';state=seed();normalizePets();state.tasks=[];
   for(const [day,flags] of [['2026-09-30',[true]],['2026-10-27',[true,true]],['2026-10-28',[true,false]],['2026-10-30',[false]],['2026-10-31',[false]]])for(const done of flags)state.tasks.push({...newTask(day,'语文','日历测试','checkin'),done});
   state.ledger=[{id:'parent:fixture',points:0,flowers:1,label:'家长奖励',source:'parent',day:'2026-10-29'}];setPage('growth');}''')
  assert await page.locator('#completedDayCount').inner_text()=='2';assert await page.locator('#monthCompletedCount').inner_text()=='本月完成 1 天'
  for day,css,label in [('27','complete','已完成'),('28','missed','未完成'),('29','neutral','无任务'),('30','progress','进行中'),('31','neutral','已安排')]:
   cell=page.locator('[data-calendar-day="2026-10-'+day+'"]');assert css in await cell.get_attribute('class');assert label in await cell.inner_text()
  await page.evaluate("state.tasks.find(t=>t.day==='2026-10-30').done=true;render()");assert await page.locator('#completedDayCount').inner_text()=='3';assert 'complete' in await page.locator('[data-calendar-day="2026-10-30"]').get_attribute('class')
  await page.click('#calendarPrevious');assert await page.locator('#completionCalendarMonth').inner_text()=='2026年9月';assert await page.locator('#completedDayCount').inner_text()=='3';await page.click('#calendarCurrent');assert await page.locator('#completionCalendarMonth').inner_text()=='2026年10月'
  await page.evaluate("completionCalendarMonth='2028-02';renderCompletionCalendar()");assert await page.locator('[data-calendar-day]').count()==29
  await page.evaluate("completionCalendarMonth='2027-01';renderCompletionCalendar()");await page.click('#calendarPrevious');assert await page.locator('#completionCalendarMonth').inner_text()=='2026年12月';await page.click('#calendarCurrent')
  for width in [1180,810,390]:
   await page.set_viewport_size({'width':width,'height':900});assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth');await page.locator('.completion-calendar').screenshot(path='preview/completion-calendar-'+str(width)+'.png')
  assert not errors,errors;print(json.dumps({'completedDays':True,'pastIncompleteOrange':True,'noTasksNotMissed':True,'todayPendingNotMissed':True,'bonusDoesNotCountAsCompletedDay':True,'monthNavigationAndLeapYear':True,'responsive':True,'errors':errors}));await b.close()
asyncio.run(main())
