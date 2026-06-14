/* ═══════════════════════════════════════════════════════════
   IB WHOLE-CLASS REPORT CARD CHECKER — app.js
   Goal: exact sentence → exact error → exact suggested fix
   Runs entirely in the browser. No backend. GitHub Pages safe.
═══════════════════════════════════════════════════════════ */

/* ── EXCLUSION LIST — never treat these as student names ─── */
const NOT_NAMES = new Set([
  'Term','Report','Reports','Card','Cards','Year','Unit','Inquiry',
  'Mathematics','Maths','English','Language','Reading','Writing','UOI',
  'Student','Learner','Learning','Teacher','Primary','Secondary',
  'Comments','Progress','ATL','IB','PYP','Exhibition','Central','Idea',
  'Action','Sources','Research','Presentation','Reflection','Grammar',
  'Spelling','Punctuation','During','This','Their','These','They',
  'There','When','While','With','Through','After','Before','Also',
  'Both','Each','Such','That','Which','Who','What','Where','How',
  'His','Her','Its','Our','The','And','But','For','Not','Are','Was',
  'Has','Had','Have','From','Into','More','Some','Other','First',
  'Last','New','Good','Well','Just','Only','Social','Communication',
  'Self','Management','Thinking','Research','Arts','Subject','General',
  'Skills','Skill','Profile','Attribute','Attributes','Beginning',
  'Developing','Emerging','Secure','Extending','Exceeding','Meeting',
  'Expectations','Overview','Summary','Area','Areas','Strengths',
  'Next','Steps','Overall','Curriculum','Class','School','Section',
  'Additionally','Furthermore','However','Therefore','Moreover',
  'Although','Because','Since','Whilst','Mina','Moving','Forward',
  'Spring','Autumn','Summer','Semester','Quarter','Grade','Level',
  'Comment','Feedback','Assessment','Literacy','Numeracy','Science',
  'History','Geography','Art','Music','Drama','Physical','Education'
]);

/* ── WORDS WHERE "a" IS CORRECT (yoo sound) ─────────────── */
const YOO_SOUND = /^(unit|university|unique|uniform|use|user|useful|usual|usage|unity|union|universal|unanimous|utensil|european|one|once|eulogy|euphemism)/i;

/* ── IB CONSTANTS ────────────────────────────────────────── */
const LP_ATTRS = ['knowledgeable','risk-taker','inquirer','open-minded',
  'reflective','communicator','principled','caring','thinker','balanced'];
const ATL_SKILLS = ['thinking skills','research skills','communication skills',
  'social skills','self-management skills'];

/* ── REPORT AREA KEYWORDS ────────────────────────────────── */
const AREA_PATTERNS = [
  { area: 'Student as a Learner', re: /student as a( )?learner|\bsal\b/i },
  { area: 'Unit of Inquiry',      re: /unit of inquiry|\buoi\b/i },
  { area: 'Maths',                re: /\bmaths?\b|\bmathematics\b|\bnumeracy\b/i },
  { area: 'Language',             re: /\blanguage\b|\benglish\b|\breading\b|\bwriting\b|\bliteracy\b/i },
  { area: 'Science',              re: /\bscience\b/i },
];

/* ═══════════════════════════════════════════════════════════
   FILE READING
═══════════════════════════════════════════════════════════ */
function readDocx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      mammoth.extractRawText({ arrayBuffer: e.target.result })
        .then(r => resolve(r.value))
        .catch(reject);
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

async function readPdf(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page    = await pdf.getPage(i);
    const content = await page.getTextContent();
    const lineMap = new Map();
    content.items.forEach(item => {
      const y = Math.round(item.transform[5]);
      if (!lineMap.has(y)) lineMap.set(y, []);
      lineMap.get(y).push(item.str);
    });
    const lines = [...lineMap.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([, parts]) => parts.join(' ').trim())
      .filter(l => l.length > 0);
    pages.push(lines.join('\n'));
  }
  return pages.join('\n\n');
}

/* ═══════════════════════════════════════════════════════════
   DOCUMENT PARSING — students + report areas
═══════════════════════════════════════════════════════════ */

// Is a single line a report-area heading?
function lineIsAreaHeading(line) {
  const t = line.trim();
  if (t.length > 60) return null;
  for (const { area, re } of AREA_PATTERNS) {
    if (re.test(t)) return area;
  }
  return null;
}

// Is a single line a student-name heading?
function lineIsStudentName(line) {
  const t = line.trim();
  if (t.length > 50 || t.length < 3) return null;
  if (/[.!?,;:]/.test(t)) return null; // has punctuation — not a heading
  if (/\b(is|are|was|has|have|can|will|does|the|and|but|for|in|on|at|to|of|a|an)\b/i.test(t)) return null;
  // Must look like one or two capitalised words
  if (/^[A-Z][a-z]{1,20}(\s[A-Z][a-z]{1,20})?$/.test(t)) {
    const first = t.split(' ')[0];
    if (!NOT_NAMES.has(first)) return t;
  }
  return null;
}

function detectReportAreaFromText(text, override) {
  if (override && override !== 'auto') {
    const map = { sal: 'Student as a Learner', uoi: 'Unit of Inquiry', subject: 'Other' };
    return map[override] || 'Other';
  }
  for (const { area, re } of AREA_PATTERNS) {
    if (re.test(text)) return area;
  }
  return 'Other';
}

