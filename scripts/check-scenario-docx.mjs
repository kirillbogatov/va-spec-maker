import { chromium } from '@playwright/test';
import { Document, Packer, Paragraph, HeadingLevel, Table, TableRow, TableCell, TextRun } from 'docx';
const p = text => new Paragraph(text);
const table = rows => new Table({rows:rows.map(row => new TableRow({children:row.map(text => new TableCell({children:[p(text)]}))}))});
const doc = new Document({sections:[{children:[new Paragraph({text:'Word scenario',heading:HeadingLevel.HEADING_1}),p('Scenario details'),new Paragraph({text:'Prompts',heading:HeadingLevel.HEADING_2}),table([['Prompt','Full answer'],['PRM_WORD','Hello from Word']]),new Paragraph({text:'State transitions',heading:HeadingLevel.HEADING_2}),table([['From state','To state','User request','Conditions','System action','Assistant response'],['START','DONE','INT_WORD','Ready','Do work','PRM_WORD']])]}]});
const bytes = [...await Packer.toBuffer(doc)];
const browser = await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 await page.goto(process.env.SCENARIO_TEST_URL || 'http://127.0.0.1:5188/');
 const result=await page.evaluate(async bytes=>{
   const {readScenarioFile}=await import('/src/lib/scenarioDocument.ts');
   const good=await readScenarioFile(new File([new Uint8Array(bytes)],'scenario.docx'));
   let bad='';try { await readScenarioFile(new File(['broken'],'broken.docx')); } catch(e) {bad=e.message;}
   return {names:good.dump.tables.scenarios.map(s=>s.name),prompts:good.dump.tables.prompts,steps:good.dump.tables.scenario_steps,bad};
 },bytes);
 if(result.names[0]!=='Word scenario'||result.prompts[0]?.full_answers!=='["Hello from Word"]'||result.steps[0]?.next_states!=='DONE'||!result.bad) throw new Error(JSON.stringify(result));
 console.log('PASS: real DOCX headings, prompt table, transitions, and invalid file handling');
} finally {await browser.close();}
