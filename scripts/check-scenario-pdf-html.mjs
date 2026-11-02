import { chromium } from '@playwright/test';
function pdfBytes() {
 const text=(x,y,size,s)=>`BT /F1 ${size} Tf ${x} ${y} Td (${s}) Tj ET`;
 const stream=[text(30,760,20,'PDF scenario'),text(30,720,14,'Prompts'),text(30,695,10,'Prompt'),text(180,695,10,'Full answer'),text(30,675,10,'PRM_PDF'),text(180,675,10,'Hello from PDF')].join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let s='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(s.length);s+=`${i+1} 0 obj\n${o}\nendobj\n`;});const x=s.length;s+=`xref\n0 6\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;return [...Buffer.from(s)];
}
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();await page.goto(process.env.SCENARIO_TEST_URL || 'http://127.0.0.1:5188/');
 await page.waitForLoadState('networkidle');
 const result=await page.evaluate(async ({bytes, root})=>{
  const {readScenarioFile}=await import('/src/lib/scenarioDocument.ts');
  const html=await readScenarioFile(new File(['<html><h1>HTML scenario</h1><h2>Prompts</h2><table><tr><th>Prompt</th><th>Full answer</th></tr><tr><td>PRM_HTML</td><td>Hello from HTML</td></tr></table></html>'],'scenario.html'));
  const pdf=await readScenarioFile(new File([new Uint8Array(bytes)],'scenario.pdf'));
  const core=await import('/@fs/'+root+'/core/src/index.ts');
  const wasm='/@fs/'+root+'/node_modules/sql.js/dist/sql-wasm.wasm';
  const db=await core.openDb({locateFile:()=>wasm});
  const app=core.createApp(db);
  for(const converted of [html,pdf]) {
    const imported=await app.handle({method:'POST',url:'/api/projects/import',body:converted.dump});
    if(imported.status!==201) throw new Error(JSON.stringify(imported));
    const target=await app.handle({method:'POST',url:'/api/projects',body:{name:'Target'}});
    const scenario=await app.handle({method:'POST',url:`/api/projects/${target.body.id}/scenarios/import`,body:{dump:converted.dump,scenario_id:converted.dump.tables.scenarios[0].id}});
    if(scenario.status!==201) throw new Error(JSON.stringify(scenario));
  }
  return {html:html.dump,pdf:pdf.dump};
 },{bytes:pdfBytes(),root:process.cwd().replaceAll('\\','/')});
 for(const [format,dump] of Object.entries(result)) {
  if(dump.tables.scenarios[0].name!==format.toUpperCase()+' scenario'||!dump.tables.prompts[0]?.full_answers.includes('Hello from '+format.toUpperCase())) throw new Error(JSON.stringify(result));
 }
 console.log('PASS: PDF/HTML parsing and project/scenario imports');
} finally {await browser.close();}
