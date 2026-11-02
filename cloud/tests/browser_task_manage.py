import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);pc=await b.new_context();cc=await b.new_context();parent=await pc.new_page();child=await cc.new_page();errors=[]
  for page in [parent,child]:page.on('pageerror',lambda e:errors.append(str(e)))
  parent.on('dialog',lambda d:asyncio.create_task(d.accept()));await parent.goto('http://127.0.0.1:8876');await parent.select_option('#cloudLogin [name=mode]','create');await parent.fill('#cloudLogin [name=password]','manage-parent123');await parent.fill('#cloudLogin [name=childPassword]','123456');await parent.click('#cloudLogin button');await parent.wait_for_selector('#cloudBar:visible');code=(await parent.locator('#cloudIdentity').inner_text()).split(' ')[0]
  for title in ['作业一','作业二']:
   await parent.fill('#taskForm [name=title]',title);await parent.click('#taskForm button[type=submit]');await parent.wait_for_function('!cloudBusy')
  await child.goto('http://127.0.0.1:8876');await child.fill('[name=code]',code);await child.select_option('#cloudLogin [name=role]','child');await child.fill('#cloudLogin [name=password]','123456');await child.click('#cloudLogin button');await child.wait_for_selector('#cloudBar:visible');assert not await child.locator('[data-edit-task]').first.is_visible()
  await parent.locator('[data-edit-task]').first.click();await parent.fill('#editTaskForm [name=title]','已编辑的语文作业');await parent.select_option('#editTaskForm [name=subject]','语文');await parent.click('#editTaskForm [type=submit]');await parent.wait_for_function('!cloudBusy');assert not await parent.locator('#editTaskDialog').is_visible();await child.evaluate('cloudPull(true)');assert '已编辑的语文作业' in await child.locator('#tasks').inner_text()
  await parent.locator('[data-delete-task]').last.click();await parent.wait_for_function('!cloudBusy');await child.evaluate('cloudPull(true)');assert await child.locator('#tasks [data-task]').count()==1
  # An edit opened before child completion cannot overwrite the completed record.
  await parent.locator('[data-edit-task]').first.click();await child.locator('#tasks [data-task]').click();await child.click('#completeTask');await child.wait_for_function('!cloudBusy');await parent.fill('#editTaskForm [name=title]','不能覆盖');await parent.click('#editTaskForm [type=submit]');await parent.wait_for_function('!cloudBusy');assert await parent.locator('#editTaskDialog').is_visible();await parent.locator('[data-close=editTaskDialog]').first.click();await parent.evaluate('cloudPull(true)');assert await parent.locator('[data-edit-task]').count()==0;assert '已编辑的语文作业' in await parent.locator('#parentTasks').inner_text();assert await parent.locator('#flowerBalance').inner_text()=='1';assert not errors,errors
  print(json.dumps({'editSync':True,'deleteSync':True,'childCannotManage':True,'completedDuringEditProtected':True,'rewardUnchanged':True,'errors':errors}));await b.close()
asyncio.run(main())
