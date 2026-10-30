"""Completion feedback waits for acknowledgement and respects device sound preference."""
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=await b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:8876')
  await page.evaluate('''()=>{
   document.body.classList.remove('cloud-locked');$('#cloudAuth').hidden=true;$('#cloudBar').hidden=false;cloudPull=async()=>{};
   window.__tones=0;window.__resumes=0;
   class AudioMock{constructor(){this.state='suspended';this.currentTime=1;this.destination={};}resume(){__resumes++;this.state='running';return Promise.resolve();}createOscillator(){return {frequency:{setValueAtTime(){}},connect(){},disconnect(){},start(){__tones++},stop(){}};}createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}}
   window.AudioContext=AudioMock;
   window.fixture=kind=>{state=seed();normalizePets();const task=newTask(dayOf(),'语文','完成音效测试',kind);state.tasks=[task];if(kind==='oral'){task.elapsed=2000;task.started=null;}render();openTask(task.id);};
   window.saveOriginal=transact;
   transact=async fn=>{fn();return new Promise(resolve=>window.__ack=resolve);};fixture('checkin');
  }''')
  await page.click('#completeTask');assert await page.evaluate('__resumes')==1;assert await page.evaluate('__tones')==0
  await page.evaluate('__ack(true)');await page.wait_for_function('__tones===3')
  await page.evaluate('fixture("checkin")');await page.click('#completeTask');await page.evaluate('__ack(false)');await page.wait_for_timeout(30);assert await page.evaluate('__tones')==3
  await page.locator('[data-close=taskDialog]').click();await page.click('#completionSoundToggle');assert await page.locator('#completionSoundToggle').get_attribute('aria-pressed')=='false'
  await page.evaluate('fixture("oral")');await page.click('#timerEnd');await page.evaluate('__ack(true)');await page.wait_for_timeout(30);assert await page.evaluate('__tones')==3
  await page.reload();assert await page.locator('#completionSoundToggle').get_attribute('aria-pressed')=='false';assert await page.evaluate('completionAudio===null')
  await page.evaluate("()=>{document.body.classList.remove('cloud-locked');$('#cloudAuth').hidden=true;$('#cloudBar').hidden=false;}");await page.click('#completionSoundToggle');await page.reload();assert await page.locator('#completionSoundToggle').get_attribute('aria-pressed')=='true'
  assert not errors,errors;print(json.dumps({'playsAfterAcknowledgement':True,'failedSaveSilent':True,'timerRespectsMute':True,'preferenceSurvivesReload':True,'reloadSilent':True,'errors':errors}));await b.close()
asyncio.run(main())
