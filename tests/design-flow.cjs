// Uses fixture responses and a temporary component harness; never uses the live database.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const harness = path.join(root, 'src/app/design-check/page.tsx');
const base = process.env.EXAM_TEST_URL || 'http://127.0.0.1:3100';
const shots = path.join(root, '.next-design/screenshots');
const entries = Array.from({length: 8}, (_, i) => ({id:`history-${i}`,source:'mock',sourceId:'fixture',title:'March 2026',section:i%2?'Reading and Writing':'Math',module:i%2+1,mode:'timed',fullExamId:null,correctCount:12+i,total:22,completedAt:new Date(Date.now()-i*86400000).toISOString(),questions:Array.from({length:6}, (_,q)=>({skill:i%2?'Words in Context':'Linear equations',isCorrect:q<i}))}));
const grade = {total:1,correctCount:1,accuracyPct:100,results:[{questionId:'q1',questionText:'Which value of x satisfies 2x + 4 = 10?',choices:[{id:'A',text:'3'},{id:'B',text:'7'}],skill:'Linear equations',difficulty:'Easy',selectedAnswer:'A',correctAnswer:'A',isCorrect:true,explanation:'Subtract 4, then divide by 2.',rationale:'x = 3'}]};
async function main() {
  assert.equal(fs.existsSync(harness), false, 'Do not overwrite an existing route');
  fs.mkdirSync(path.dirname(harness), {recursive:true});
  fs.writeFileSync(harness, fs.readFileSync(path.join(__dirname,'fixtures/design-page.tsx')), {flag:'wx'});
  fs.mkdirSync(shots,{recursive:true});
  let browser;
  try {
    browser = await chromium.launch({headless:true,channel:'chrome'});
    const page = await browser.newPage({viewport:{width:1440,height:1000}});
    page.setDefaultTimeout(30000);
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    let empty=false, fail=false, lastSet=null, coachCalls=0;
    await page.route('**/api/**',async route=>{
      const url=new URL(route.request().url()); let body={};
      if(url.pathname.includes('/coach')) coachCalls++;
      if(url.pathname==='/api/auth/me') body={user:{name:'Emperor',isAdmin:false}};
      else if(url.pathname==='/api/progress') {
        if(fail) return route.fulfill({status:503,json:{error:'Could not load your progress.'}});
        body={entries:empty?[]:entries};
      } else if(url.pathname.startsWith('/api/progress/')) body={...grade,mockTitle:'March 2026'};
      else if(url.pathname==='/api/practice/counts') body={counts:[{section:'Math',domain:'Algebra',skill:'Linear equations',total:120,easy:40,medium:40,hard:40,attempted:30,correct:20},{section:'Reading and Writing',domain:'Craft and Structure',skill:'Words in Context',total:180,easy:60,medium:60,hard:60,attempted:50,correct:40}]};
      else if(url.pathname==='/api/practice/overview') body={sections:[{section:'Math',solved:30,total:120,pct:25},{section:'Reading and Writing',solved:50,total:180,pct:28}],stats:{questionsAttempted:80,currentAccuracyPct:75,skillsMastered:2,studyStreakDays:3}};
      else if(url.pathname==='/api/practice/topics') body={topics:[]};
      else if(url.pathname==='/api/qbank/facets') body={section:url.searchParams.get('section'),total:100,attempted:20,correct:15,byDifficulty:{Easy:40,Medium:40,Hard:20},domains:[{domain:'Algebra',total:100,attempted:20,skills:[{skill:'Linear equations',total:100,attempted:20,correct:15,byDifficulty:{Easy:40,Medium:40,Hard:20}}]}]};
      else if(url.pathname==='/api/qbank/list') {const n=Number(url.searchParams.get('page')||1);body={total:100,page:n,pageSize:50,rows:Array.from({length:5},(_,i)=>({id:`q-${n}-${i}`,externalId:`SAT-${n}-${i}`,domain:'Algebra',skill:'Linear equations',difficulty:'Medium',questionType:'multiple_choice',attempts:i,lastCorrect:i?true:null}))};}
      else if(url.pathname==='/api/qbank/sets') {lastSet=route.request().postDataJSON();return route.fulfill({status:503,json:{error:'Fixture stops before starting a new session.'}});}
      else if(url.pathname==='/api/public/module') body={mockTitle:'March 2026',section:'Math',module:1,minutes:35,questions:[{id:'q1',questionText:grade.results[0].questionText,choices:grade.results[0].choices,skill:'Linear equations',domain:'Algebra',difficulty:'Easy',questionType:'multiple_choice',imageData:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="160"><rect width="400" height="160" fill="white"/><path d="M40 130 L40 20 M40 130 L370 130 M40 120 L330 35" stroke="#172554" stroke-width="3"/></svg>')}]};
      else if(url.pathname==='/api/public/module/grade') body=grade;
      await route.fulfill({json:body});
    });
    const shot=async name=>{await page.screenshot({path:path.join(shots,name+'.png'),fullPage:true});};
    const fits=async()=>assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page fits viewport');
    await page.goto(base+'/design-check');
    await page.getByText('Practice history',{exact:true}).waitFor();
    assert.equal(await page.locator('[data-question-watermark]').count(),0);
    assert.equal(await page.getByText('Coach',{exact:true}).count(),0);
    await shot('progress-desktop');
    await page.getByRole('button',{name:'Switch to dark mode',exact:true}).filter({visible:true}).click();
    await page.locator('.app-dark').waitFor(); await shot('progress-dark');
    await page.getByLabel('Subject',{exact:true}).selectOption('Math');
    assert.ok(await page.getByRole('link',{name:/Practice this skill/}).getAttribute('href').then(h=>h.includes('section=Math')));
    await page.setViewportSize({width:390,height:844}); await fits(); await shot('progress-mobile-dark');
    await page.getByRole('link',{name:'Your account',exact:true}).filter({visible:true}).waitFor();
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(base+'/design-check?view=practice');
    await page.getByRole('button',{name:/Reading & Writing.*Choose your topics/}).waitFor();
    await page.getByRole('button',{name:'Switch to light mode',exact:true}).filter({visible:true}).click();
    await shot('question-bank-desktop');
    await page.goto(base+'/design-check?view=browse&section=Math');
    await page.getByRole('checkbox',{name:'Select question SAT-1-0',exact:true}).check();
    await page.getByRole('button',{name:'Next ›',exact:true}).click();
    await page.getByRole('checkbox',{name:'Select question SAT-2-0',exact:true}).check();
    await page.getByRole('button',{name:'Practice selected',exact:true}).click();
    assert.deepEqual(lastSet.questionIds,['q-1-0','q-2-0']);
    await shot('question-browser-desktop');
    await page.setViewportSize({width:390,height:844}); await fits(); await shot('question-browser-mobile');
    await page.goto(base+'/practice/fixture/Math/1');
    await page.getByRole('button',{name:'Start test',exact:true}).click();
    await page.locator('[data-question-watermark]').first().waitFor();
    assert.equal(await page.locator('[data-question-watermark]').count(),2,'Both question panes carry source attribution');
    assert.equal(await page.getByText('Coach',{exact:true}).count(),0);
    assert.equal(await page.locator('[data-question-watermark]').first().evaluate(el=>getComputedStyle(el).pointerEvents),'none');
    await shot('question-watermark-mobile');
    await page.setViewportSize({width:1440,height:1000}); await shot('question-watermark-desktop');
    await page.getByRole('button',{name:'More',exact:true}).click();
    await page.getByRole('button',{name:'Dark background',exact:true}).click();
    await page.locator('.exam-dark').waitFor(); await shot('question-watermark-dark');
    await page.goto(base+'/practice/fixture/Math/1?review=1&history=history-0');
    await page.getByText('Subtract 4, then divide by 2.',{exact:true}).waitFor();
    assert.ok(await page.locator('[data-question-watermark]').count()>0); await shot('question-review-watermark');
    empty=true; await page.goto(base+'/design-check'); await page.getByText('Your next chapter starts with one session',{exact:true}).waitFor();
    fail=true; await page.reload(); await page.getByRole('button',{name:'Try again',exact:true}).click();
    fail=false; await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.getByText('Your next chapter starts with one session',{exact:true}).waitFor();
    assert.equal(coachCalls,0); assert.deepEqual(errors,[]);
    console.log('PASS design: responsive layouts, shared theme, selection across pages, empty/error states, historical review, and question-only watermarks');
    // These actual retired API calls run without fixture interception.
    const request=await browser.newContext();
    for(const endpoint of ['/api/coach','/api/public/coach','/api/coach/conversations','/api/coach/conversations/old']) {
      assert.equal((await request.request.get(base+endpoint)).status(),410);
      assert.equal((await request.request.post(base+endpoint,{data:{message:'test'}})).status(),410);
    }
    await request.close(); console.log('PASS all Coach endpoints are retired');
  } finally {
    if(browser) await browser.close();
    fs.unlinkSync(harness); fs.rmdirSync(path.dirname(harness));
    // Next generates a type check for the temporary route; remove that file too.
    for (const output of ['.next', '.next-design']) {
      const generatedType = path.join(root, output, 'types/app/design-check/page.ts');
      if (fs.existsSync(generatedType)) fs.unlinkSync(generatedType);
    }
  }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
