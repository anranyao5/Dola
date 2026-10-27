"""Two separate browser stores + real HTTP API + PostgreSQL harness.
Run local-server.js first; no production credentials or data used.
"""
import asyncio, json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  pc=await b.new_context(viewport={'width':1280,'height':900});cc=await b.new_context(viewport={'width':810,'height':1080})
  parent=await pc.new_page();child=await cc.new_page();errors=[]
  for page in (parent,child):page.on('pageerror',lambda e:errors.append(str(e)))
  await parent.goto('http://127.0.0.1:8876');await parent.select_option('#cloudLogin [name=mode]','create');await parent.fill('#cloudLogin [name=password]','parent1234');await parent.fill('#cloudLogin [name=childPassword]','123456');parent.on('dialog',lambda d:asyncio.create_task(d.accept()));await parent.click('#cloudLogin button');await parent.wait_for_selector('#cloudBar:visible');code=(await parent.locator('#cloudIdentity').inner_text()).split(' ')[0]
  await child.goto('http://127.0.0.1:8876');await child.fill('[name=code]',code);await child.select_option('#cloudLogin [name=role]','child');await child.fill('#cloudLogin [name=password]','123456');await child.click('#cloudLogin button');await child.wait_for_selector('#cloudBar:visible');assert not await child.locator('#roleButton').is_visible()
  async def publish(title,kind='checkin'):
   await parent.select_option('#taskForm [name=kind]',kind);await parent.fill('#taskForm [name=title]',title);await parent.click('#taskForm button[type=submit]');await parent.wait_for_function('!cloudBusy');assert await parent.locator('#taskForm [name=title]').input_value()==''
  await publish('同步验收：语文45页');await publish('同步验收：口算','oral')
  await child.click('#cloudRefresh');await child.wait_for_function('state.tasks.length===2');await child.locator('#tasks [data-task]').first.click();await child.click('#completeTask');await child.wait_for_function('!cloudBusy');await child.wait_for_selector('#taskDialog',state='hidden')
  await parent.click('#cloudRefresh');await parent.wait_for_function('state.tasks.filter(t=>t.done).length===1')
  await child.locator('#tasks [data-task]').nth(1).click();await child.click('#timerToggle');await child.wait_for_function('!cloudBusy');await child.wait_for_timeout(1200);await child.click('#timerEnd');await child.wait_for_function('!cloudBusy');await parent.click('#cloudRefresh');await parent.wait_for_function('state.tasks.every(t=>t.done)');assert await parent.evaluate('available()')==1;assert await parent.evaluate('state.ledger.reduce((a,l)=>a+l.points,0)')==40
  await child.reload();await child.wait_for_selector('#cloudBar:visible');assert await child.evaluate('state.tasks.every(t=>t.done)')
  # Network loss must preserve the parent's draft and not invent published tasks.
  await parent.fill('#taskForm [name=day]',await parent.evaluate("shift(dayOf(),1)"));await parent.fill('#taskForm [name=title]','离线不能假发布');await pc.set_offline(True);await parent.click('#taskForm button[type=submit]');await parent.wait_for_function('!cloudBusy');assert await parent.locator('#taskForm [name=title]').input_value()=='离线不能假发布';assert await parent.evaluate('state.tasks.length')==2;await pc.set_offline(False)
  await child.screenshot(path='preview/sync-child-verified.png');await parent.screenshot(path='preview/sync-parent-verified.png');assert not errors,errors
  print(json.dumps({'passed':['separate parent/child sessions','parent publishes; child receives','child completes; parent receives','oral server timer','one daily flower and 40 points','reload restores cloud state','offline preserves unsent draft','child cannot access parent controls'],'browser_errors':errors},ensure_ascii=False))
  await b.close()
asyncio.run(main())
