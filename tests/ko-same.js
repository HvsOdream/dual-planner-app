// 문구를 감싸거나 합친 뒤, 한국어 화면이 그대로인지 예전 판과 글자를 대조한다(0.7.75에서 글자 9곳이 떨어진 뒤 만듦).
//   git show <예전 커밋>:index.html > /tmp/old/index.html && cp -r lang /tmp/old/ && node tests/ko-same.js /tmp/old/index.html index.html
//   탭·메뉴 안쪽·적기 창의 글자와 aria-label·placeholder를 비교해 다른 줄을 찍는다. '차이 난 화면 0'이어야 한다.
const fs=require('fs'),{pathToFileURL}=require('url'),{chromium,devices}=require('playwright');
const sm=fs.readFileSync(require('path').join(__dirname, 'smoke.js'),'utf8');
const a=sm.indexOf('function seed(LONG)'),b=sm.indexOf('\n}\n',a)+2;const seedSrc=sm.slice(a,b);
const LONG=/const LONG = '([^']+)'/.exec(sm)[1];
const seed=new Function('LONG',seedSrc+';return seed(LONG);');
(async()=>{const br=await chromium.launch({executablePath:process.env.PW_CHROME});const res={};
for(const [name,file] of [['old',process.argv[2]],['new',process.argv[3]]]){
 const ctx=await br.newContext({...devices['iPhone 13'],locale:'ko-KR'});const pg=await ctx.newPage();
 await pg.addInitScript(`(${seedSrc})(${JSON.stringify(LONG)})`);
 await pg.goto(pathToFileURL(require('path').resolve(file)).href+(process.argv[4]||''));await pg.waitForTimeout(600);
 const out={};
 const grab=async k=>{await pg.waitForTimeout(150);out[k]=await pg.evaluate(()=>document.body.innerText+'\n@@'+[...document.querySelectorAll('[aria-label],[placeholder],[title]')].map(e=>(e.getAttribute('aria-label')||'')+'|'+(e.getAttribute('placeholder')||'')).join('\n'));};
 for(const t of ['today','week','review','memo','more','plan']){await pg.evaluate(t=>go(t),t);await grab(t);}
 for(const s of ['acct','feats','roles','cal','notify','cover','conn','legal']){await pg.evaluate(s=>{go('more');openSec(s)},s);await grab('more:'+s);}
 await pg.evaluate(()=>{go('week');rowOpen='b1';render()}).catch(()=>{});await grab('rowopen');
 await pg.evaluate(()=>{go('plan');planView='new';render()}).catch(()=>{});await grab('plannew');
 await pg.evaluate(()=>{go('review');calSel=today();render()}).catch(()=>{});await grab('calsel');
 await pg.evaluate(()=>{openWrite&&openWrite()}).catch(()=>{});await grab('write');
 res[name]=out;await ctx.close();}
await br.close();let n=0;
for(const k of Object.keys(res.old)){const A=res.old[k].split('\n'),B=(res.new[k]||'').split('\n');const sa=new Set(A),sb=new Set(B);
 const da=A.filter(x=>!sb.has(x)&&!/0\.7\.\d+/.test(x)),db=B.filter(x=>!sa.has(x)&&!/0\.7\.\d+/.test(x));
 if(da.length||db.length){n++;console.log('## '+k);da.forEach(x=>console.log('  - '+x.slice(0,160)));db.forEach(x=>console.log('  + '+x.slice(0,160)));}}
console.log('차이 난 화면',n);})();
