/* ═══════════════════════════════════════════════════════════
   IB WHOLE-CLASS REPORT CARD CHECKER — app.js
   9-column output grouped into 8 category tables.
   No "Unknown Student". No placeholders. No fake corrections.
═══════════════════════════════════════════════════════════ */

const CATEGORIES = [
  { key: 'names',       label: 'Student Names / Pronouns / Copy-Paste Issues' },
  { key: 'spelling',    label: 'Spelling & UK/US Consistency' },
  { key: 'grammar',     label: 'Grammar Mistakes' },
  { key: 'punctuation', label: 'Punctuation, Spacing & Capitalisation' },
  { key: 'tone',        label: 'Negative or Sensitive Language' },
  { key: 'eal',         label: 'Wordiness, Informal Language & EAL-Parent Clarity' },
  { key: 'duplication', label: 'Duplication, Contradiction & Repeated Ideas' },
  { key: 'ib',          label: 'IB Learner Profile / ATL Suggestions' },
];

const NOT_NAMES = new Set([
  'Term','Report','Reports','Card','Cards','Year','Unit','Inquiry',
  'Mathematics','Maths','English','Language','Reading','Writing','Literacy',
  'Numeracy','UOI','Student','Learner','Learning','Teacher','Primary',
  'Secondary','Comments','Progress','ATL','IB','PYP','Exhibition','Central',
  'Idea','Action','Sources','Research','Presentation','Reflection','Grammar',
  'Spelling','Punctuation','During','This','Their','These','They','There',
  'When','While','With','Through','After','Before','Also','Both','Each',
  'Such','That','Which','Who','What','Where','How','His','Her','Its','Our',
  'The','And','But','For','Not','Are','Was','Has','Had','Have','From','Into',
  'More','Some','Other','First','Last','New','Good','Well','Just','Only',
  'Social','Communication','Self','Management','Thinking','Arts','Subject',
  'General','Skills','Skill','Profile','Attribute','Attributes',
  'Developing','Emerging','Secure','Extending','Exceeding','Meeting',
  'Expectations','Overview','Summary','Area','Areas','Strengths','Next',
  'Steps','Overall','Curriculum','Class','School','Section','Additionally',
  'Furthermore','However','Therefore','Moreover','Although','Because',
  'Since','Whilst','Moving','Forward','Spring','Autumn','Summer','Semester',
  'Quarter','Grade','Level','Comment','Feedback','Assessment','Science',
  'History','Geography','Art','Music','Drama','Physical','Education',
  'Achieving','Funfair','She','He','Approaching','Beginning',
]);

const YOO_SOUND = /^(unit|university|unique|uniform|use|user|useful|usual|usage|unity|union|universal|unanimous|utensil|european|one|once|eulogy|euphemism)/i;

const LP_ATTRS   = ['knowledgeable','risk-taker','inquirer','open-minded',
  'reflective','communicator','principled','caring','thinker','balanced'];
const ATL_SKILLS = ['thinking skills','research skills','communication skills',
  'social skills','self-management skills'];

const AREA_PATTERNS = [
  { area: 'Student as a Learner', re: /student as a( )?learner|\bsal\b/i },
  { area: 'Unit of Inquiry',      re: /unit of inquiry|\buoi\b/i },
  { area: 'Maths',                re: /\bmaths?\b|\bmathematics\b|\bnumeracy\b/i },
  { area: 'Language',             re: /\blanguage\b|\benglish\b|\breading\b|\bwriting\b|\bliteracy\b/i },
  { area: 'Science',              re: /\bscience\b/i },
];

/* ── FILE READING ──────────────────────────────────────── */
function readDocx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => mammoth.extractRawText({ arrayBuffer: e.target.result }).then(r => resolve(r.value)).catch(reject);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function readPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lineMap = new Map();
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item.str);
    });
    const lines = [...lineMap.entries()].sort((a,b) => b[0]-a[0])
      .map(([,parts]) => parts.join(' ').trim()).filter(l => l.length > 0);
    pages.push(lines.join('\n'));
  }
  return pages.join('\n\n');
}

/* ── SPELLING AUTO-DETECT ──────────────────────────────── */
const UK_US_PAIRS = [
  { us: /\borganiz(e|es|ed|ing|ation|ations)\b/gi, uk: /\borganis(e|es|ed|ing|ation|ations)\b/gi },
  { us: /\banalyz(e|es|ed|ing)\b/gi,               uk: /\banalys(e|es|ed|ing)\b/gi },
  { us: /\bsummariz(e|es|ed|ing)\b/gi,             uk: /\bsummaris(e|es|ed|ing)\b/gi },
  { us: /\bbehavior(s)?\b/gi,                       uk: /\bbehaviour(s)?\b/gi },
  { us: /\bcenter(s|ed|ing)?\b/gi,                  uk: /\bcentre(s|d|ing)?\b/gi },
  { us: /\bcolor(s|ed|ful)?\b/gi,                   uk: /\bcolour(s|ed|ful)?\b/gi },
  { us: /\bfavorite(s)?\b/gi,                       uk: /\bfavourite(s)?\b/gi },
  { us: /\brecogniz(e|es|ed|ing)\b/gi,              uk: /\brecognis(e|es|ed|ing)\b/gi },
  { us: /\bpracticing\b/gi,                         uk: /\bpractising\b/gi },
];

function detectSpellingStyle(fullText, userSetting) {
  if (userSetting === 'uk') return 'uk';
  if (userSetting === 'us') return 'us';
  let ukCount = 0, usCount = 0;
  for (const pair of UK_US_PAIRS) {
    usCount += (fullText.match(pair.us) || []).length;
    if (pair.uk) ukCount += (fullText.match(pair.uk) || []).length;
  }
  if (ukCount === 0 && usCount === 0) return 'either';
  if (usCount > ukCount * 2) return 'us';
  if (ukCount > usCount * 2) return 'uk';
  return 'mixed';
}

