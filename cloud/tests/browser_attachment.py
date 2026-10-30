"""PNG exercise attachments are encoded to bounded requests with matching MIME."""
import asyncio,json,base64
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=await b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.goto('http://127.0.0.1:8876');await page.evaluate("()=>{document.body.classList.remove('cloud-locked');$('#cloudAuth').hidden=true;state=seed();normalizePets();state.tasks=[];state.ledger=[];cloudSession={token:'test',familyCode:'TEST',role:'parent'};cloudReady=true;cloudPull=async()=>{};setPage('parent');}")
  fixture=await page.evaluate('''()=>{const c=document.createElement('canvas');c.width=1600;c.height=1200;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,c.width,c.height);x.fillStyle='#222';x.font='28px sans-serif';for(let n=0;n<26;n++)x.fillText((n+1)+'. 练习题：128 + 256 = ________   45 × 12 = ________',50,55+n*42);return c.toDataURL('image/png').split(',')[1];}''')
  requests=[];operations=[]
  async def upload(route):
   payload=route.request.post_data_json;requests.append(payload);assert len(route.request.post_data.encode())<41*1024;raw=base64.b64decode(payload['data']);assert payload['mime']=='image/webp';assert raw[:4]==b'RIFF';await route.fulfill(status=201,content_type='application/json',body='{"fileId":"cloud://test/exercise.webp"}')
  async def operation(route):
   op=route.request.post_data_json;operations.append(op);assert op['type']=='tasks.create';t=op['args']['tasks'][0];assert t['mime']=='image/webp';assert t['attachment']=='cloud://test/exercise.webp';snapshot=await page.evaluate('state');snapshot['tasks']=[t];await route.fulfill(status=200,content_type='application/json',body=json.dumps({'state':snapshot,'version':1,'serverTime':0,'assetUrls':{'cloud://test/exercise.webp':'https://fixture.invalid/exercise.webp'}}))
  await page.route('**/api/dva/assets',upload);await page.route('**/api/dva/operations',operation);await page.fill('#taskForm [name=title]','图片附件压缩测试');await page.set_input_files('#taskForm [name=attachment]',{'name':'exercise.png','mimeType':'image/png','buffer':base64.b64decode(fixture)});await page.click('#taskForm button[type=submit]');await page.wait_for_function('!cloudBusy');assert len(requests)==1 and len(operations)==1;assert await page.locator('#taskForm [name=title]').input_value()==''
  await page.evaluate('''async data=>{const im=new Image();im.src='data:image/webp;base64,'+data;await im.decode();if(Math.max(im.width,im.height)<768)throw Error('Document shrunk too far');window.__attachmentSize={width:im.width,height:im.height};}''',requests[0]['data'])
  assert not errors,errors;print(json.dumps({'originalPNGBytes':len(base64.b64decode(fixture)),'uploadRequestBytes':len(json.dumps(requests[0])),'imageSize':await page.evaluate('__attachmentSize'),'mimeMatchesEncodedImage':True,'savedReference':True,'errors':errors}));await b.close()
asyncio.run(main())