/*
  Parse the full document text into an array of:
  { studentName, reportArea, text }
*/
function parseDocument(fullText, reportTypeOverride) {
  const lines = fullText.split(/\n/);
  const segments = [];

  let currentStudent = 'Unknown Student';
  let currentArea    = null;
  let currentLines   = [];

  function flush() {
    const text = currentLines.join('\n').trim();
    if (text.length >= 40) {
      const area = currentArea ||
        detectReportAreaFromText(text, reportTypeOverride) ||
        'Other';
      segments.push({ studentName: currentStudent, reportArea: area, text });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const asName = lineIsStudentName(trimmed);
    const asArea = lineIsAreaHeading(trimmed);

    if (asName && !asArea) {
      flush();
      currentStudent = asName;
      currentArea    = null;
      continue;
    }

    if (asArea) {
      flush();
      currentArea = asArea;
      continue;
    }

    currentLines.push(trimmed);
  }
  flush();

  // If no segments were found (no clear headings), treat whole text as one block
  if (segments.length === 0 && fullText.trim().length > 0) {
    const blocks = fullText.split(/\n{2,}/).map(s => s.trim()).filter(s => s.length >= 40);
    blocks.forEach((block, idx) => {
      const name = detectStudentNameFromText(block) || `Section ${idx + 1}`;
      const area = detectReportAreaFromText(block, reportTypeOverride);
      segments.push({ studentName: name, reportArea: area, text: block });
    });
  }

  return segments;
}

function detectStudentNameFromText(text) {
  const opening = text.substring(0, 180);
  const patterns = [
    /^([A-Z][a-z]{1,14}(?:\s[A-Z][a-z]{1,14})?)\s+(?:is\b|has\b|shows?\b|demonstrates?\b|continues?\b|works?\b|enjoys?\b|can\b|was\b|will\b|loves?\b|tries?\b|participates?\b)/,
    /^([A-Z][a-z]{1,14}(?:\s[A-Z][a-z]{1,14})?)\s*:/,
  ];
  for (const p of patterns) {
    const m = opening.match(p);
    if (m) {
      const first = m[1].split(' ')[0];
      if (!NOT_NAMES.has(first)) return m[1].trim();
    }
  }
  return null;
}

/* ═══════════════════════════════════════════════════════════
   SENTENCE SPLITTING
═══════════════════════════════════════════════════════════ */
function splitSentences(text) {
  // Split on sentence-ending punctuation followed by space + capital, or end of string
  const raw = text.match(/[^.!?]*(?:[.!?]+(?=\s+[A-Z]|\s*$)|[.!?]+)/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 8);
}

/* ═══════════════════════════════════════════════════════════
   HELPER — build an issue object
═══════════════════════════════════════════════════════════ */
function issue(priority, issueType, sentence, errorDesc, suggestedFix, confidence = 'High') {
  return { priority, issueType, sentence, errorDesc, suggestedFix, confidence };
}

/* ═══════════════════════════════════════════════════════════
   CHECK FUNCTIONS
   Each returns [] or [issue, ...]
═══════════════════════════════════════════════════════════ */

/* ── A/AN ──────────────────────────────────────────────── */
function checkAAN(sentence) {
  const issues = [];
  const re = /\ba\s+([AEIOUaeiou]\w*)/g;
  let m;
  while ((m = re.exec(sentence)) !== null) {
    if (YOO_SOUND.test(m[1])) continue;
    const wrong    = `a ${m[1]}`;
    const right    = `an ${m[1]}`;
    const improved = sentence.slice(0, m.index) + right + sentence.slice(m.index + m[0].length);
    issues.push(issue(
      'High', 'Grammar — A/An',
      sentence,
      `"${wrong}" — use "an" before vowel sounds`,
      `Replace with: "${improved}"`
    ));
  }
  return issues.slice(0, 1);
}

/* ── SUBJECT-VERB AGREEMENT ────────────────────────────── */
function checkSubjectVerb(sentence) {
  const issues = [];
  // "[Name] are" → "[Name] is"
  const m1 = sentence.match(/\b([A-Z][a-z]{1,14})\s+(are)\s+(?!a\s)/);
  if (m1 && !NOT_NAMES.has(m1[1])) {
    const improved = sentence.replace(m1[0], `${m1[1]} is `);
    issues.push(issue(
      'High', 'Grammar — Subject-Verb',
      sentence,
      `"${m1[0]}" — subject-verb agreement error`,
      `Replace with: "${improved}"`
    ));
  }
  // "who enjoy" → "who enjoys" (relative clause after singular noun)
  const m2 = sentence.match(/\b(who|that)\s+(enjoy|share|like|love|hate|prefer|need|want|feel|think|know|understand|help|make|take|give|find|keep|leave|begin|show|seem|become|appear)\b/);
  if (m2) {
    const fixed    = m2[2] + 's';
    const improved = sentence.replace(m2[0], `${m2[1]} ${fixed}`);
    issues.push(issue(
      'High', 'Grammar — Subject-Verb',
      sentence,
      `"${m2[0]}" — verb should agree with the singular noun it refers to`,
      `Replace with: "${improved}"`
    ));
  }
  return issues.slice(0, 1);
}

/* ── SPELLING ──────────────────────────────────────────── */
const SPELLING_ERRORS = [
  ['recieve','receive'],['acheive','achieve'],['occured','occurred'],
  ['seperately','separately'],['accomodate','accommodate'],['begining','beginning'],
  ['beleive','believe'],['definately','definitely'],['enviroment','environment'],
  ['grammer','grammar'],['independant','independent'],['knowlege','knowledge'],
  ['neccessary','necessary'],['perseverence','perseverance'],['priviledge','privilege'],
  ['reccommend','recommend'],['responsibilty','responsibility'],['succesful','successful'],
  ['untill','until'],['writting','writing'],['comunication','communication'],
  ['colaborate','collaborate'],['colaboration','collaboration'],['excercise','exercise'],
  ['develope','develop'],['managment','management'],['organistion','organisation'],
  ['relfection','reflection'],['indepenence','independence'],['excell','excel'],
  ['mathmatices','mathematics'],['mathermatics','mathematics'],['recieved','received'],
  ['experiance','experience'],['conncections','connections'],['connectins','connections'],
];

function checkSpelling(sentence) {
  for (const [wrong, right] of SPELLING_ERRORS) {
    const re = new RegExp(`\\b${wrong}\\b`, 'i');
    const m  = sentence.match(re);
    if (m) {
      const improved = sentence.replace(re, right);
      return [issue(
        'High', 'Spelling',
        sentence,
        `"${m[0]}" — misspelled word`,
        `Replace with: "${improved}"`
      )];
    }
  }
  return [];
}

/* ── UK SPELLING ───────────────────────────────────────── */
const UK_SPELLING = [
  [/\banalyze[sd]?\b|\banalyzing\b/gi,   w => w.replace(/z/g, 's').replace(/Z/g, 'S'), 'analyse/analyses/analysing'],
  [/\bsummarize[sd]?\b|\bsummarizing\b/gi, w => w.replace(/z/g,'s').replace(/Z/g,'S'), 'summarise/summarises/summarising'],
  [/\borganize[sd]?\b|\borganizing\b/gi,  w => w.replace(/z/g,'s').replace(/Z/g,'S'), 'organise/organised/organising'],
  [/\bcenter\b/gi,     () => 'centre',    'centre'],
  [/\bcenters\b/gi,    () => 'centres',   'centres'],
  [/\bbehavior\b/gi,   () => 'behaviour', 'behaviour'],
  [/\bbehaviors\b/gi,  () => 'behaviours','behaviours'],
  [/\bcolor\b/gi,      () => 'colour',    'colour'],
  [/\bcolors\b/gi,     () => 'colours',   'colours'],
  [/\bpracticing\b/gi, () => 'practising','practising'],
  [/\bpractice\b/gi,   () => 'practise',  'practise (verb) / practice (noun)'],
  [/\bfavorite\b/gi,   () => 'favourite', 'favourite'],
  [/\brecognize[sd]?\b/gi, w => w.replace(/z/g,'s').replace(/Z/g,'S'), 'recognise'],
  [/\brealize[sd]?\b/gi,   w => w.replace(/z/g,'s').replace(/Z/g,'S'), 'realise'],
];

function checkUKSpelling(sentence) {
  for (const [re, replaceFn, ukForm] of UK_SPELLING) {
    const m = sentence.match(re);
    if (m) {
      const improved = sentence.replace(re, replaceFn);
      return [issue(
        'Medium', 'UK Spelling',
        sentence,
        `"${m[0]}" — use UK English spelling`,
        `Replace with: "${improved}" (UK form: ${ukForm})`
      )];
    }
  }
  return [];
}

/* ── SPACING AFTER FULL STOP ───────────────────────────── */
function checkSpacingAfterStop(text) {
  // word.Word (no space between sentences)
  const m = text.match(/([a-zA-Z,])\.([A-Z][a-z])/);
  if (m) {
    const improved = text.replace(/([a-zA-Z,])\.([A-Z][a-z])/g, '$1. $2');
    return [issue(
      'High', 'Spacing',
      m[0],
      `"${m[0]}" — missing space after full stop`,
      `Add a space: "${improved.match(/([a-zA-Z,])\.\s([A-Z][a-z][^.]*)/)?.[0] || improved}"`
    )];
  }
  return [];
}

/* ── EXTRA PUNCTUATION ─────────────────────────────────── */
function checkExtraPunctuation(sentence) {
  // Double full stop: ". ." or ".."
  const m = sentence.match(/\.\s*\./);
  if (m) {
    const improved = sentence.replace(/\.\s*\.$/, '.').replace(/\.\s*\.(\s)/g, '.$1');
    return [issue(
      'High', 'Punctuation',
      sentence,
      `"${m[0]}" — extra full stop`,
      `Remove the extra full stop: "${improved}"`
    )];
  }
  // Space before comma
  const m2 = sentence.match(/(\w)\s,/);
  if (m2) {
    const improved = sentence.replace(/(\w)\s,/g, '$1,');
    return [issue(
      'Low', 'Punctuation',
      sentence,
      `"${m2[0]}" — unnecessary space before comma`,
      `Remove the space: "${improved}"`
    )];
  }
  return [];
}

/* ── DUPLICATION ───────────────────────────────────────── */
function checkDuplication(sentence) {
  const issues = [];
  // "Furthermore/Moreover/However ... also" redundancy
  const m1 = sentence.match(/\b(furthermore|moreover)[^.]*\balso\b/i);
  if (m1) {
    issues.push(issue(
      'Medium', 'Duplication',
      sentence,
      `"${m1[0].substring(0,60)}..." — "furthermore" and "also" repeat the same idea`,
      `Remove one: either start with "Also," or remove "also" from the sentence.`
    ));
  }
  // "practicing strengthening" — duplicated verb
  const m2 = sentence.match(/\bpractici[ns][gn]\s+strengthening\b/i);
  if (m2) {
    const improved = sentence.replace(/\bpractici[ns][gn]\s+strengthening\b/i, 'strengthening');
    issues.push(issue(
      'Medium', 'Duplication',
      sentence,
      `"${m2[0]}" — duplicated verb phrase`,
      `Replace with: "${improved}"`
    ));
  }
  // "continue to continue" / "continues to continue"
  const m3 = sentence.match(/\bcontinue[sd]?\s+to\s+continue\b/i);
  if (m3) {
    const improved = sentence.replace(m3[0], 'continue');
    issues.push(issue(
      'Medium', 'Duplication',
      sentence,
      `"${m3[0]}" — word repeated unnecessarily`,
      `Replace with: "${improved}"`
    ));
  }
  // Same word repeated within 5 words (excluding common words)
  const words = sentence.toLowerCase().split(/\s+/);
  const SKIP  = new Set(['the','a','an','and','or','but','in','on','at','to','of','is','are',
    'was','were','has','have','had','his','her','their','its','this','that','with','for',
    'as','by','from','be','been','being','he','she','they','it','we','you','i']);
  for (let i = 0; i < words.length - 5; i++) {
    const w = words[i].replace(/[^a-z]/g, '');
    if (w.length < 5 || SKIP.has(w)) continue;
    for (let j = i + 1; j <= i + 5 && j < words.length; j++) {
      if (words[j].replace(/[^a-z]/g, '') === w) {
        issues.push(issue(
          'Low', 'Duplication',
          sentence,
          `"${w}" — word repeated within the same sentence`,
          `Remove or replace the repeated word "${w}" with a synonym or restructure the sentence.`
        ));
        i = j; // skip ahead
        break;
      }
    }
  }
  return issues.slice(0, 1);
}

/* ── NEGATIVE / SENSITIVE TONE ─────────────────────────── */
const TONE_PATTERNS = [
  {
    re: /\b(become[s]?\s+)?dysregulated\b/i,
    why: 'sensitive and direct wording for a report card',
    fix: (s, name) => s.replace(/(become[s]?\s+)?dysregulated/i,
      'continuing to develop strategies to manage focus and emotions during lessons')
  },
  {
    re: /\bdistracts?\s+others?\b/i,
    why: 'can sound negative in a parent-facing report',
    fix: (s) => s.replace(/distracts?\s+others?\b/i,
      'is developing the self-management skills to remain focused during lessons')
  },
  {
    re: /\btime.?wasting\b/i,
    why: 'too blunt for a report card',
    fix: (s) => s.replace(/time.?wasting\b/i, 'is developing time-management skills')
  },
  {
    re: /\bbody\s+language\s+can\s+be\s+(negative|poor|bad)\b/i,
    why: 'body language comments can feel subjective and sensitive',
    fix: (s, name) => `${name || 'This student'} is encouraged to communicate ideas and feelings clearly and positively when working with peers.`
  },
  {
    re: /\bdoes\s+not\s+care\b/i,
    why: 'too negative for a report card — rephrase constructively',
    fix: (s) => s.replace(/does\s+not\s+care\b/i,
      'is encouraged to develop greater engagement with')
  },
  {
    re: /\b(is\s+)?lazy\b/i,
    why: 'character judgement not appropriate in a report card',
    fix: (s) => s.replace(/(is\s+)?lazy\b/i,
      'is developing greater independence and effort in their work')
  },
  {
    re: /\b(is\s+)?rude\b/i,
    why: 'too blunt for a parent-facing report',
    fix: (s) => s.replace(/(is\s+)?rude\b/i,
      'is encouraged to communicate more respectfully with peers and teachers')
  },
  {
    re: /\bbad\s+attitude\b/i,
    why: 'too negative and vague for a report card',
    fix: (s) => s.replace(/bad\s+attitude\b/i,
      'is developing a more positive approach to learning')
  },
  {
    re: /\bpoor\s+behavio(u?)r\b/i,
    why: 'too negative — describe the specific area needing development',
    fix: (s) => s.replace(/poor\s+behavio(u?)r\b/i,
      'is developing greater self-management in the classroom')
  },
  {
    re: /\blooking\s+cool\b/i,
    why: 'informal and not appropriate for a report card',
    fix: (s) => s.replace(/looking\s+cool\b/i,
      'prioritising social interaction over learning at times')
  },
  {
    re: /\bis\s+struggling\s+to\b/i,
    why: '"struggling" can sound negative if not paired with a strategy',
    fix: (s) => s.replace(/is\s+struggling\s+to\b/i,
      'is developing the ability to')
  },
  {
    re: /\bstruggles?\s+to\b/i,
    why: '"struggles" can sound negative if not paired with a strategy',
    fix: (s) => s.replace(/struggles?\s+to\b/i, 'is working towards being able to')
  },
  {
    re: /\brefuses?\s+to\b/i,
    why: '"refuses to" is too blunt for a report card',
    fix: (s) => s.replace(/refuses?\s+to\b/i, 'is working on')
  },
  {
    re: /\bnever\s+(listens?|tries?|completes?|finishes?|engages?)\b/i,
    why: '"never" is too absolute for a report card',
    fix: (s, n, m) => s.replace(m[0], `is developing the habit of ${m[1]}ing`)
  },
  {
    re: /\balways\s+(disrupts?|distracts?|forgets?|fails?|misbehaves?)\b/i,
    why: '"always" with a negative behaviour is too absolute',
    fix: (s, n, m) => s.replace(m[0], `sometimes finds it challenging to avoid ${m[1].replace(/s$/,'')}ing`)
  },
  {
    re: /\bfails?\s+to\b/i,
    why: '"fails to" is too negative — rephrase as a next step',
    fix: (s) => s.replace(/fails?\s+to\b/i, 'is working towards')
  },
  {
    re: /\bmust\s+try\s+harder\b/i,
    why: 'too vague and negative — name the specific skill',
    fix: (s) => s.replace(/must\s+try\s+harder\b/i,
      'is encouraged to strengthen [specific skill]')
  },
];

function checkTone(sentence, studentName) {
  for (const p of TONE_PATTERNS) {
    const m = sentence.match(p.re);
    if (m) {
      let improved;
      try { improved = p.fix(sentence, studentName, m); } catch(e) { improved = sentence; }
      return [issue(
        'High', 'Tone — Sensitive/Negative',
        sentence,
        `"${m[0]}" — ${p.why}`,
        `Replace with: "${improved}"`
      )];
    }
  }
  return [];
}

/* ── PRONOUN MIX-UP ────────────────────────────────────── */
function checkPronounMix(sectionText) {
  const he  = (sectionText.match(/\bhe\b|\bhim\b|\bhis\b/gi) || []).length;
  const she = (sectionText.match(/\bshe\b|\bher\b|\bhers\b/gi) || []).length;
  if (he > 0 && she > 0) {
    return [issue(
      'High', 'Pronoun Mix-up',
      '(Whole comment)',
      `Both "he/him/his" (×${he}) and "she/her" (×${she}) used in the same comment — possible copy-paste error`,
      `Read through the whole comment and make all pronouns consistent for this student.`
    )];
  }
  return [];
}

/* ── WRONG NAME IN COMMENT ─────────────────────────────── */
function checkWrongName(sectionText, studentName) {
  if (!studentName || studentName.startsWith('Section') || studentName === 'Unknown Student') return [];
  const firstName = studentName.split(' ')[0];
  const nameRe    = /\b([A-Z][a-z]{2,14})\b/g;
  let m;
  const others = new Set();
  while ((m = nameRe.exec(sectionText)) !== null) {
    const w = m[1];
    if (w === firstName) continue;
    if (NOT_NAMES.has(w)) continue;
    if (LP_ATTRS.some(a => a.replace('-','').toLowerCase() === w.toLowerCase())) continue;
    // Only flag if it appears inside a sentence (not at the very start of the section)
    if (m.index < 5) continue;
    others.add(w);
  }
  const candidates = [...others].slice(0, 3);
  if (candidates.length >= 2) {
    return [issue(
      'High', 'Wrong Name',
      '(Whole comment)',
      `Other names found mid-comment: ${candidates.join(', ')} — possible copy-paste error`,
      `Check that every sentence in this comment refers to ${studentName}, not to a different student.`
    )];
  }
  return [];
}

/* ── MISSING NEXT STEP ─────────────────────────────────── */
function checkMissingNextStep(sectionText, sentences, studentName) {
  const hasNextStep = /next step|moving forward|is encouraged to|will continue|should (focus|practise|try|explore|work)|to further|to strengthen|to develop|to extend|to build|a goal for|in order to improve/i.test(sectionText);
  if (!hasNextStep && sectionText.split(/\s+/).length > 25) {
    const name = studentName && !studentName.startsWith('Section') ? studentName : 'This student';
    return [issue(
      'Medium', 'Missing Next Step',
      sentences[sentences.length - 1] || '(Last sentence)',
      'No clear next step is included in this comment.',
      `Add a sentence such as: "Moving forward, ${name} is encouraged to [specific skill], which will support further growth in [area]."`
    )];
  }
  return [];
}

/* ── EAL CLARITY ───────────────────────────────────────── */
const WORDY_PHRASES = [
  ['has been able to demonstrate an understanding of', 'understands'],
  ['is able to demonstrate an understanding of', 'understands'],
  ['has been able to demonstrate', 'has demonstrated'],
  ['is able to demonstrate', 'demonstrates'],
  ['has been able to', 'has'],
  ['is able to', 'can'],
  ['a variety of different', 'a variety of'],
  ['due to the fact that', 'because'],
  ['in order to', 'to'],
  ['on a regular basis', 'regularly'],
  ['at this point in time', 'now'],
  ['for the purpose of', 'to'],
  ['with regard to', 'regarding'],
  ['prior to', 'before'],
  ['a wide variety of', 'many'],
  ['in the process of', 'currently'],
  ['practicing strengthening', 'strengthening'],
];

function checkEALClarity(sentence) {
  // Long sentence
  if (sentence.split(/\s+/).length > 35) {
    return [issue(
      'Medium', 'EAL Clarity',
      sentence,
      `Sentence has ${sentence.split(/\s+/).length} words — may be difficult for EAL parents to follow`,
      `Split into two shorter sentences at a natural joining point (e.g. after "and", "which", or "by").`
    )];
  }
  // Wordy phrases
  for (const [phrase, replacement] of WORDY_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const m  = sentence.match(re);
    if (m) {
      const improved = sentence.replace(re, replacement);
      return [issue(
        'Low', 'EAL Clarity',
        sentence,
        `"${m[0]}" — wordy phrase that may be hard for EAL parents to follow`,
        `Replace with: "${improved}"`
      )];
    }
  }
  return [];
}

/* ── IB/ATL LANGUAGE (UOI + SAL only) ─────────────────── */

// Exact mappings from the PDF (sections 12 + 13)
const SAL_MAPPING = [
  {
    re: /\b(works? well with others?|collaborates?|shares? ideas?|contributes? (to )?group|helps? (peers?|classmates?|others?))\b/i,
    improved: n => `${n} demonstrates strong social and communication skills by working respectfully with others, listening to different ideas, and contributing positively during group tasks.`,
    ib: 'ATL: social skills, communication skills; LPA: communicator, caring, open-minded'
  },
  {
    re: /\b(is (organised|organized)|follows? routines?|manages? (materials?|belongings?|time))\b/i,
    improved: n => `${n} demonstrates self-management skills by organising materials, following routines, and taking increasing responsibility for learning.`,
    ib: 'ATL: self-management skills; LPA: balanced, principled'
  },
  {
    re: /\b(needs? to (focus|concentrate)|loses? focus|lacks? focus|is (off|easily) distracted)\b/i,
    improved: n => `Moving forward, ${n} is encouraged to strengthen self-management skills by maintaining focus during independent tasks and using reminders or success criteria to stay on track.`,
    ib: 'ATL: self-management skills; LPA: balanced'
  },
  {
    re: /\b(tries? hard|perseveres?|keeps? (going|trying)|shows? (resilience|determination)|doesn'?t give up)\b/i,
    improved: n => `${n} shows resilience and a positive attitude by continuing to try when learning is challenging.`,
    ib: 'ATL: self-management skills; LPA: risk-taker'
  },
];

const UOI_MAPPING = [
  {
    re: /\b(learned? about (the )?topic|understands? (the )?topic|has (an )?understanding of)\b/i,
    improved: n => `${n} developed conceptual understanding by making connections between the unit concepts and real-life examples.`,
    ib: 'ATL: thinking skills; LPA: knowledgeable, thinker'
  },
  {
    re: /\b(asked? questions?|was curious|wondered|investigated|explored)\b/i,
    improved: n => `${n} demonstrated the attributes of an inquirer by asking thoughtful questions and using them to guide further research.`,
    ib: 'ATL: research skills, thinking skills; LPA: inquirer'
  },
  {
    re: /\b(researched?|found (information|sources?)|gathered information)\b/i,
    improved: n => `${n} strengthened research skills by gathering relevant information and using it to build understanding of the Unit of Inquiry.`,
    ib: 'ATL: research skills; LPA: knowledgeable, inquirer'
  },
  {
    re: /\b(worked? in (a )?groups?|collaborated?|worked? with (peers?|others?|classmates?))\b/i,
    improved: n => `${n} demonstrated social and communication skills by collaborating with peers, listening to different perspectives, and contributing ideas during group inquiry tasks.`,
    ib: 'ATL: social skills, communication skills; LPA: communicator, open-minded'
  },
  {
    re: /\b(reflected? on (his|her|their)? ?learning|used? feedback|identified? strengths?)\b/i,
    improved: n => `${n} demonstrated the attribute of a reflective learner by identifying strengths, considering next steps, and using feedback to improve understanding.`,
    ib: 'ATL: thinking skills, self-management skills; LPA: reflective'
  },
];

function checkIBATL(sectionText, sentences, reportArea, studentName) {
  const isIBSection = reportArea === 'Student as a Learner' || reportArea === 'Unit of Inquiry';
  if (!isIBSection) return [];

  const hasLP  = LP_ATTRS.some(a => sectionText.toLowerCase().includes(a));
  const hasATL = ATL_SKILLS.some(s => sectionText.toLowerCase().includes(s));
  if (hasLP && hasATL) return []; // already has IB language

  const mapping = reportArea === 'Student as a Learner' ? SAL_MAPPING : UOI_MAPPING;
  const name    = (studentName && !studentName.startsWith('Section')) ? studentName : 'This student';

  for (const map of mapping) {
    for (const sent of sentences) {
      const m = sent.match(map.re);
      if (m) {
        return [issue(
          'Medium', 'IB/ATL Language',
          sent,
          `"${m[0]}" — could be expressed with IB Learner Profile and ATL language`,
          `Replace with: "${map.improved(name)}"\nIB / ATL link: ${map.ib}`
        )];
      }
    }
  }

  // No match found but no IB language present
  if (!hasLP && !hasATL) {
    return [issue(
      'Medium', 'IB/ATL Language',
      sentences[0] || '(Opening sentence)',
      `No IB Learner Profile attribute or ATL skill mentioned in this ${reportArea} comment`,
      reportArea === 'Unit of Inquiry'
        ? `Add an IB connection, e.g. "${name} demonstrated the attributes of a [reflective/inquirer] learner by..."`
        : `Add an IB attribute, e.g. "${name} shows the attribute of a [communicator/risk-taker] by..."`
    )];
  }
  return [];
}

/* ═══════════════════════════════════════════════════════════
   ORCHESTRATOR — run all checks on one segment
═══════════════════════════════════════════════════════════ */
function checkSegment(segment, settings) {
  const { studentName, reportArea, text } = segment;
  const { strictness, includeIB, includeEAL, includeTone } = settings;
  const sentences = splitSentences(text);
  let issues      = [];

  // Section-level checks
  issues.push(...checkPronounMix(text));
  issues.push(...checkWrongName(text, studentName));
  issues.push(...checkMissingNextStep(text, sentences, studentName));

  // Per-sentence checks
  for (const sent of sentences) {
    issues.push(...checkAAN(sent));
    issues.push(...checkSubjectVerb(sent));
    issues.push(...checkSpelling(sent));
    issues.push(...checkUKSpelling(sent));
    issues.push(...checkExtraPunctuation(sent));
    issues.push(...checkDuplication(sent));
    if (includeTone) issues.push(...checkTone(sent, studentName));
    if (includeEAL)  issues.push(...checkEALClarity(sent));
  }

  // Spacing check on the full text (spans sentence boundaries)
  issues.push(...checkSpacingAfterStop(text));

  // IB/ATL — only for UOI and SAL
  if (includeIB) issues.push(...checkIBATL(text, sentences, reportArea, studentName));

  // Strictness filter
  if (strictness === 'light')    issues = issues.filter(i => i.priority === 'High');
  else if (strictness === 'balanced') issues = issues.filter(i => i.priority !== 'Low');

  // Cap at 5 per section (all High first)
  const high   = issues.filter(i => i.priority === 'High');
  const medium = issues.filter(i => i.priority === 'Medium');
  const low    = issues.filter(i => i.priority === 'Low');
  let capped   = [...high];
  if (capped.length < 5) capped = capped.concat(medium.slice(0, 5 - capped.length));
  if (capped.length < 5) capped = capped.concat(low.slice(0, 5 - capped.length));

  return capped; // empty array = no issues = section omitted from table
}

/* ═══════════════════════════════════════════════════════════
   RENDER RESULTS
═══════════════════════════════════════════════════════════ */
function priorityClass(p) {
  if (p === 'High')   return 'badge-high';
  if (p === 'Medium') return 'badge-medium';
  return 'badge-low';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderResults(allResults) {
  const tbody     = document.getElementById('tableBody');
  const summaryEl = document.getElementById('summary');
  tbody.innerHTML = '';

  let highC=0, medC=0, lowC=0, okC=0, totalStudents=0;
  const seenStudents = new Set();

  allResults.forEach(({ studentName, reportArea, issues }) => {
    if (!seenStudents.has(studentName)) { seenStudents.add(studentName); totalStudents++; }
    if (issues.length === 0) { okC++; return; }

    issues.forEach((iss, idx) => {
      if      (iss.priority === 'High')   highC++;
      else if (iss.priority === 'Medium') medC++;
      else                                 lowC++;

      // Format Exact Error cell
      const errHtml = `<div class="cell-label">Exact sentence:</div>
        <div class="cell-sentence">"${escHtml(iss.sentence)}"</div>
        <div class="cell-label" style="margin-top:6px">Exact error:</div>
        <div class="cell-error">${escHtml(iss.errorDesc)}</div>`;

      // Format Suggested Fix cell
      const fixHtml = `<div class="cell-fix">${escHtml(iss.suggestedFix).replace(/\n/g,'<br>')}</div>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx === 0 ? `<strong>${escHtml(studentName)}</strong>` : ''}</td>
        <td>${idx === 0 ? `<span class="area-tag">${escHtml(reportArea)}</span>` : ''}</td>
        <td><span class="badge-pill ${priorityClass(iss.priority)}">${escHtml(iss.priority)}</span></td>
        <td>${errHtml}</td>
        <td>${fixHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  const issuesTotal = highC + medC + lowC;
  summaryEl.innerHTML = `
    <div class="summary-pill pill-red">  <span>${highC}</span>High priority</div>
    <div class="summary-pill pill-amber"><span>${medC}</span>Medium priority</div>
    <div class="summary-pill pill-blue"> <span>${lowC}</span>Low priority</div>
    <div class="summary-pill pill-green"><span>${okC}</span>Sections with no issues</div>
  `;

  document.getElementById('resultsSection').hidden = false;
  ['downloadPdfBtn','downloadHtmlBtn','downloadCsvBtn'].forEach(id => {
    document.getElementById(id).hidden = false;
  });
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════
   PDF DOWNLOAD
═══════════════════════════════════════════════════════════ */
function downloadPdf(allResults, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const dateStr = new Date().toLocaleDateString('en-GB');

  let highC=0, medC=0, lowC=0;
  const rows = [];
  allResults.forEach(({ studentName, reportArea, issues }) => {
    if (!issues.length) return;
    issues.forEach((iss, idx) => {
      if      (iss.priority === 'High')   highC++;
      else if (iss.priority === 'Medium') medC++;
      else                                 lowC++;
      rows.push([
        idx === 0 ? studentName : '',
        idx === 0 ? reportArea  : '',
        iss.priority,
        `Exact sentence: "${iss.sentence}"\n\nExact error: ${iss.errorDesc}`,
        iss.suggestedFix
      ]);
    });
  });

  // Header
  doc.setFontSize(17);
  doc.setTextColor(31,78,121);
  doc.text('IB Report Card Feedback — Whole Class', 14, 16);

  doc.setFontSize(8.5);
  doc.setTextColor(90,90,90);
  doc.text(`File: ${filename}    Date: ${dateStr}    Issues: ${highC+medC+lowC} (High: ${highC}  Medium: ${medC}  Low: ${lowC})`, 14, 23);

  doc.setTextColor(160,80,0);
  doc.text('This tool gives high-confidence suggestions only. Please complete a final teacher read-through before submitting reports.', 14, 29);

  doc.autoTable({
    startY: 33,
    head: [['Student Name','Report Area','Priority','Exact Error','Suggested Fix']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor:[31,78,121], fontSize:8, cellPadding:2.5 },
    bodyStyles: { fontSize:7.5, cellPadding:2.5, valign:'top' },
    columnStyles: {
      0: { cellWidth:28 },
      1: { cellWidth:34 },
      2: { cellWidth:18 },
      3: { cellWidth:95 },
      4: { cellWidth:90 }
    },
    didParseCell: data => {
      if (data.section==='body' && data.column.index===2) {
        const p = data.cell.raw;
        if (p==='High')   { data.cell.styles.fillColor=[253,232,232]; data.cell.styles.textColor=[192,57,43]; data.cell.styles.fontStyle='bold'; }
        if (p==='Medium') { data.cell.styles.fillColor=[255,248,225]; data.cell.styles.textColor=[196,125,0]; data.cell.styles.fontStyle='bold'; }
        if (p==='Low')    { data.cell.styles.fillColor=[232,241,255]; data.cell.styles.textColor=[31,78,121]; }
      }
      if (data.section==='body' && data.column.index===4) {
        data.cell.styles.textColor=[23,107,52];
      }
    }
  });

  doc.save(filename.replace(/\.[^.]+$/,'') + '_feedback.pdf');
}

/* ── HTML DOWNLOAD ─────────────────────────────────────── */
function downloadHtml(allResults, filename) {
  const dateStr = new Date().toLocaleDateString('en-GB');
  const rows = allResults.flatMap(({ studentName, reportArea, issues }) => {
    if (!issues.length) return [];
    return issues.map((iss, idx) => `<tr>
      <td>${idx===0 ? `<strong>${escHtml(studentName)}</strong>` : ''}</td>
      <td>${idx===0 ? `<span style="background:#f0f4ff;color:#2d5099;border:1px solid #c5d5f5;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700">${escHtml(reportArea)}</span>` : ''}</td>
      <td><span style="padding:3px 9px;border-radius:99px;font-size:12px;font-weight:700;${pStyle(iss.priority)}">${escHtml(iss.priority)}</span></td>
      <td><strong>Exact sentence:</strong> "${escHtml(iss.sentence)}"<br><br><strong>Exact error:</strong> ${escHtml(iss.errorDesc)}</td>
      <td style="color:#176b34">${escHtml(iss.suggestedFix).replace(/\n/g,'<br>')}</td>
    </tr>`);
  }).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Report Card Feedback</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:28px;background:#f5f7fb;font-size:12px}
h1{color:#1f4e79;margin:0 0 4px}p{color:#6b7280;margin:0 0 16px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 14px rgba(31,78,121,.1)}
thead th{background:#1f4e79;color:#fff;padding:9px 12px;text-align:left;font-size:11px;letter-spacing:.03em}
tbody td{padding:9px 12px;border-bottom:1px solid #edf0f7;vertical-align:top;line-height:1.5}
tbody tr:last-child td{border-bottom:none}tbody tr:hover td{background:#f9fafd}
.note{margin-top:14px;background:#fff8e1;border:1px solid #ffe082;color:#725000;padding:10px 14px;border-radius:8px}</style>
</head><body>
<h1>IB Report Card Feedback — Whole Class</h1>
<p>File: ${escHtml(filename)} &nbsp;|&nbsp; Date: ${dateStr}</p>
<table><thead><tr><th>Student Name</th><th>Report Area</th><th>Priority</th><th>Exact Error</th><th>Suggested Fix</th></tr></thead>
<tbody>${rows}</tbody></table>
<p class="note">&#9888; This tool gives high-confidence suggestions only. Please complete a final teacher read-through before submitting reports.</p>
</body></html>`;

  triggerDownload(new Blob([html],{type:'text/html;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.html');
}

function pStyle(p) {
  if (p==='High')   return 'background:#fde8e8;color:#c0392b;border:1px solid #f5c6c6';
  if (p==='Medium') return 'background:#fff8e1;color:#c47d00;border:1px solid #ffe082';
  return 'background:#e8f1ff;color:#1f4e79;border:1px solid #c3d7f5';
}

/* ── CSV DOWNLOAD ─────────────────────────────────────── */
function downloadCsv(allResults, filename) {
  const headers = ['Student Name','Report Area','Priority','Exact Error','Suggested Fix'];
  const rows    = allResults.flatMap(({ studentName, reportArea, issues }) =>
    issues.map(i => [
      studentName, reportArea, i.priority,
      `Exact sentence: "${i.sentence}" | Exact error: ${i.errorDesc}`,
      i.suggestedFix
    ])
  );
  const csv = [headers,...rows].map(r => r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  triggerDownload(new Blob([csv],{type:'text/csv;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.csv');
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ═══════════════════════════════════════════════════════════
   MAIN PROCESS
═══════════════════════════════════════════════════════════ */
async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'doc') {
    alert('Please convert .doc to .docx first.\n\nOpen the file in Word or Google Docs, then save/download it as .docx and try again.');
    return;
  }

  let fullText;
  try {
    if      (ext === 'docx') fullText = await readDocx(file);
    else if (ext === 'pdf')  fullText = await readPdf(file);
    else { alert('Please upload a .pdf or .docx file.'); return; }
  } catch (err) {
    alert('Could not read the file. Make sure it is not password-protected.\n\nError: ' + err.message);
    return;
  }

  if (!fullText || fullText.trim().length < 30) {
    alert('This PDF looks scanned. Please export it as a text-based PDF or .docx first.\n\nScanned PDFs cannot be read — the text must be selectable in the original file.');
    return;
  }

  const settings = {
    strictness:         document.querySelector('input[name="strictness"]:checked')?.value || 'balanced',
    reportTypeOverride: document.getElementById('reportTypeSelect').value,
    includeIB:          document.getElementById('chkIB').checked,
    includeEAL:         document.getElementById('chkEAL').checked,
    includeTone:        document.getElementById('chkTone').checked,
  };

  const segments   = parseDocument(fullText, settings.reportTypeOverride);
  const allResults = segments.map(seg => ({
    studentName: seg.studentName,
    reportArea:  seg.reportArea,
    issues:      checkSegment(seg, settings)
  }));

  // Only keep segments that have issues, for display
  // (but pass all to download so teacher knows which students were checked)
  renderResults(allResults);

  document.getElementById('downloadPdfBtn').onclick  = () => downloadPdf(allResults, file.name);
  document.getElementById('downloadHtmlBtn').onclick = () => downloadHtml(allResults, file.name);
  document.getElementById('downloadCsvBtn').onclick  = () => downloadCsv(allResults, file.name);
}

/* ═══════════════════════════════════════════════════════════
   EVENT LISTENERS
═══════════════════════════════════════════════════════════ */
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

  function setFile(f) {
    chosenFile = f;
    fileNameEl.textContent = f ? f.name : '';
    checkBtn.disabled = !f;
  }

  settingsToggle.addEventListener('click', () => {
    const open = !settingsBody.hidden;
    settingsBody.hidden = open;
    settingsToggle.setAttribute('aria-expanded', String(!open));
    settingsArrow.classList.toggle('open', !open);
  });

  fileInput.addEventListener('change', () => setFile(fileInput.files[0] || null));

  dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  });

  checkBtn.addEventListener('click', async () => {
    if (!chosenFile) return;
    checkBtn.disabled = true;
    spinner.hidden = false;
    document.getElementById('resultsSection').hidden = true;
    try {
      await processFile(chosenFile);
    } finally {
      spinner.hidden = true;
      checkBtn.disabled = false;
    }
  });
});