function toUKWord(word) {
  return word
    .replace(/\borganizing\b/gi,'organising').replace(/\borganize(s|d)?\b/gi, m => 'organise'+m.slice(8))
    .replace(/\banalyzing\b/gi,'analysing').replace(/\banalyze(s|d)?\b/gi, m => 'analyse'+m.slice(7))
    .replace(/\bsummarizing\b/gi,'summarising').replace(/\bsummarize(s|d)?\b/gi, m => 'summarise'+m.slice(9))
    .replace(/\bbehavior(s)?\b/gi,'behaviour$1').replace(/\bcenter(s)?\b/gi,'centre$1')
    .replace(/\bcolor(s)?\b/gi,'colour$1').replace(/\bfavorite(s)?\b/gi,'favourite$1')
    .replace(/\brecognizing\b/gi,'recognising').replace(/\brecognize(s|d)?\b/gi, m => 'recognise'+m.slice(9))
    .replace(/\bpracticing\b/gi,'practising');
}

function toUSWord(word) {
  return word
    .replace(/\borganising\b/gi,'organizing').replace(/\borganise(s|d)?\b/gi, m => 'organize'+m.slice(8))
    .replace(/\banalysing\b/gi,'analyzing').replace(/\banalyse(s|d)?\b/gi, m => 'analyze'+m.slice(7))
    .replace(/\bsummarising\b/gi,'summarizing').replace(/\bsummarise(s|d)?\b/gi, m => 'summarize'+m.slice(9))
    .replace(/\bbehaviour(s)?\b/gi,'behavior$1').replace(/\bcentre(s)?\b/gi,'center$1')
    .replace(/\bcolour(s)?\b/gi,'color$1').replace(/\bfavourite(s)?\b/gi,'favorite$1')
    .replace(/\brecognising\b/gi,'recognizing').replace(/\brecognise(s|d)?\b/gi, m => 'recognize'+m.slice(9))
    .replace(/\bpractising\b/gi,'practicing');
}

/* ── HELPERS ───────────────────────────────────────────── */
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── DOCUMENT PARSING ──────────────────────────────────── */
function lineIsArea(line) {
  const t = line.trim();
  if (t.length > 60) return null;
  for (const { area, re } of AREA_PATTERNS) { if (re.test(t)) return area; }
  return null;
}

function lineIsName(line, knownNames) {
  const t = line.trim();
  if (t.length > 55 || t.length < 2) return null;
  if (/[.!?,;:]/.test(t)) return null;
  if (/\b(is|are|was|has|have|can|will|does|the|and|but|for|in|on|at|to|of|a|an)\b/i.test(t)) return null;
  if (knownNames.size > 0) {
    for (const name of knownNames) {
      if (name.toLowerCase() === t.toLowerCase()) return name;
      const first = name.split(' ')[0];
      if (first.length >= 3 && t.toLowerCase() === first.toLowerCase()) return first;
    }
  }
  if (/^[A-Z][a-z]{1,20}(\s[A-Z][a-z]{1,20})?$/.test(t)) {
    const first = t.split(' ')[0];
    if (!NOT_NAMES.has(first) && first.length >= 3) return t;
  }
  return null;
}

function parseDoc(fullText, areaOverride, knownNames) {
  const lines = fullText.split(/\n/), segments = [], warnings = [];
  let student = null, area = null, buf = [];

  function flush() {
    const text = buf.join('\n').trim(); buf = [];
    if (text.length < 25) return;
    if (!student) {
      const inf = inferName(text, knownNames);
      if (!inf) { warnings.push(`Could not identify student name for a section (starts: "${text.substring(0,60)}..."). Section skipped.`); return; }
      student = inf;
    }
    segments.push({ studentName: student, reportArea: area || inferArea(text, areaOverride), text });
  }

  for (const line of lines) {
    const t = line.trim(); if (!t) continue;
    const a = lineIsArea(t);
    const n = a ? null : lineIsName(t, knownNames);
    if (n)      { flush(); student = n; area = null; }
    else if (a) { flush(); area = a; }
    else        { buf.push(t); }
  }
  flush();

  if (segments.length === 0) {
    fullText.split(/\n{2,}/).map(s=>s.trim()).filter(s=>s.length>=25).forEach((block, idx) => {
      const name = inferName(block, knownNames);
      if (!name) { warnings.push(`Section ${idx+1}: could not identify student name — skipped.`); return; }
      segments.push({ studentName: name, reportArea: inferArea(block, areaOverride), text: block });
    });
  }
  return { segments, warnings };
}

function inferName(text, knownNames) {
  const opening = text.substring(0, 220);
  if (knownNames.size > 0) {
    for (const name of knownNames) {
      const first = name.split(' ')[0];
      if (first.length >= 3 && new RegExp(`\\b${escRe(first)}\\b`,'i').test(opening)) return name;
    }
  }
  for (const p of [
    /^([A-Z][a-z]{2,20}(?:\s[A-Z][a-z]{2,20})?)\s+(?:is\b|has\b|shows?\b|demonstrates?\b|continues?\b|works?\b|enjoys?\b|can\b|was\b|will\b|tries?\b|participates?\b|explores?\b)/,
    /^([A-Z][a-z]{2,20}(?:\s[A-Z][a-z]{2,20})?)\s*:/,
  ]) {
    const m = opening.match(p);
    if (m && !NOT_NAMES.has(m[1].split(' ')[0]) && m[1].split(' ')[0].length >= 3) return m[1].trim();
  }
  return null;
}

function inferArea(text, override) {
  if (override && override !== 'auto') {
    return { sal:'Student as a Learner', uoi:'Unit of Inquiry', subject:'Other' }[override] || 'Other';
  }
  for (const { area, re } of AREA_PATTERNS) { if (re.test(text)) return area; }
  return 'Other';
}

/* ── SENTENCE SPLITTING ────────────────────────────────── */
function splitSentences(text) {
  const raw = text.match(/[^.!?]*(?:[.!?]+(?=\s+[A-Z]|\s*$)|[.!?]+)/g) || [text];
  return raw.map(s=>s.trim()).filter(s=>s.length>10);
}

function isGarbled(s) {
  if (s.split(/\s+/).length < 4) return true;
  if (/[A-Z]{6,}/.test(s)) return true;
  if (/\w{22,}/.test(s)) return true;
  return false;
}

/* ── ISSUE BUILDER ─────────────────────────────────────── */
function mk(category, priority, exactSentence, exactError, suggestedFix, improvedSentence, notes) {
  return { category, priority, exactSentence, exactError, suggestedFix,
    improvedSentence: improvedSentence||'', notes: notes||'', confidence:'High' };
}

