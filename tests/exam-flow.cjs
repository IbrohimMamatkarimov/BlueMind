// Run against the local preview with Playwright available on NODE_PATH.
// All API requests use fixtures; these checks never read or write the live database.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.EXAM_TEST_URL || 'http://127.0.0.1:3000';
const fixtureId = 'exam-flow-fixture';
const fullKey = `bluemind_full_exam_${fixtureId}`;
const moduleKey = `bluemind_progress_${fixtureId}_Math_1`;
const screenshotDir = process.env.EXAM_SCREENSHOT_DIR;
const questions = (section, module) => Array.from({length: section === 'Math' ? 22 : 27}, (_, i) => ({
  id: `${section}-${module}-${i}`, domain: 'Algebra', skill: 'Linear equations', difficulty: 'Medium',
  questionText: `Question ${i + 1}: Which answer is correct?`, passageText: section === 'Math' ? null : 'A short reading passage for this test.',
  choices: [{id:'A',text:'Answer A'},{id:'B',text:'Answer B'},{id:'C',text:'Answer C'},{id:'D',text:'Answer D'}], questionType:'multiple_choice',
}));
const complete = {id:fixtureId,title:'March 2026',subtitle:'Validation paper',month:'March',year:2026,
  math:[{module:1,questionCount:22},{module:2,questionCount:22}], readingWriting:[{module:1,questionCount:27},{module:2,questionCount:27}]};

