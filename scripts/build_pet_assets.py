"""Embed imagegen-created alpha sheets and derive SVG viewports; never remove backgrounds here."""
from pathlib import Path
from PIL import Image
import base64,json,re,shutil
import numpy as np, cv2
from scipy import ndimage
root=Path(__file__).resolve().parents[1]
paths=json.loads(Path('/tmp/dva-pet-paths.json').read_text())
s=(root/'public/growth.html').read_text();meta={}
labels={'bichon':'白色比熊','shiba':'棕色泰迪','corgi':'奶油色博美','rabbit':'奶白垂耳兔','cat':'奶油白小猫','penguin':'灰白小企鹅'}
out=root/'public/assets/pets/cute';out.mkdir(exist_ok=True)
for name,source in paths.items():
 png=out/(name+'-stages.png');shutil.copyfile(source,png)
 im=Image.open(png);assert im.mode=='RGBA';assert im.getchannel('A').histogram()[0]>im.width*im.height*.2
 webp=out/(name+'-stages.webp')
 if not webp.exists() or not webp.stat().st_size: im.save(webp,'WEBP',quality=83,method=6)
 w,h=im.size;frames=[];clips=[]
 alpha=np.array(im.getchannel('A'))>80
 labeled,total=ndimage.label(alpha)
 pieces=[]
 for ident,box in enumerate(ndimage.find_objects(labeled),1):
  if box is not None and np.count_nonzero(labeled[box]==ident)>1500:
   pieces.append(labeled==ident)
 for row in range(2):
  group=[m for m in pieces if np.nonzero(m)[0].mean()//(h/2)==row]
  while len(group)<5:
   index=max(range(len(group)),key=lambda j:np.ptp(np.nonzero(group[j])[1]))
   mask=group.pop(index);ys,xs=np.nonzero(mask);center=(xs.min()+xs.max())//2
   # Separate touching characters at their narrowest shared vertical seam.
   projection=mask.sum(axis=0);lo=int(center-w*.035);hi=int(center+w*.035)
   split=lo+int(np.argmin(projection[lo:hi]))
   left=mask.copy();left[:,split:]=False;right=mask.copy();right[:,:split]=False
   group.extend([left,right])
  assert len(group)==5,(name,row,len(group))
  group.sort(key=lambda m:np.nonzero(m)[1].mean())
  for mask in group:
   expanded=ndimage.binary_dilation(mask,iterations=2)
   contours,_=cv2.findContours(expanded.astype('uint8'),cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
   outline_paths=[]
   for contour in contours:
    points=cv2.approxPolyDP(contour,.6,True).reshape(-1,2)
    outline_paths.append('M'+' L'.join(f'{x} {y}' for x,y in points)+' Z')
   ys,xs=np.nonzero(expanded);x=max(0,int(xs.min())-2);y=max(0,int(ys.min())-2)
   frames.append([x,y,min(w,int(xs.max())+3)-x,min(h,int(ys.max())+3)-y]);clips.append(' '.join(outline_paths))
 data=base64.b64encode(webp.read_bytes()).decode();tag=f'<image id="pet-atlas-{name}" width="{w}" height="{h}" href="data:image/webp;base64,{data}"/>'
 s,n=re.subn(r'<image id="pet-atlas-'+name+r'"[^>]+/>',lambda _:tag,s,count=1);assert n==1,name
 meta[name]={'width':w,'height':h,'name':labels[name],'frames':frames,'clips':clips}
s=re.sub(r'const petAtlasMeta=.*?;\n',lambda _:'const petAtlasMeta='+json.dumps(meta,ensure_ascii=False)+';\n',s,count=1)
a=s.index('let petClipSequence=0;' if 'let petClipSequence=0;' in s else 'function growthDog(');b=s.index('\nlet careBusy',a)
s=s[:a]+'''let petClipSequence=0;
function growthDog(breed,level,avatar=false){
 const key=petAtlasMeta[breed]?breed:'bichon',meta=petAtlasMeta[key];level=Math.max(0,Math.min(9,Number(level)||0));
 const clipId='pet-cut-'+(++petClipSequence);const frame=meta.frames[level];let [x,y,w,h]=frame;
 if(avatar){const side=Math.min(w,h*(level===0?.78:.68));x+=(w-side)/2;y+=h*(level===0?.18:.025);w=side;h=side;}
 // A nested viewport clips each sheet cell without repeated global SVG clip IDs.
 return `<svg class="puppy-3d ${avatar?'pet-headshot':''}" viewBox="${x} ${y} ${w} ${h}" width="220" height="220" role="img" aria-label="${meta.name}，${level+1}级${stageName(level,key)}" preserveAspectRatio="xMidYMid meet" style="overflow:hidden"><svg x="${frame[0]}" y="${frame[1]}" width="${frame[2]}" height="${frame[3]}" viewBox="${frame.join(' ')}" overflow="hidden"><defs><clipPath id="${clipId}"><path d="${meta.clips[level]}"/></clipPath></defs><use href="#pet-atlas-${key}" clip-path="url(#${clipId})"/></svg></svg>`;
}
'''+s[b:]
(root/'public/growth.html').write_text(s)
(out/'viewports.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2))
print('Embedded transparent ten-stage sheets:',','.join(paths))
print('WebP bytes:',sum(p.stat().st_size for p in out.glob('*.webp')))