/* ── CHECKS ────────────────────────────────────────────── */

function checkPronouns(text, studentName) {
  const he  = (text.match(/\b(he|him|his)\b/gi)||[]).length;
  const she = (text.match(/\b(she|her|hers)\b/gi)||[]).length;
  if (he > 0 && she > 0) {
    return [mk('names','High','(Whole comment)',
      `Both "he/him/his" (×${he}) and "she/her" (×${she}) used — likely copy-paste error`,
      `Read through and use one consistent pronoun for ${studentName}.`,
      `(Review all pronouns and make them consistent for ${studentName}.)`
    )];
  }
  return [];
}

function checkWrongName(text, studentName, knownNames) {
  const firstName = studentName.split(' ')[0];
  const re = /\b([A-Z][a-z]{2,20})\b/g;
  const others = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const w = m[1];
    if (w === firstName || NOT_NAMES.has(w) || m.index < 3) continue;
    if (LP_ATTRS.some(a => a.replace('-','') === w.toLowerCase())) continue;
    const count   = (text.match(new RegExp(`\\b${escRe(w)}\\b`,'g'))||[]).length;
    const isKnown = knownNames.size>0 && [...knownNames].some(n=>n.split(' ')[0]===w);
    if (isKnown || count >= 2) others.add(w);
  }
  if (others.size > 0) {
    const nameList = [...others].slice(0,3).join(', ');
    return [mk('names','High','(Whole comment)',
      `Other name(s) found: ${nameList} — possible copy-paste error`,
      `Check every sentence refers to ${studentName}, not another student.`,
      `(Replace any references to ${nameList} with ${studentName}.)`
    )];
  }
  return [];
}

const SPELLING_ERRORS = [
  ['recieve','receive'],['acheive','achieve'],['occured','occurred'],
  ['seperately','separately'],['accomodate','accommodate'],['begining','beginning'],
  ['beleive','believe'],['definately','definitely'],['enviroment','environment'],
  ['grammer','grammar'],['independant','independent'],['knowlege','knowledge'],
  ['neccessary','necessary'],['perseverence','perseverance'],['priviledge','privilege'],
  ['reccommend','recommend'],['responsibilty','responsibility'],['succesful','successful'],
  ['untill','until'],['writting','writing'],['comunication','communication'],
  ['colaborate','collaborate'],['excercise','exercise'],['develope','develop'],
  ['managment','management'],['relfection','reflection'],['recieved','received'],
  ['experiance','experience'],['conncections','connections'],['apporach','approach'],
  ['thier','their'],['truely','truly'],['questoins','questions'],['leanring','learning'],
  ['knowlegeable','knowledgeable'],
];

function checkTypos(sentence) {
  for (const [wrong, right] of SPELLING_ERRORS) {
    const re = new RegExp(`\\b${wrong}\\b`,'i');
    const m  = sentence.match(re);
    if (m) return [mk('spelling','High', sentence,
      `"${m[0]}" — misspelled word`,
      `Change "${m[0]}" to "${right}".`,
      sentence.replace(re, right)
    )];
  }
  return [];
}

function checkSpellingConsistency(sentence, dominantStyle) {
  if (dominantStyle === 'either') return [];
  for (const pair of UK_US_PAIRS) {
    if (dominantStyle === 'uk' || dominantStyle === 'mixed') {
      const m = sentence.match(pair.us);
      if (m) {
        const right = toUKWord(m[0]);
        return [mk('spelling','Medium', sentence,
          `"${m[0]}" — US spelling in a ${dominantStyle==='uk'?'UK English':'mixed'} document`,
          `Change "${m[0]}" to "${right}".`,
          sentence.replace(pair.us, right),
          dominantStyle==='mixed' ? 'Mixed UK/US spelling found across the document. Choose one style.' : ''
        )];
      }
    }
    if (dominantStyle === 'us' && pair.uk) {
      const m = sentence.match(pair.uk);
      if (m) {
        const right = toUSWord(m[0]);
        return [mk('spelling','Medium', sentence,
          `"${m[0]}" — UK spelling in a US English document`,
          `Change "${m[0]}" to "${right}".`,
          sentence.replace(pair.uk, right)
        )];
      }
    }
  }
  return [];
}

function checkAAN(sentence) {
  const re = /\ba\s+([AEIOUaeiou]\w*)/g;
  let m;
  while ((m = re.exec(sentence)) !== null) {
    if (YOO_SOUND.test(m[1])) continue;
    return [mk('grammar','High', sentence,
      `"a ${m[1]}" — should be "an" before a vowel sound`,
      `Change "a" to "an".`,
      sentence.slice(0,m.index)+`an ${m[1]}`+sentence.slice(m.index+m[0].length)
    )];
  }
  return [];
}

function checkSV(sentence) {
  const m1 = sentence.match(/\b([A-Z][a-z]{2,20})\s+(are)\b(?!\s+a\s)/);
  if (m1 && !NOT_NAMES.has(m1[1])) {
    return [mk('grammar','High', sentence,
      `"${m1[0]}" — subject-verb agreement error`,
      `Change "are" to "is".`,
      sentence.replace(m1[0], `${m1[1]} is`)
    )];
  }
  const m2 = sentence.match(/\b(who|that)\s+(enjoy|share|like|love|hate|prefer|need|want|feel|think|know|understand|help|make|take|give|find|keep|leave|begin|show|seem|become|appear)\b/);
  if (m2) {
    const fixed = m2[2]+'s';
    return [mk('grammar','High', sentence,
      `"${m2[0]}" — verb should agree with the singular subject`,
      `Change "${m2[2]}" to "${fixed}".`,
      sentence.replace(m2[0], `${m2[1]} ${fixed}`)
    )];
  }
  return [];
}

function checkSpacing(text) {
  const m = text.match(/([a-zA-Z,])\.([A-Z][a-z])/);
  if (m) {
    return [mk('punctuation','High',
      `"...${m[0]}..."`,
      `"${m[0]}" — missing space after full stop`,
      'Add a space after the full stop.',
      text.replace(/([a-zA-Z,])\.([A-Z][a-z])/g,'$1. $2').substring(0,160)
    )];
  }
  return [];
}