(async () => {
  const browser = await chromium.launch({headless:true,channel:'chrome'});
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  await page.clock.install();
  page.setDefaultTimeout(20000);
  const runtimeErrors = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  let gradeCalls = 0;
  let failGrade = false;
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    let body = {};
    if (url.pathname === '/api/auth/me') body = {user:null};
    else if (url.pathname === '/api/public/mocks') body = {groups:[{key:'2026',label:'2026',mocks:[complete,{...complete,id:'incomplete',title:'August 2026',math:[{module:1,questionCount:22},{module:2,questionCount:0}]}]}]};
    else if (url.pathname === '/api/public/full-exam') body = {mockTitle:'March 2026'};
    else if (url.pathname === '/api/public/module') {
      const section = url.searchParams.get('section'); const module = Number(url.searchParams.get('module'));
      body = {mockTitle:'March 2026',section,module,minutes:section === 'Math' ? 35 : 32,questions:questions(section,module)};
    } else if (url.pathname === '/api/public/module/grade') {
      gradeCalls++;
      if (failGrade) return route.fulfill({status:503,json:{error:'Connection interrupted. Please retry.'}});
      const {section,module,answers} = route.request().postDataJSON();
      const results = questions(section,module).map(q => ({questionId:q.id,questionText:q.questionText,choices:q.choices,skill:q.skill,difficulty:q.difficulty,
        selectedAnswer:answers[q.id] || null,correctAnswer:'A',isCorrect:answers[q.id] === 'A',rationale:'Answer A is correct.',explanation:'Answer A is correct.'}));
      body = {total:results.length,correctCount:results.filter(r=>r.isCorrect).length,accuracyPct:0,results};
    }
    await route.fulfill({json:body});
  });
  const shot = async name => { if (screenshotDir) {fs.mkdirSync(screenshotDir,{recursive:true}); await page.waitForTimeout(250); await page.screenshot({path:`${screenshotDir}/${name}.png`,fullPage:true});} };
  const visible = async text => { await page.getByText(text,{exact:true}).waitFor({state:'visible'}); };
  const review = async () => {
    await page.getByRole('button',{name:/Question \d+ of \d+/}).click();
    await page.getByRole('button',{name:'Go to Review Page',exact:true}).click();
  };
  const finish = async () => { await review(); await page.getByRole('button',{name:'Finish module & continue',exact:true}).click(); };
  const read = key => page.evaluate(key => JSON.parse(localStorage.getItem(key)),key);
  try {
    await page.goto(base, {waitUntil:'networkidle',timeout:120000});
    await page.getByRole('button',{name:'Full Exam',exact:true}).click();
    await page.getByRole('link',{name:'Start full exam',exact:true}).waitFor();
    assert.equal(await page.getByRole('link',{name:'Start full exam',exact:true}).count(),1);
    await visible('Coming soon · Waiting for all four complete modules');
    await shot('full-exam-library');
    console.log('PASS full-exam catalog and incomplete-paper gate');

    await page.getByRole('link',{name:'Start full exam',exact:true}).click();
    await page.getByRole('radio',{name:/Untimed practice/}).check();
    await shot('mode-chooser');
    await page.getByRole('button',{name:'Start test',exact:true}).click();
    await visible('Section 1, Module 1: Reading and Writing');
    await visible('Untimed');
    await page.getByText('Answer A',{exact:true}).click();
    await page.getByRole('button',{name:'Pause test',exact:true}).click();
    await page.getByRole('dialog').waitFor();
    await shot('paused-test');
    assert.equal((await read(`${fullKey}_module_0`)).answers['Reading and Writing-1-0'],'A');
    await page.getByRole('dialog').getByRole('button',{name:'Save & exit',exact:true}).click();
    await page.waitForURL(base + '/');
    await page.goto(base + `/practice/${fixtureId}/full`);
    await page.getByRole('button',{name:'Resume test',exact:true}).click();
    await visible('Section 1, Module 1: Reading and Writing');
    await review();
    assert.equal(gradeCalls,0,'full exam review must not fetch answers');
    await page.getByRole('button',{name:'Finish module & continue',exact:true}).click();
    await visible('Section 1, Module 2: Reading and Writing');
    await finish();
    await visible('Take a break');
    await visible('10:00');
    await shot('exam-break');
    await page.getByRole('button',{name:'Pause break',exact:true}).click();
    const savedBreak = (await read(fullKey)).breakSeconds;
    await page.getByRole('dialog').getByRole('button',{name:'Save & exit',exact:true}).click();
    await page.waitForURL(base + '/');
    await page.goto(base + `/practice/${fixtureId}/full`);
    await page.getByRole('button',{name:'Resume test',exact:true}).click();
    assert.ok((await read(fullKey)).breakSeconds <= savedBreak);
    await page.getByRole('button',{name:'Skip break & start Math',exact:true}).click();
    await visible('Section 2, Module 1: Math');
    await finish();
    await visible('Section 2, Module 2: Math');
    await finish();
    await visible('Full exam complete');
    assert.equal((await read(fullKey)).step,5);
    assert.equal(Object.keys((await read(fullKey)).results).length,4);
    assert.equal(await page.getByText(' / 98 correct',{exact:false}).count(),1);
    await shot('full-exam-results');
    console.log('PASS all four modules, deferred results, save/resume in modules and break');

    await page.goto(base + `/practice/${fixtureId}/Math/1`);
    await page.getByRole('radio',{name:/Real exam environment/}).check();
    await page.getByRole('button',{name:'Start test',exact:true}).click();
    await visible('Section 2, Module 1: Math');
    assert.equal(await page.evaluate(()=>!!document.fullscreenElement),true);
    await page.clock.fastForward(5000);
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).secondsLeft <= 2095, moduleKey);
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor();
    const pausedTime = (await read(moduleKey)).secondsLeft;
    await page.clock.fastForward(10000);
    assert.equal((await read(moduleKey)).secondsLeft,pausedTime);
    await page.getByRole('button',{name:'Return to fullscreen & resume',exact:true}).click();
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.getByRole('dialog').waitFor();
    await page.getByRole('button',{name:'Return to fullscreen & resume',exact:true}).click();
    await page.evaluate(()=>document.exitFullscreen());
    await page.getByRole('dialog').waitFor();
    console.log('PASS fullscreen entry, Escape, window blur, fullscreen exit, paused timer');

    await page.getByRole('dialog').getByRole('button',{name:'Save & exit',exact:true}).click();
    await page.waitForURL(base + '/');
    await page.goto(base + `/practice/${fixtureId}/Math/1`);
    await page.getByRole('radio',{name:/Real exam environment/}).waitFor();
    assert.equal(await page.getByRole('radio',{name:/Real exam environment/}).count(),1);
    await page.getByRole('button',{name:'Resume test',exact:true}).click();
    failGrade = true;
    await review();
    await page.getByRole('button',{name:'Submit Module',exact:true}).click();
    await visible('Connection interrupted. Please retry.');
    assert.ok(await read(moduleKey));
    failGrade = false;
    await page.getByRole('button',{name:'Return to fullscreen & resume',exact:true}).click();
    await page.waitForFunction(key=>localStorage.getItem(key) === null,moduleKey);
    console.log('PASS exam-mode recovery and submission retry without losing progress');

    await page.goto(base);
    await page.evaluate(({key,moduleKey}) => {
      localStorage.setItem(key,JSON.stringify({version:1,mode:'exam',step:2,breakSeconds:600,results:{}}));
      localStorage.removeItem(moduleKey);
    },{key:fullKey,moduleKey});
    await page.goto(base + `/practice/${fixtureId}/full`);
    await page.getByRole('button',{name:'Resume test',exact:true}).click();
    assert.equal(await page.getByRole('button',{name:'Skip break & start Math',exact:true}).isDisabled(),true);
    await page.clock.fastForward(601000);
    await page.getByRole('button',{name:'Start Math',exact:true}).click();
    await visible('Section 2, Module 1: Math');
    console.log('PASS required 10-minute break in exam mode');

    await page.goto(base + `/practice/${fixtureId}/Math/1`);
    await page.getByRole('radio',{name:/Untimed practice/}).check();
    await page.getByRole('button',{name:'Start test',exact:true}).click();
    const beforeGrades = gradeCalls;
    await page.clock.fastForward(2200000);
    await visible('Untimed');
    assert.equal(gradeCalls,beforeGrades);
    await page.getByRole('button',{name:'Pause test',exact:true}).click();
    await page.evaluate(()=>{ Storage.prototype.setItem = function(){throw new DOMException('Quota exceeded','QuotaExceededError');}; });
    await page.getByRole('dialog').getByRole('button',{name:'Save & exit',exact:true}).click();
    await page.getByRole('dialog').getByRole('alert').waitFor();
    assert.ok(page.url().includes('/Math/1'));
    console.log('PASS untimed mode never auto-submits and failed saving prevents exit');

    await page.goto(base);
    await page.evaluate(key => localStorage.setItem(key, JSON.stringify({mode:'timed',secondsLeft:2,index:0,answers:{},marked:{},crossedOut:{}})), moduleKey);
    await page.goto(base + `/practice/${fixtureId}/Math/1`);
    await page.getByRole('button',{name:'Resume test',exact:true}).click();
    await visible('Section 2, Module 1: Math');
    const beforeAutoSubmit = gradeCalls;
    await page.clock.fastForward(3000);
    await page.waitForFunction(key=>localStorage.getItem(key) === null,moduleKey);
    assert.equal(gradeCalls,beforeAutoSubmit + 1);
    console.log('PASS timed module auto-submits once at zero');

    await page.goto(base + `/practice/${fixtureId}/Math/1`);
    await page.getByRole('radio',{name:/Real exam environment/}).check();
    await page.evaluate(()=>{document.documentElement.requestFullscreen = () => Promise.reject(new Error('Fullscreen permission denied'));});
    await page.getByRole('button',{name:'Start test',exact:true}).click();
    await visible('Fullscreen permission denied');
    assert.equal(await read(moduleKey),null);
    console.log('PASS fullscreen denial leaves the test unstarted');

    await page.setViewportSize({width:390,height:844});
    await page.goto(base);
    await page.getByRole('button',{name:'Full Exam',exact:true}).click();
    await shot('mobile-full-exam-library');
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth <= window.innerWidth));
    console.log('PASS mobile catalog fits the viewport');
    assert.deepEqual(runtimeErrors,[]);
  } catch (error) { await shot('failure'); throw error; }
  finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
