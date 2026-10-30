"""Exercise title-only publishing and explicitly requested Chinese speech in two sessions."""
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
  pc=await b.new_context();cc=await b.new_context(viewport={'width':810,'height':1080});parent=await pc.new_page();child=await cc.new_page();errors=[]
  for page in (parent,child):page.on('pageerror',lambda e:errors.append(str(e)))
  await parent.goto('http://127.0.0.1:8876');await parent.select_option('#cloudLogin [name=mode]','create');await parent.fill('#cloudLogin [name=password]','title-test-parent');await parent.fill('#cloudLogin [name=childPassword]','123456');parent.on('dialog',lambda d:asyncio.create_task(d.accept()));await parent.click('#cloudLogin button');await parent.wait_for_selector('#cloudBar:visible');code=(await parent.locator('#cloudIdentity').inner_text()).split(' ')[0]
  assert await parent.locator('#taskForm [name=instructions]').count()==0
  await parent.click('[data-preset=chinese]');await parent.fill('#taskForm [name=title]','语文书第46页，朗读三遍');await parent.select_option('#taskForm [name=kind]','oral');await parent.click('#taskForm button[type=submit]');await parent.wait_for_function('!cloudBusy');assert await parent.locator('#taskForm [name=title]').input_value()==''
  await child.goto('http://127.0.0.1:8876');await child.fill('[name=code]',code);await child.select_option('#cloudLogin [name=role]','child');await child.fill('#cloudLogin [name=password]','123456');await child.click('#cloudLogin button');await child.wait_for_selector('#cloudBar:visible')
  await child.evaluate('''()=>{window.__spoken=[];window.__cancel=0;Object.defineProperty(window,'speechSynthesis',{value:{cancel(){window.__cancel++},getVoices(){return []},speak(u){window.__spoken.push({text:u.text,lang:u.lang})}},configurable:true});}''')
  await child.locator('#tasks [data-read-title]').click();assert await child.evaluate('__spoken.length')==1;assert await child.evaluate('__spoken[0].text')=='语文书第46页，朗读三遍';assert await child.evaluate('__spoken[0].lang')=='zh-CN';assert not await child.locator('#taskDialog').is_visible()
  await child.locator('#tasks [data-task]').click();assert await child.evaluate('__spoken.length')==1;assert await child.locator('#speechLang').count()==0;assert await child.locator('#timerArea').is_visible();await child.click('#speakButton');assert await child.evaluate('__spoken.length')==2
  await child.locator('[data-close=taskDialog]').click();assert not await child.locator('#partnerControls').is_visible();assert '今日学习伙伴' not in await child.locator('#familyPets').inner_text()
  spelling=await child.evaluate("()=>{const t=state.tasks[0],before=t.title;t.title='RAZ J级 · 第25本';speakTitle(t.id);const result={spoken:__spoken.at(-1).text,display:t.title};t.title=before;return result;}")
  assert spelling=={'spoken':'R，A，Z J级 · 第25本','display':'RAZ J级 · 第25本'},spelling
  title_size=await child.locator('#tasks h3').evaluate('(e)=>getComputedStyle(e).fontSize');assert title_size=='18px';assert not errors,errors
  await parent.screenshot(path='preview/title-only-parent.png');await child.screenshot(path='preview/title-speaker-ipad.png')
  print(json.dumps({'titleOnlyPublishing':True,'crossSubjectTimer':True,'speechByClickOnly':True,'chineseTitleOnly':True,'languageSelectorRemoved':True,'partnerPanelRemoved':True,'taskTitleSize':title_size,'errors':errors}));await b.close()
asyncio.run(main())