function checkPunct(sentence) {
  const m = sentence.match(/\.\s*\./);
  if (m) return [mk('punctuation','High', sentence,
    `"${m[0]}" — extra full stop`,
    'Remove the extra full stop.',
    sentence.replace(/\.\s*\.(\s|$)/g,'. ').trim()
  )];
  const m2 = sentence.match(/(\w)\s,/);
  if (m2) return [mk('punctuation','Low', sentence,
    `"${m2[0]}" — unnecessary space before comma`,
    'Remove the space before the comma.',
    sentence.replace(/(\w)\s,/g,'$1,')
  )];
  return [];
}

const TONE_RULES = [
  { re: /\b(become[s]?\s+)?dysregulated\b/i,
    error: m => `"${m[0]}" — sensitive clinical language for a parent-facing report`,
    fix: 'Soften the wording and describe the skill being developed.',
    improve: (s, name) => `${name} is continuing to develop strategies to manage focus and emotions during lessons, which will support their learning and help them contribute positively to the classroom environment.` },
  { re: /\bdistracts?\s+others?\b/i,
    error: () => '"distracts others" — sounds negative in a parent-facing report',
    fix: 'Describe the self-management skill being developed.',
    improve: s => s.replace(/distracts?\s+others?\b/i,'is developing the self-management skills to remain focused and contribute positively during lessons') },
  { re: /\btime.?wasting\b/i,
    error: () => '"time-wasting" — too blunt for a report card',
    fix: 'Replace with a professional description.',
    improve: s => s.replace(/time.?wasting\b/i,'is working to develop stronger time-management skills') },
  { re: /\bdoes\s+not\s+care\b/i,
    error: () => '"does not care" — too negative',
    fix: 'Rephrase constructively.',
    improve: s => s.replace(/does\s+not\s+care\b/i,'is encouraged to develop greater engagement with their learning') },
  { re: /\b(is\s+)?lazy\b/i,
    error: () => '"lazy" — character judgement not appropriate in a report',
    fix: 'Describe the learning behaviour that needs developing.',
    improve: s => s.replace(/(is\s+)?lazy\b/i,'is developing greater independence and effort in their work') },
  { re: /\b(is\s+)?rude\b/i,
    error: () => '"rude" — too blunt',
    fix: 'Describe the communication skill that needs developing.',
    improve: s => s.replace(/(is\s+)?rude\b/i,'is encouraged to communicate more respectfully with peers and teachers') },
  { re: /\bbad\s+attitude\b/i,
    error: () => '"bad attitude" — too vague and negative',
    fix: 'Name the specific skill that needs development.',
    improve: s => s.replace(/bad\s+attitude\b/i,'is developing a more positive approach to learning') },
  { re: /\bpoor\s+behavio(u?)r\b/i,
    error: () => '"poor behaviour" — too negative',
    fix: 'Describe the specific self-management skill.',
    improve: s => s.replace(/poor\s+behavio(u?)r\b/i,'is developing greater self-management in the classroom') },
  { re: /\blooking\s+cool\b/i,
    error: () => '"looking cool" — informal and inappropriate',
    fix: 'Describe the behaviour professionally.',
    improve: s => s.replace(/looking\s+cool\b/i,'prioritising social interaction over learning at times') },
  { re: /\bis\s+struggling\s+to\b/i,
    error: () => '"is struggling to" — rephrase as development',
    fix: 'Use "is developing the ability to" instead.',
    improve: s => s.replace(/is\s+struggling\s+to\b/i,'is developing the ability to') },
  { re: /\bstruggles?\s+to\b/i,
    error: () => '"struggles to" — sounds negative',
    fix: 'Use "is working towards" instead.',
    improve: s => s.replace(/struggles?\s+to\b/i,'is working towards') },
  { re: /\brefuses?\s+to\b/i,
    error: () => '"refuses to" — too blunt',
    fix: 'Use "is working on" instead.',
    improve: s => s.replace(/refuses?\s+to\b/i,'is working on') },
  { re: /\bfails?\s+to\b/i,
    error: () => '"fails to" — rephrase as a next step',
    fix: 'Use "is working towards" instead.',
    improve: s => s.replace(/fails?\s+to\b/i,'is working towards') },
  { re: /\bmust\s+try\s+harder\b/i,
    error: () => '"must try harder" — too vague',
    fix: 'Describe the specific skill the student should develop.',
    improve: s => s.replace(/must\s+try\s+harder\b/i,'is encouraged to strengthen focus and effort during independent tasks') },
  { re: /\b(low\s+ability|weak\s+student|low\s+level\s+student)\b/i,
    error: m => `"${m[0]}" — inappropriate label for a report card`,
    fix: 'Describe where the student is in their learning journey positively.',
    improve: (s, n, m) => s.replace(new RegExp(escRe(m[0]),'i'),'continuing to build foundational skills') },
  { re: /\b(challenging|difficult)\s+(behaviour|behavior|student|child)\b/i,
    error: m => `"${m[0]}" — too blunt`,
    fix: 'Name the specific skill area.',
    improve: (s, n, m) => s.replace(new RegExp(escRe(m[0]),'i'),'developing self-management and communication skills') },
];

function checkTone(sentence, studentName) {
  for (const rule of TONE_RULES) {
    const m = sentence.match(rule.re);
    if (!m) continue;
    if (/(challenging|difficult)\s+(task|concept|work|text|question|problem|activity)/i.test(m[0])) continue;
    let improved;
    try { improved = rule.improve(sentence, studentName, m); } catch(e) { improved = sentence; }
    return [mk('tone','High', sentence,
      typeof rule.error==='function' ? rule.error(m) : rule.error,
      rule.fix,
      improved
    )];
  }
  return [];
}

const WORDY = [
  ['has been able to demonstrate an understanding of','understands'],
  ['is able to demonstrate an understanding of','understands'],
  ['has been able to demonstrate','has demonstrated'],
  ['is able to demonstrate','demonstrates'],
  ['has been able to','has'],
  ['is able to','can'],
  ['a variety of different','a variety of'],
  ['due to the fact that','because'],
  ['in order to','to'],
  ['on a regular basis','regularly'],
  ['at this point in time','now'],
  ['for the purpose of','to'],
  ['with regard to','regarding'],
  ['prior to','before'],
  ['in the process of','currently'],
  ['a wide variety of','many'],
];

