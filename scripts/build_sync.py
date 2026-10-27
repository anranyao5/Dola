"""Build a separate cloud client. The original demo and its storage are preserved."""
import argparse, json, re
from pathlib import Path
from urllib.parse import urlparse
root=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--api-base',default='');p.add_argument('--output',default='preview/sync.html');a=p.parse_args()
u=urlparse(a.api_base)
if a.api_base and (u.scheme!='https' and not(u.scheme=='http' and u.hostname in ('localhost','127.0.0.1'))):p.error('API must use HTTPS (localhost allowed for testing)')
s=(root/'public/growth.html').read_text()
s=s.replace("const KEY='dola-family-growth-v1';","const KEY='dva-family-cloud-cache-v1';")
s=re.sub(r'function dayOf\(d=new Date\(\)\)\{[^\n]+',"function dayOf(d=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month+'-'+p.day;}",s)
# Await cloud acknowledgment before existing handlers clear forms, award feedback, or close dialogs.
s=s.replace('function transact(fn){','function demoTransact(fn){')
s=s.replace('transact(()=>','await transact(()=>').replace('if(!await transact(()=>','if(!(await transact(()=>')
# Fix parentheses for the one negated transaction in petCompanion.
s=s.replace("state.pet.lastPettedDay=dayOf();}))return;","state.pet.lastPettedDay=dayOf();})))return;")
for name in ('petCompanion','feedCompanion','finishTask','changeOrder'):
 s=s.replace('function '+name+'(', 'async function '+name+'(')
s=s.replace('.onclick=()=>{','.onclick=async()=>{').replace('.onchange=()=>{','.onchange=async()=>{')
s=s.replace("window.addEventListener('storage',", "window.addEventListener('dva-unused-demo-storage',")
s=re.sub(r'let lastDay=dayOf\(\);setInterval\([^\n]+','',s)
s=re.sub(r'if\(storageOK\)\{settleWeeks\(\);persist\(\);\}else[^\n]+','',s)
s=s.replace('已布置 \'+tasks.length+\' 项小目标（仅本浏览器）','已发布 \'+tasks.length+\' 项作业，其他设备可同步收到')
s=s.replace('计时进度会保存在本浏览器。','计时进度会同步保存到家庭账号。').replace('演示版请使用1MB以内的文件','请使用1MB以内的文件')
s=s.replace('家长演示入口 · 目前只是页面切换，尚无账号和权限保护。所有数据只保存在本浏览器。','家长管理 · 作业和礼物通过家庭账号同步，孩子账号不能修改。')
s=re.sub(r'<div class="demo">.*?</div>','<div class="demo">Dva 家庭同步版 · 联网保存后，另一台设备会自动更新。</div>',s,count=1)
css=(root/'public/sync.css').read_text();html=(root/'public/sync-auth.html').read_text();js=(root/'public/sync.js').read_text()
s=s.replace('</head>','<style>'+css+'</style></head>').replace('<body>','<body class="cloud-locked">'+html,1)
s=s.replace('toggleTaskFields();render();\n</script>', 'toggleTaskFields();render();\nconst DVA_API_BASE='+json.dumps(a.api_base.rstrip('/'))+';\n'+js+'\n</script>')
out=root/a.output;out.parent.mkdir(parents=True,exist_ok=True);out.write_text(s);print('Built '+str(out)+'; API '+(a.api_base or 'not configured — login disabled'))
