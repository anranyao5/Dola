"""Exercise gateway request-size failures using isolated browser-generated pictures."""
import asyncio,json
from playwright.async_api import async_playwright
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox']);page=await b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  await page.goto('http://127.0.0.1:8876')
  result=await page.evaluate('''async()=>{
   const results=[];
   for(const [width,height,noise,type] of [[1600,1200,true,'image/png'],[2400,1800,true,'image/jpeg'],[1800,2400,false,'image/png'],[300,300,true,'image/png']]){
    const c=document.createElement('canvas');c.width=width;c.height=height;const x=c.getContext('2d'),d=x.createImageData(width,height);let n=123;
    for(let i=0;i<d.data.length;i+=4){n=(n*1664525+1013904223)>>>0;d.data[i]=noise?n&255:230;d.data[i+1]=noise?(n>>>8)&255:140;d.data[i+2]=noise?(n>>>16)&255:190;d.data[i+3]=255;}x.putImageData(d,0,0);
    const blob=await new Promise(r=>c.toBlob(r,type,.95));const file=new File([blob],'fixture.'+(type==='image/png'?'png':'jpg'),{type});const photo=await giftPhoto(file);const request=JSON.stringify({mime:'image/jpeg',data:photo.split(',')[1]});
    if(request.length>41*1024)throw Error('Request too large '+request.length);
    const im=new Image();im.src=photo;await im.decode();if(!im.width||!im.height)throw Error('Invalid photo');results.push({sourceBytes:blob.size,requestBytes:request.length,width:im.width,height:im.height});
   }
   return results;
  }''')
  # A gateway may return HTML or JSON without an error field; both must explain 413.
  for body,ctype in [('<html>Payload Too Large</html>','text/html'),('{"message":"Payload Too Large"}','application/json')]:
   await page.route('**/api/dva/assets',lambda route:route.fulfill(status=413,body=body,content_type=ctype))
   message=await page.evaluate("async()=>{try{await cloudApi('/assets',{mime:'image/jpeg',data:'fixture'});return '';}catch(e){return e.message;}}")
   assert '请求过大' in message,message
   await page.unroute('**/api/dva/assets')
  await page.evaluate("()=>{cloudSession={token:'isolated-test',role:'parent',familyCode:'TEST'};cloudReady=true;state=seed();normalizePets();cloudPull=async()=>{};document.body.classList.remove('cloud-locked');$('#cloudAuth').hidden=true;setPage('parent');}")
  await page.click('[data-parent-tab=rewards]')
  await page.fill('#giftForm [name=name]','上传失败保留内容测试');await page.fill('#giftForm [name=cost]','4')
  # Native form submission must preserve the selected file and text when rejected.
  photo=await page.evaluate("()=>{const c=document.createElement('canvas');c.width=100;c.height=100;c.getContext('2d').fillRect(0,0,100,100);return c.toDataURL('image/png').split(',')[1];}")
  import base64
  await page.set_input_files('#giftForm [name=photo]',{'name':'fixture.png','mimeType':'image/png','buffer':base64.b64decode(photo)})
  await page.route('**/api/dva/assets',lambda route:route.fulfill(status=413,body='{}',content_type='application/json'))
  await page.click('#giftForm button[type=submit]');await page.wait_for_function('!cloudBusy')
  assert await page.locator('#giftForm [name=name]').input_value()=='上传失败保留内容测试'
  assert await page.locator('#giftForm [name=photo]').evaluate('(e)=>e.files.length')==1
  assert not await page.evaluate("state.gifts.some(g=>g.name==='上传失败保留内容测试')")
  assert not errors,errors
  print(json.dumps({'pictures':result,'gateway413Explained':True,'failedUploadPreservesDraft':True,'errors':errors}));await b.close()
asyncio.run(main())