function checkEAL(sentence) {
  const wc = sentence.split(/\s+/).length;
  if (wc > 35) {
    let improved = sentence
      .replace(/\s*in order to\s*/gi,' to ')
      .replace(/\s*due to the fact that\s*/gi,' because ')
      .replace(/\s*has been able to\s*/gi,' has ')
      .replace(/\s*is able to\s*/gi,' can ');
    if (improved.length > 160) {
      const andIdx = improved.indexOf(' and ', Math.floor(improved.length/2)-30);
      if (andIdx > 0) {
        improved = improved.substring(0,andIdx).trim().replace(/,$/,'') + '. ' +
          improved.substring(andIdx+5).replace(/^\w/,c=>c.toUpperCase()).trim();
      }
    }
    return [mk('eal','Medium', sentence,
      `Sentence has ${wc} words — may be difficult for EAL parents to follow`,
      'Break into two shorter sentences at a natural joining point.',
      improved.trim()
    )];
  }
  for (const [phrase, replacement] of WORDY) {
    const re = new RegExp(escRe(phrase),'i');
    const m  = sentence.match(re);
    if (m) return [mk('eal','Low', sentence,
      `"${m[0]}" — wordy phrase that may be hard for EAL parents`,
      `Replace "${m[0]}" with "${replacement}".`,
      sentence.replace(re, replacement)
    )];
  }
  const infM = sentence.match(/\bThat said,?\s*/);
  if (infM) return [mk('eal','Low', sentence,
    '"That said" — informal transition phrase',
    'Replace with "Moving forward," or "To further strengthen learning,".',
    sentence.replace(/\bThat said,?\s*/,'Moving forward, ')
  )];
  return [];
}

function checkDuplication(sentence) {
  const m1 = sentence.match(/\b(furthermore|moreover)[^.]*\balso\b/i);
  if (m1) return [mk('duplication','Medium', sentence,
    '"furthermore" and "also" in the same sentence — repeated idea',
    'Remove "also" from the sentence.',
    sentence.replace(/\balso\b/,'').replace(/\s{2,}/g,' ')
  )];
  const m2 = sentence.match(/\bpractici(?:ng|ses?)\s+strengthening\b/i);
  if (m2) return [mk('duplication','Medium', sentence,
    `"${m2[0]}" — duplicated verb phrase`,
    'Replace with just "strengthening".',
    sentence.replace(/\bpractici(?:ng|ses?)\s+strengthening\b/i,'strengthening')
  )];
  const m3 = sentence.match(/\b(\w{4,})\s+\1\b/i);
  if (m3 && !['that','this','with','from','into','over','when','then','than','very','just'].includes(m3[1].toLowerCase())) {
    return [mk('duplication','Medium', sentence,
      `"${m3[0]}" — word repeated twice in a row`,
      `Remove the duplicate "${m3[1]}".`,
      sentence.replace(m3[0], m3[1])
    )];
  }
  const SKIP = new Set(['the','a','an','and','or','but','in','on','at','to','of','is','are',
    'was','were','has','have','his','her','their','its','this','with','for','as','by','from',
    'be','been','he','she','they','it','we','you','i','that','which','who','not','more']);
  const words = sentence.toLowerCase().split(/\s+/);
  for (let i=0; i<words.length-5; i++) {
    const w = words[i].replace(/[^a-z]/g,'');
    if (w.length<5 || SKIP.has(w)) continue;
    for (let j=i+1; j<=i+5 && j<words.length; j++) {
      if (words[j].replace(/[^a-z]/g,'') === w) {
        return [mk('duplication','Low', sentence,
          `"${w}" — word repeated within the same sentence`,
          `Remove or replace one instance of "${w}" with a synonym.`,
          `(Revise sentence to avoid repeating "${w}".)`
        )];
      }
    }
  }
  return [];
}

const IB_MAP = [
  { re: /\b(asks?\s+questions?|investigates?|is\s+curious|wonders?\s+about)\b/i,
    imp: n => `${n} demonstrated the attributes of an inquirer by asking thoughtful questions and using them to guide further research.`,
    notes: 'LPA: inquirer; ATL: thinking skills, research skills' },
  { re: /\b(applies?\s+(learning|knowledge)|builds?\s+understanding|understands?\s+the?\s+\w+)\b/i,
    imp: n => `${n} developed conceptual understanding by making connections between the unit concepts and real-life examples.`,
    notes: 'LPA: knowledgeable, thinker; ATL: thinking skills' },
  { re: /\b(shares?\s+ideas?|discusses?\s+(his|her|their)\s+\w+|presents?\s+(his|her|their))\b/i,
    imp: n => `${n} demonstrates strong communication skills by sharing ideas clearly, listening to different perspectives, and contributing positively to discussions.`,
    notes: 'LPA: communicator; ATL: communication skills, social skills' },
  { re: /\b(takes?\s+responsibility|follows?\s+(class\s+)?agreements?|takes?\s+ownership)\b/i,
    imp: n => `${n} demonstrates the attributes of a principled learner by taking responsibility for actions, following class agreements, and contributing respectfully to the learning community.`,
    notes: 'LPA: principled; ATL: self-management skills, social skills' },
  { re: /\b(listens?\s+to\s+(others?|peers?|different)|accepts?\s+feedback|respects?\s+perspectives?)\b/i,
    imp: n => `${n} demonstrates open-mindedness by listening to different perspectives, accepting feedback, and respecting the views of others.`,
    notes: 'LPA: open-minded; ATL: social skills, communication skills' },
  { re: /\b(helps?\s+(others?|classmates?|peers?)|includes?\s+others?|shows?\s+kindness)\b/i,
    imp: n => `${n} demonstrates the attribute of a caring learner by helping others, including peers in activities, and showing kindness in the classroom.`,
    notes: 'LPA: caring; ATL: social skills' },
  { re: /\b(tries?\s+(new|different)\s+strategies?|takes?\s+on\s+challenges?|has\s+a\s+go|perseveres?)\b/i,
    imp: n => `${n} shows the attributes of a risk-taker by trying new strategies, taking on challenges, and persevering when learning is difficult.`,
    notes: 'LPA: risk-taker; ATL: thinking skills, self-management skills' },
  { re: /\b(reflects?\s+on\s+(his|her|their)|uses?\s+feedback\s+to|identifies?\s+next\s+steps?)\b/i,
    imp: n => `${n} demonstrated the attribute of a reflective learner by identifying strengths, using feedback to improve, and setting meaningful next steps.`,
    notes: 'LPA: reflective; ATL: thinking skills, self-management skills' },
  { re: /\b(manages?\s+time|stays?\s+(organised?|organized?|focused)|time\s+management)\b/i,
    imp: n => `${n} demonstrates the attribute of a balanced learner by managing time effectively, staying organised during tasks, and maintaining focus throughout the unit.`,
    notes: 'LPA: balanced; ATL: self-management skills' },
  { re: /\b(works?\s+well\s+with\s+others?|collaborates?|contributes?\s+to\s+(the\s+)?groups?)\b/i,
    imp: n => `${n} demonstrates strong social and communication skills by working respectfully with others, listening to different ideas, and contributing positively during group tasks.`,
    notes: 'ATL: social skills, communication skills; LPA: communicator, caring' },
  { re: /\b(researched?|gathered\s+information|found\s+(information|sources?))\b/i,
    imp: n => `${n} strengthened research skills by gathering relevant information and using it to build understanding of the Unit of Inquiry.`,
    notes: 'ATL: research skills; LPA: knowledgeable, inquirer' },
];

