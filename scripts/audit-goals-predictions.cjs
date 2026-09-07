const {chromium}=require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const assert=require('assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:process.env.AUDIT_BROWSER_CHANNEL || 'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:375,height:740}}); const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await page.addInitScript(()=>{if(!localStorage.getItem('crm_user')) localStorage.setItem('crm_user',JSON.stringify({role:'MANAGER'}))});
 await page.route('**/__analytics_audit**', route => route.fulfill({contentType:'text/html',body:`<html><head><meta name="viewport" content="width=device-width, initial-scale=1" /></head><body><div id="root"></div><script type="module">
 import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
 const React = (await import('/node_modules/.vite/deps/react.js')).default;
 const {createRoot} = (await import('/node_modules/.vite/deps/react-dom_client.js')).default;
 const {ToastProvider} = await import('/src/components/Toast.tsx');
 const {default:Page} = await import(location.search.includes('predictions') ? '/src/pages/crm/analytics/CrmPredictions.tsx' : '/src/pages/crm/analytics/CrmGoals.tsx');
 await import('/src/index.css'); createRoot(document.getElementById('root')).render(React.createElement(ToastProvider,null,React.createElement(Page)));
 </script></body></html>` }));
 const year=new Date().getFullYear(); let fail=true,writes=[],delay=0;
 const goal={id:'g1',title:'Sinov maqsadi',type:'revenue',target:0,current:0,unit:"so'm",period:'yearly',month:null,year,status:'active',createdAt:''};
 await page.route('**/api/goals**',async route=>{const req=route.request();if(req.method()==='GET'){await new Promise(r=>setTimeout(r,delay));await route.fulfill({status:fail?500:200,json:fail?{error:'test'}:{data:[goal]}})}else{writes.push({method:req.method(),url:req.url(),data:req.postDataJSON()});await new Promise(r=>setTimeout(r,300));await route.fulfill({json:{data:goal,updated:1}})}});
 await page.goto('http://127.0.0.1:3010/__analytics_audit');await page.waitForLoadState('networkidle');
 await page.getByRole('alert').waitFor();fail=false;await page.getByRole('button',{name:'Qayta urinish'}).click();await page.getByText('Sinov maqsadi').waitFor();
 assert(!(await page.locator('body').innerText()).includes('NaN'));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:"Maqsad qo'shish",exact:true}).click();await page.getByLabel('Sarlavha *',{exact:true}).fill('   ');await page.getByLabel('Maqsad qiymati *',{exact:true}).fill('10');await page.getByRole('button',{name:'Saqlash',exact:true}).click();assert.equal(writes.length,0);
 await page.getByLabel('Sarlavha *',{exact:true}).fill('Test');await page.getByLabel('Tur',{exact:true}).selectOption('conversion');await page.getByLabel('Maqsad qiymati *',{exact:true}).fill('101');await page.getByRole('button',{name:'Saqlash',exact:true}).click();assert.equal(writes.length,0);
 await page.getByLabel('Maqsad qiymati *',{exact:true}).fill('50');await page.getByLabel('Davr',{exact:true}).selectOption('yearly');await page.getByRole('button',{name:'Saqlash',exact:true}).click();await page.keyboard.press('Escape');assert(await page.getByRole('dialog').isVisible());await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(writes.length,1);assert.equal(writes[0].data.month,null);
 await page.getByRole('button',{name:'Maqsadni tahrirlash',exact:true}).click();assert(await page.getByLabel('Tur',{exact:true}).isDisabled());await page.getByRole('button',{name:'Bekor qilish',exact:true}).click();
 await page.getByRole('button',{name:"Maqsadni o'chirish",exact:true}).click();await page.getByRole('button',{name:"Ha, o'chirish",exact:true}).click();await page.getByRole('button',{name:"O'chirilmoqda...",exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal(writes.filter(w=>w.method==='DELETE').length,1);
 console.log('PASS goals: retry, zero progress, mobile, validation, yearly payload, edit type, pending modal, duplicate delete');
 let predFail=true;const revenue={historical:[{month:'2026-07',label:'Iyul 2026',actual:0},{month:'2026-08',label:'Avgust 2026',actual:1000000}],forecast:{amount:1500000,month:'Sentabr 2026',trend:50,confidence:'medium',activeStudents:5,avgFee:300000}};
 await page.route('**/api/predictions/**',async route=>{const u=route.request().url();let data;if(u.includes('dropout'))data={data:[],summary:{total:0,high:0,medium:0,low:0}};if(u.includes('revenue'))data=revenue;if(u.includes('best-leads'))data={data:[]};if(u.includes('payment'))data={data:[{id:'p1',name:'Uzun ism '.repeat(6),phone:'+998901234567',balance:100000,daysSincePayment:999,lastPaymentDate:'2023-12-01',severity:'high'}]};await route.fulfill({status:predFail?500:200,json:predFail?{error:'test'}:data});});
 await page.goto('http://127.0.0.1:3010/__analytics_audit?predictions');await page.waitForLoadState('networkidle');await page.getByRole('alert').waitFor();predFail=false;await page.getByRole('button',{name:'Qayta urinish'}).click();await page.getByText("Xavf ostidagi o'quvchilar topilmadi").waitFor();
 await page.getByRole('button',{name:'Daromad bashorati',exact:true}).click();await page.getByText('So\'nggi 6 oy + Bashorat').waitFor();await page.waitForTimeout(700);assert.equal(await page.locator('.recharts-area').count(),2);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));

 await page.getByRole('button',{name:"To'lov xavfi",exact:true}).click();await page.getByText("999 kun to'lov yo'q").waitFor();assert.equal(await page.getByText("0 so'm",{exact:true}).count(),1);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.getByRole('button',{name:'Eng yaxshi lidlar',exact:true}).click();await page.getByText('Aktiv lidlar topilmadi').waitFor();

 // A stale failed response must not dismiss the active tab's pending state.
 let releaseOld, releaseNew;
 await page.route('**/api/predictions/dropout-risk',async r=>{await new Promise(resolve=>releaseOld=resolve);await r.fulfill({status:500,json:{error:'old'}})});
 await page.route('**/api/predictions/best-leads',async r=>{await new Promise(resolve=>releaseNew=resolve);await r.fulfill({json:{data:[]}})});
 await page.getByRole('button',{name:'Chiqib ketish xavfi',exact:true}).click();await page.waitForTimeout(100);
 await page.getByRole('button',{name:'Eng yaxshi lidlar',exact:true}).click();await page.waitForTimeout(100);releaseOld();await page.waitForTimeout(100);
 assert(await page.getByText('AI tahlil qilmoqda...').isVisible());assert.equal(await page.getByRole('alert').count(),0);releaseNew();await page.getByText('Aktiv lidlar topilmadi').waitFor();
 for(const width of [320,1280]) { await page.setViewportSize({width,height:740});await page.getByRole('button',{name:'Daromad bashorati',exact:true}).click();await page.getByText("So'nggi 6 oy + Bashorat").waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.getByRole('button',{name:"To'lov xavfi",exact:true}).click();await page.getByText("999 kun to'lov yo'q").waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)); }
 // Earlier year must not overwrite the latest year.
 await page.route('**/api/goals?year=*',async r=>{const y=Number(new URL(r.request().url()).searchParams.get('year'));await new Promise(resolve=>setTimeout(resolve,y===year-1?700:30));await r.fulfill({json:{data:[{...goal,title:'Yil '+y,year:y}]}})});
 await page.goto('http://127.0.0.1:3010/__analytics_audit');await page.waitForLoadState('networkidle');await page.getByRole('button',{name:String(year-1),exact:true}).click();await page.getByRole('button',{name:String(year+1),exact:true}).click();await page.getByText('Yil '+(year+1),{exact:true}).waitFor();await page.waitForTimeout(800);assert.equal(await page.getByText('Yil '+(year-1),{exact:true}).count(),0);
 await page.evaluate(()=>localStorage.setItem('crm_user',JSON.stringify({role:'TEACHER',permissions:['bi']})));await page.reload();await page.waitForLoadState('networkidle');assert(await page.getByRole('button',{name:"Maqsad qo'shish",exact:true}).isDisabled());assert(await page.getByRole('button',{name:'Joriy oyni sinxronlash',exact:true}).isDisabled());
 console.log('PASS races: stale tab errors, stale year data; widths 320/375/1280; TEACHER write controls');
 console.log('PASS predictions: retry, chart series, zero-base change, payment balance, 999-day payment, mobile, empty leads');assert.deepEqual(errors,[]);await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