function checkIB(text, sentences, reportArea, studentName) {
  const isIB = reportArea==='Student as a Learner'||reportArea==='Unit of Inquiry';
  if (!isIB) return [];
  const hasLP  = LP_ATTRS.some(a=>text.toLowerCase().includes(a));
  const hasATL = ATL_SKILLS.some(s=>text.toLowerCase().includes(s));
  if (hasLP && hasATL) return [];
  for (const map of IB_MAP) {
    for (const sent of sentences) {
      const m = sent.match(map.re);
      if (m) return [mk('ib','Medium', sent,
        `"${m[0]}" — positive observation that could be linked to IB Learner Profile and ATL language`,
        'Link this behaviour to a specific Learner Profile attribute and ATL skill.',
        map.imp(studentName),
        map.notes
      )];
    }
  }
  if (!hasLP && !hasATL) {
    return [mk('ib','Medium', sentences[0]||'(First sentence)',
      `No IB Learner Profile attribute or ATL skill mentioned in this ${reportArea} comment`,
      'Add a Learner Profile connection to strengthen the IB language.',
      reportArea==='Unit of Inquiry'
        ? `${studentName} developed conceptual understanding by making connections between the unit concepts and real-life examples.`
        : `${studentName} demonstrates strong social and communication skills by contributing positively during group tasks and taking responsibility for learning.`,
      'LPA: knowledgeable, thinker, inquirer, reflective, communicator, caring, principled, balanced, open-minded, risk-taker'
    )];
  }
  return [];
}

/* ── SEGMENT CHECKER ───────────────────────────────────── */
function checkSegment(seg, settings, dominantSpelling) {
  const { studentName, reportArea, text } = seg;
  const { strictness, includeIB, includeEAL, includeTone, knownNames } = settings;
  const sents  = splitSentences(text);
  const clean  = sents.filter(s=>!isGarbled(s));
  let issues   = [];

  issues.push(...checkPronouns(text, studentName));
  issues.push(...checkWrongName(text, studentName, knownNames));
  issues.push(...checkSpacing(text));

  for (const s of clean) {
    issues.push(...checkTypos(s));
    issues.push(...checkSpellingConsistency(s, dominantSpelling));
    issues.push(...checkAAN(s));
    issues.push(...checkSV(s));
    issues.push(...checkPunct(s));
    issues.push(...checkDuplication(s));
    if (includeTone) issues.push(...checkTone(s, studentName));
    if (includeEAL)  issues.push(...checkEAL(s));
  }
  if (includeIB) issues.push(...checkIB(text, clean, reportArea, studentName));

  if (strictness==='light')    issues = issues.filter(i=>i.priority==='High');
  else if (strictness==='balanced') issues = issues.filter(i=>i.priority!=='Low');
  return issues;
}

/* ── RENDER ────────────────────────────────────────────── */
function pClass(p) { return p==='High'?'badge-high':p==='Medium'?'badge-medium':'badge-low'; }

function renderResults(allResults, warnings, mixedSpelling) {
  document.getElementById('extractionWarnings').hidden = true;
  const catEl = document.getElementById('categoryTables');
  catEl.innerHTML = '';

  if (warnings.length > 0) {
    document.getElementById('warningList').innerHTML = warnings.map(w=>`<li>${escHtml(w)}</li>`).join('');
    document.getElementById('extractionWarnings').hidden = false;
  }

  const flat = [];
  if (mixedSpelling) flat.push({ studentName:'(Whole document)', reportArea:'—', category:'spelling',
    priority:'Medium', exactSentence:'(Whole document)',
    exactError:'Mixed UK and US spellings found across the class',
    suggestedFix:'Choose one spelling style (UK or US) and apply it consistently to all reports.',
    improvedSentence:'(Review the whole document and standardise to one spelling style.)', notes:'' });
  allResults.forEach(({ studentName, reportArea, issues }) => {
    issues.forEach(i => flat.push({ studentName, reportArea, ...i }));
  });

  let highC=0,medC=0,lowC=0,okC=0;
  flat.forEach(i => { if(i.priority==='High') highC++; else if(i.priority==='Medium') medC++; else lowC++; });
  allResults.forEach(({ issues }) => { if(issues.length===0) okC++; });

  document.getElementById('summary').innerHTML = `
    <div class="summary-pill pill-red">  <span>${highC}</span>High priority</div>
    <div class="summary-pill pill-amber"><span>${medC}</span>Medium priority</div>
    <div class="summary-pill pill-blue"> <span>${lowC}</span>Low priority</div>
    <div class="summary-pill pill-green"><span>${okC}</span>Sections with no issues</div>
  `;

  CATEGORIES.forEach(({ key, label }) => {
    const catIssues = flat.filter(i=>i.category===key);
    const el = document.createElement('div');
    el.className = 'category-section';

    if (!catIssues.length) {
      el.innerHTML = `<div class="category-header category-ok">
        <span class="cat-icon">&#10003;</span>
        <strong>${escHtml(label)}</strong>
        <span class="cat-ok-msg">No high-confidence issues found</span>
      </div>`;
      catEl.appendChild(el);
      return;
    }

    const badge = catIssues.some(i=>i.priority==='High') ? 'badge-high'
                : catIssues.some(i=>i.priority==='Medium') ? 'badge-medium' : 'badge-low';
    const rows = catIssues.map(iss=>`<tr>
      <td><strong>${escHtml(iss.studentName)}</strong></td>
      <td><span class="area-tag">${escHtml(iss.reportArea)}</span></td>
      <td><span class="badge-pill ${pClass(iss.priority)}">${escHtml(iss.priority)}</span></td>
      <td class="cell-sentence">${escHtml(iss.exactSentence)}</td>
      <td class="cell-error">${escHtml(iss.exactError)}</td>
      <td class="cell-fix">${escHtml(iss.suggestedFix)}</td>
      <td class="cell-improved">${escHtml(iss.improvedSentence)}</td>
      <td class="cell-notes">${escHtml(iss.notes)}</td>
    </tr>`).join('');

    el.innerHTML = `
      <div class="category-header">
        <span class="badge-pill ${badge} cat-count">${catIssues.length}</span>
        <strong>${escHtml(label)}</strong>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Student Name</th><th>Report Area</th><th>Priority</th>
          <th>Exact Sentence from Report</th><th>Exact Error</th>
          <th>Suggested Fix</th><th>Improved Sentence</th><th>Notes / IB-ATL Link</th>
        </tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    catEl.appendChild(el);
  });

  document.getElementById('resultsSection').hidden = false;
  ['downloadPdfBtn','downloadHtmlBtn','downloadCsvBtn'].forEach(id => {
    document.getElementById(id).hidden = false;
  });
  document.getElementById('resultsSection').scrollIntoView({ behavior:'smooth' });
}

/* ── DOWNLOADS ─────────────────────────────────────────── */
function getFlatIssues(allResults, mixedSpelling) {
  const flat = [];
  if (mixedSpelling) flat.push({ studentName:'(Whole document)', reportArea:'—', priority:'Medium',
    category:'spelling', exactSentence:'(Whole document)',
    exactError:'Mixed UK/US spelling', suggestedFix:'Choose one style.',
    improvedSentence:'', notes:'' });
  allResults.forEach(({ studentName, reportArea, issues }) => {
    issues.forEach(i => flat.push({studentName,reportArea,...i}));
  });
  return flat;
}

function downloadPdf(allResults, filename, mixedSpelling) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const dateStr = new Date().toLocaleDateString('en-GB');
  const flat = getFlatIssues(allResults, mixedSpelling);
  let h=0,m=0,l=0;
  flat.forEach(i=>{ if(i.priority==='High')h++; else if(i.priority==='Medium')m++; else l++; });

  doc.setFontSize(16); doc.setTextColor(31,78,121);
  doc.text('IB Report Card Feedback — Whole Class', 14, 15);
  doc.setFontSize(8.5); doc.setTextColor(90,90,90);
  doc.text(`File: ${filename}   Date: ${dateStr}   High: ${h}  Medium: ${m}  Low: ${l}`, 14, 22);
  doc.setTextColor(160,80,0);
  doc.text('High-confidence suggestions only. Complete a teacher read-through before submitting.', 14, 28);

  CATEGORIES.forEach(({ key, label }) => {
    const rows = flat.filter(i=>i.category===key).map(i=>[
      i.studentName, i.reportArea, i.priority,
      i.exactSentence, i.exactError, i.suggestedFix, i.improvedSentence, i.notes
    ]);
    if (!rows.length) return;
    doc.autoTable({
      startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 30) + 6,
      head: [[{ content:label, colSpan:8, styles:{fillColor:[31,78,121],fontSize:9,fontStyle:'bold'}}],
             ['Student','Area','Priority','Exact Sentence','Exact Error','Suggested Fix','Improved Sentence','Notes']],
      body: rows, theme:'striped',
      headStyles: { fillColor:[31,78,121], fontSize:7, cellPadding:2 },
      bodyStyles: { fontSize:6.5, cellPadding:2, valign:'top' },
      columnStyles: {0:{cellWidth:22},1:{cellWidth:22},2:{cellWidth:14},3:{cellWidth:42},4:{cellWidth:38},5:{cellWidth:38},6:{cellWidth:48},7:{cellWidth:28}},
      didParseCell: d => {
        if (d.section==='body'&&d.column.index===2) {
          if(d.cell.raw==='High')  {d.cell.styles.fillColor=[253,232,232];d.cell.styles.textColor=[192,57,43];d.cell.styles.fontStyle='bold';}
          if(d.cell.raw==='Medium'){d.cell.styles.fillColor=[255,248,225];d.cell.styles.textColor=[196,125,0];d.cell.styles.fontStyle='bold';}
          if(d.cell.raw==='Low')   {d.cell.styles.fillColor=[232,241,255];d.cell.styles.textColor=[31,78,121];}
        }
        if(d.section==='body'&&d.column.index===6) d.cell.styles.textColor=[23,107,52];
      }
    });
  });
  doc.save(filename.replace(/\.[^.]+$/,'')+'_feedback.pdf');
}

function downloadHtml(allResults, filename, mixedSpelling) {
  const dateStr = new Date().toLocaleDateString('en-GB');
  const flat = getFlatIssues(allResults, mixedSpelling);
  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Report Card Feedback</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:28px;background:#f5f7fb;font-size:12px}
h1{color:#1f4e79}h2{color:#1f4e79;margin:24px 0 6px;font-size:13px;border-bottom:2px solid #e8f1ff;padding-bottom:4px}
table{width:100%;border-collapse:collapse;background:#fff;margin-bottom:8px}
thead th{background:#1f4e79;color:#fff;padding:7px 10px;text-align:left;font-size:10px}
tbody td{padding:7px 10px;border-bottom:1px solid #edf0f7;vertical-align:top;font-size:11px}
.improved{color:#176b34}.notes{color:#6b7280;font-style:italic}
.warn{background:#fff8e1;border:1px solid #ffe082;color:#725000;padding:10px 14px;border-radius:8px;margin-bottom:12px}
</style></head><body>
<h1>IB Report Card Feedback — Whole Class</h1>
<p style="color:#6b7280">File: ${escHtml(filename)} | Date: ${dateStr}</p>`;
  if (mixedSpelling) html += `<div class="warn">&#9888; Mixed UK/US spelling found. Choose one style and apply consistently.</div>`;
  CATEGORIES.forEach(({ key, label }) => {
    const rows = flat.filter(i=>i.category===key).map(iss =>
      `<tr><td><strong>${escHtml(iss.studentName)}</strong></td><td>${escHtml(iss.reportArea)}</td>
       <td>${escHtml(iss.priority)}</td><td>${escHtml(iss.exactSentence)}</td>
       <td>${escHtml(iss.exactError)}</td><td>${escHtml(iss.suggestedFix)}</td>
       <td class="improved">${escHtml(iss.improvedSentence)}</td>
       <td class="notes">${escHtml(iss.notes)}</td></tr>`);
    if (!rows.length) return;
    html += `<h2>${escHtml(label)}</h2><table>
      <thead><tr><th>Student</th><th>Area</th><th>Priority</th><th>Exact Sentence</th>
        <th>Exact Error</th><th>Suggested Fix</th><th>Improved Sentence</th><th>Notes</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table>`;
  });
  html += `<p class="warn">&#9888; High-confidence suggestions only. Complete a final teacher read-through.</p></body></html>`;
  dl(new Blob([html],{type:'text/html;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.html');
}

function downloadCsv(allResults, filename) {
  const flat    = getFlatIssues(allResults, false);
  const headers = ['Student Name','Report Area','Priority','Issue Category',
    'Exact Sentence from Report','Exact Error','Suggested Fix','Improved Sentence','Notes / IB-ATL Link'];
  const rows = flat.map(i=>[
    i.studentName, i.reportArea, i.priority,
    CATEGORIES.find(c=>c.key===i.category)?.label||i.category,
    i.exactSentence, i.exactError, i.suggestedFix, i.improvedSentence, i.notes
  ]);
  const csv = [headers,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  dl(new Blob([csv],{type:'text/csv;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.csv');
}

function dl(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:name}).click();
  setTimeout(()=>URL.revokeObjectURL(url),3000);
}

/* ── MAIN PROCESS ──────────────────────────────────────── */
async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext==='doc') { alert('Please convert .doc to .docx first.\n\nOpen in Word or Google Docs, then save as .docx.'); return; }

  let fullText;
  try {
    if      (ext==='docx') fullText = await readDocx(file);
    else if (ext==='pdf')  fullText = await readPdf(file);
    else { alert('Please upload a .pdf or .docx file.'); return; }
  } catch(err) {
    alert('Could not read the file. Make sure it is not password-protected.\n\nError: '+err.message);
    return;
  }

  if (!fullText||fullText.trim().length<30) {
    alert('This PDF appears to be scanned or image-based.\n\nPlease export as a text-based PDF or upload a .docx file instead.');
    return;
  }

  const garbledCount = fullText.split('\n').slice(0,12).filter(l=>isGarbled(l)&&l.trim().length>5).length;
  if (garbledCount > 6) {
    alert('The extracted text looks garbled — likely a scanned PDF.\n\nPlease upload a .docx file for accurate results.');
    return;
  }

  const classListRaw = document.getElementById('classListInput').value.trim();
  const knownNames   = new Set(classListRaw.split('\n').map(s=>s.trim()).filter(s=>s.length>=2));

  const settings = {
    strictness:         document.querySelector('input[name="strictness"]:checked')?.value || 'balanced',
    reportTypeOverride: document.getElementById('reportTypeSelect').value,
    spellingPref:       document.querySelector('input[name="spelling"]:checked')?.value || 'auto',
    includeIB:          document.getElementById('chkIB').checked,
    includeEAL:         document.getElementById('chkEAL').checked,
    includeTone:        document.getElementById('chkTone').checked,
    knownNames,
  };

  const dominantSpelling = detectSpellingStyle(fullText, settings.spellingPref);
  const mixedSpelling    = dominantSpelling === 'mixed';
  const { segments, warnings } = parseDoc(fullText, settings.reportTypeOverride, knownNames);

  const allResults = segments.map(seg => ({
    studentName: seg.studentName,
    reportArea:  seg.reportArea,
    issues:      checkSegment(seg, settings, dominantSpelling)
  }));

  renderResults(allResults, warnings, mixedSpelling);
  document.getElementById('downloadPdfBtn').onclick  = () => downloadPdf(allResults, file.name, mixedSpelling);
  document.getElementById('downloadHtmlBtn').onclick = () => downloadHtml(allResults, file.name, mixedSpelling);
  document.getElementById('downloadCsvBtn').onclick  = () => downloadCsv(allResults, file.name);
}

/* ── EVENT LISTENERS ───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const fileInput      = document.getElementById('fileInput');
  const dropZone       = document.getElementById('dropZone');
  const fileNameEl     = document.getElementById('fileName');
  const checkBtn       = document.getElementById('checkBtn');
  const spinner        = document.getElementById('spinner');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsBody   = document.getElementById('settingsBody');
  const settingsArrow  = document.getElementById('settingsArrow');
  let chosenFile = null;

  function setFile(f) { chosenFile=f; fileNameEl.textContent=f?f.name:''; checkBtn.disabled=!f; }

  settingsToggle.addEventListener('click', () => {
    const open = !settingsBody.hidden;
    settingsBody.hidden = open;
    settingsToggle.setAttribute('aria-expanded', String(!open));
    settingsArrow.classList.toggle('open', !open);
  });

  fileInput.addEventListener('change', () => setFile(fileInput.files[0]||null));
  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault(); dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0]; if (f) setFile(f);
  });

  checkBtn.addEventListener('click', async () => {
    if (!chosenFile) return;
    checkBtn.disabled = true; spinner.hidden = false;
    document.getElementById('resultsSection').hidden = true;
    try { await processFile(chosenFile); }
    finally { spinner.hidden=true; checkBtn.disabled=false; }
  });
});
