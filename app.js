/* ═══════════════════════════════════════════════════════════
   IB WHOLE-CLASS REPORT CARD CHECKER — app.js  (strict v5)
   High-confidence only. No Unknown Student. No fake fixes.
   Every issue: real sentence → real error → real improvement.
═══════════════════════════════════════════════════════════ */

/* ── 8 CATEGORY GROUPS ──────────────────────────────────── */
const CATEGORIES = [
  { key: 'names',       label: 'Name, Pronoun & Copy-Paste Checks' },
  { key: 'spelling',    label: 'Spelling & Spelling-Style Consistency' },
  { key: 'grammar',     label: 'Grammar Mistakes' },
  { key: 'punctuation', label: 'Punctuation, Spacing & Capitalisation' },
  { key: 'tone',        label: 'Negative or Sensitive Language' },
  { key: 'eal',         label: 'Wordiness, Informal Language & EAL-Parent Clarity' },
  { key: 'duplication', label: 'Duplication, Repeated Words & Contradiction' },
  { key: 'ib',          label: 'IB Learner Profile / ATL Suggestions' },
];

/* ── WORDS THAT ARE NEVER STUDENT NAMES ─────────────────── */
const NOT_NAMES = new Set([
  // IB / school terms
  'Term','Report','Reports','Card','Cards','Year','Unit','Inquiry','Inquirer',
  'Mathematics','Maths','English','Language','Reading','Writing','Literacy',
  'Numeracy','UOI','EAL','ATL','IB','PYP','STEM','PE','Art','Science','Music',
  'Drama','Geography','History','Physical','Education','Technology',
  // roles / categories
  'Student','Learner','Learning','Teacher','Primary','Secondary','Specialist',
  'Profile','Attribute','Attributes','Skills','Skill',
  // levels (never treat as names)
  'Emerging','Developing','Achieving','Extending','Secure','Beginning',
  'Approaching','Meeting','Exceeding','High','Support',
  // common words used in reports
  'Comments','Progress','Assessment','Feedback','Overview','Summary',
  'Area','Areas','Strengths','Steps','Overall','Curriculum','Class','School',
  'Section','Reflection','Presentation','Exhibition','Central','Idea','Action',
  'Sources','Research','Grammar','Spelling','Punctuation','Communication',
  // conjunctions / articles / pronouns used at start of sentences
  'Additionally','Furthermore','However','Therefore','Moreover','Although',
  'Because','Since','Whilst','While','When','During','This','Their','These',
  'They','There','That','Which','Who','What','Where','How','With','Through',
  'After','Before','Also','Both','Each','Such','His','Her','Its','Our',
  'The','And','But','For','Not','Are','Was','Has','Had','Have','From','Into',
  'More','Some','Other','First','Last','New','Good','Well','Just','Only',
  'Moving','Forward','She','He','Spring','Autumn','Summer','Winter','Semester',
  'Quarter','Grade','Level','Social','Self','Management','Thinking','Arts',
  'General','Beginning','Next','Funfair',
]);

/* ── YOO-SOUND WORDS — "a unit" is correct, not "an unit" ─ */
const YOO_SOUND_STARTS = new Set([
  'unit','units','university','universities','unique','uniquely','uniqueness',
  'uniform','uniforms','union','unions','universal','universally','universe',
  'unanimous','unanimously','utensil','utensils','european','euphemism',
  'eulogy','use','user','users','useful','usefully','usefulness','usual',
  'usually','usage','usages','utility','utilities',
]);

/* ── IB CONSTANTS ────────────────────────────────────────── */
const LP_ATTRS   = ['knowledgeable','risk-taker','inquirer','open-minded',
  'reflective','communicator','principled','caring','thinker','balanced'];
const ATL_SKILLS = ['thinking skills','research skills','communication skills',
  'social skills','self-management skills'];

/* ── REPORT AREA DETECTION ───────────────────────────────── */
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
    reader.onload = e => mammoth.extractRawText({ arrayBuffer: e.target.result })
      .then(r => resolve(r.value)).catch(reject);
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
   QUALITY GATE — is the extracted text usable?
═══════════════════════════════════════════════════════════ */
function assessExtractionQuality(fullText) {
  if (!fullText || fullText.trim().length < 40) return 'empty';

  const lines = fullText.split('\n').filter(l => l.trim().length > 5);
  if (lines.length < 3) return 'too_short';

  // Count lines that look like real English sentences
  const sentenceLines = lines.filter(l => {
    const words = l.trim().split(/\s+/);
    if (words.length < 4) return false;
    const avg = words.reduce((s, w) => s + w.replace(/[^a-z]/gi,'').length, 0) / words.length;
    if (avg > 12) return false; // merged words
    if (/[A-Z]{5,}/.test(l)) return false; // all-caps junk
    return true;
  });

  const ratio = sentenceLines.length / lines.length;
  if (ratio < 0.3) return 'garbled'; // most lines look like junk

  return 'ok';
}

/* ═══════════════════════════════════════════════════════════
   SPELLING AUTO-DETECT
═══════════════════════════════════════════════════════════ */
const UK_US_PAIRS = [
  { us: /\borganiz(e|es|ed|ing|ation)\b/gi, uk: /\borganis(e|es|ed|ing|ation)\b/gi, usW:'organize', ukW:'organise' },
  { us: /\banalyz(e|es|ed|ing)\b/gi,        uk: /\banalys(e|es|ed|ing)\b/gi,         usW:'analyze',  ukW:'analyse'  },
  { us: /\bsummariz(e|es|ed|ing)\b/gi,      uk: /\bsummaris(e|es|ed|ing)\b/gi,       usW:'summarize',ukW:'summarise'},
  { us: /\bbehavior(s)?\b/gi,               uk: /\bbehaviour(s)?\b/gi,               usW:'behavior', ukW:'behaviour'},
  { us: /\bcenter(s|ed|ing)?\b/gi,          uk: /\bcentre(s|d|ing)?\b/gi,            usW:'center',   ukW:'centre'   },
  { us: /\bcolor(s|ed|ful)?\b/gi,           uk: /\bcolour(s|ed|ful)?\b/gi,           usW:'color',    ukW:'colour'   },
  { us: /\bfavorite(s)?\b/gi,               uk: /\bfavourite(s)?\b/gi,               usW:'favorite', ukW:'favourite'},
  { us: /\brecogniz(e|es|ed|ing)\b/gi,      uk: /\brecognis(e|es|ed|ing)\b/gi,       usW:'recognize',ukW:'recognise'},
  { us: /\bpracticing\b/gi,                 uk: /\bpractising\b/gi,                  usW:'practicing',ukW:'practising'},
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

function toUK(word, pair) {
  return word.replace(pair.us, m => m.replace(pair.usW.slice(0,4), pair.ukW.slice(0,4)));
}
function toUS(word, pair) {
  return word.replace(pair.uk, m => m.replace(pair.ukW.slice(0,4), pair.usW.slice(0,4)));
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════ */
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══════════════════════════════════════════════════════════
   SENTENCE VALIDATION — before running any check
   Returns true only if the sentence looks like real text.
═══════════════════════════════════════════════════════════ */
function isSentenceClean(sentence) {
  if (!sentence || typeof sentence !== 'string') return false;
  const words = sentence.trim().split(/\s+/);
  if (words.length < 5) return false;
  if (words.length > 80) return false; // probably merged paragraphs
  if (/[A-Z]{5,}/.test(sentence)) return false; // all-caps runs = garbled
  if (/\w{20,}/.test(sentence)) return false; // merged words = garbled

  // Average word length — real English sentences have avg 3–9 chars
  const avgLen = words.reduce((s, w) => s + w.replace(/[^a-zA-Z]/g,'').length, 0) / words.length;
  if (avgLen > 11 || avgLen < 2) return false;

  // Must contain at least one common verb to be a real sentence
  if (!/\b(is|are|was|has|have|can|will|does|did|should|could|would|demonstrates?|shows?|works?|enjoys?|continues?|learns?|develops?|applies?|explores?|understands?|participates?|contributes?|improves?|achieves?|identifies?|completes?|creates?|produces?|uses?|reads?|writes?|solves?|thinks?|makes?|takes?|gives?|finds?|helps?|shares?|listens?|reflects?|manages?|organis|organiz|practis|practic)\b/i.test(sentence)) return false;

  return true;
}

/* ═══════════════════════════════════════════════════════════
   DOCUMENT PARSING
═══════════════════════════════════════════════════════════ */
function lineIsArea(line) {
  const t = line.trim();
  if (t.length > 70) return null;
  for (const { area, re } of AREA_PATTERNS) { if (re.test(t)) return area; }
  return null;
}

function lineIsName(line, knownNames) {
  const t = line.trim();
  if (t.length > 60 || t.length < 2) return null;
  if (/[.!?,;:]/.test(t)) return null;
  // Must not contain common sentence words
  if (/\b(is|are|was|has|have|can|will|does|the|and|but|for|in|on|at|to|of|a|an)\b/i.test(t)) return null;

  // If we have a roster, match against it first (highest confidence)
  if (knownNames.size > 0) {
    for (const name of knownNames) {
      if (name.toLowerCase() === t.toLowerCase()) return name;
      const first = name.split(' ')[0];
      if (first.length >= 3 && t.toLowerCase() === first.toLowerCase()) return first;
    }
  }

  // Without a roster: accept only if it looks like a proper name (capitalised, not a known word)
  if (/^[A-Z][a-z]{1,20}(\s[A-Z][a-z]{1,20})?$/.test(t)) {
    const first = t.split(' ')[0];
    if (!NOT_NAMES.has(first) && first.length >= 3) return t;
  }
  return null;
}

function parseDoc(fullText, areaOverride, knownNames) {
  const lines = fullText.split(/\n/);
  const segments = [], warnings = [];
  let student = null, area = null, buf = [];

  function flush() {
    const text = buf.join('\n').trim(); buf = [];
    if (text.length < 30) return;
    if (!student) {
      const inf = inferName(text, knownNames);
      if (!inf) {
        warnings.push(`Could not identify student name for a section (starts: "${text.substring(0,70)}..."). Section skipped — upload a .docx for cleaner results.`);
        return;
      }
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

  // Fallback: no headings detected — split by blank lines
  if (segments.length === 0) {
    fullText.split(/\n{2,}/).map(s=>s.trim()).filter(s=>s.length>=30).forEach((block, idx) => {
      const name = inferName(block, knownNames);
      if (!name) { warnings.push(`Section ${idx+1}: could not identify student name — skipped.`); return; }
      segments.push({ studentName: name, reportArea: inferArea(block, areaOverride), text: block });
    });
  }
  return { segments, warnings };
}

function inferName(text, knownNames) {
  const opening = text.substring(0, 250);

  // Match known roster names first
  if (knownNames.size > 0) {
    for (const name of knownNames) {
      const first = name.split(' ')[0];
      if (first.length >= 3 && new RegExp(`\\b${escRe(first)}\\b`,'i').test(opening)) return name;
    }
  }

  // Pattern: "Name is/has/shows..." at start of section
  for (const p of [
    /^([A-Z][a-z]{2,20}(?:\s[A-Z][a-z]{2,20})?)\s+(?:is\b|has\b|shows?\b|demonstrates?\b|continues?\b|works?\b|enjoys?\b|can\b|was\b|will\b|tries?\b|participates?\b|explores?\b|applies?\b|engages?\b|reads?\b|writes?\b|creates?\b|achieves?\b|develops?\b)/,
    /^([A-Z][a-z]{2,20}(?:\s[A-Z][a-z]{2,20})?)\s*:/,
  ]) {
    const m = opening.match(p);
    if (m) {
      const first = m[1].split(' ')[0];
      if (!NOT_NAMES.has(first) && first.length >= 3) return m[1].trim();
    }
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

/* ═══════════════════════════════════════════════════════════
   SENTENCE SPLITTING
═══════════════════════════════════════════════════════════ */
function splitSentences(text) {
  const raw = text.match(/[^.!?]*(?:[.!?]+(?=\s+[A-Z]|\s*$)|[.!?]+)/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 10);
}

/* ═══════════════════════════════════════════════════════════
   ISSUE BUILDER
═══════════════════════════════════════════════════════════ */
function mk(category, priority, exactSentence, exactError, suggestedFix, improvedSentence, ibAtlLink) {
  return {
    category, priority, exactSentence, exactError, suggestedFix,
    improvedSentence: improvedSentence || '',
    ibAtlLink: ibAtlLink || '',
    confidence: 'High'
  };
}

/* ═══════════════════════════════════════════════════════════
   CHECKS — each returns [] or [issue]
═══════════════════════════════════════════════════════════ */

/* ── 1. WRONG NAME ────────────────────────────────────────
   ONLY runs when we have a class roster.
   ONLY flags a name that is actually on the roster appearing
   in the wrong student's comment.
   Never flags capitalized words that aren't on the roster.
──────────────────────────────────────────────────────────── */
function checkWrongName(sentences, studentName, knownNames) {
  if (knownNames.size === 0) return []; // no roster = can't check

  const firstName = studentName.split(' ')[0];
  const rosterFirstNames = new Set(
    [...knownNames].map(n => n.split(' ')[0]).filter(n => n !== firstName && n.length >= 3)
  );

  for (const sent of sentences) {
    if (!isSentenceClean(sent)) continue;
    for (const otherFirst of rosterFirstNames) {
      // Match the other student's name as a standalone word in the middle of the sentence
      const re = new RegExp(`\\b${escRe(otherFirst)}\\b`,'g');
      const m  = sent.match(re);
      if (m) {
        // Make sure this isn't at the very start of the sentence (teacher may be comparing)
        const idx = sent.search(re);
        if (idx < 3) continue;

        // Find the correct name for the improved sentence
        const rosterMatch = [...knownNames].find(n => n.split(' ')[0] === otherFirst);
        const improved = sent.replace(re, firstName);
        return [mk('names','High', sent,
          `The name "${otherFirst}" appears in ${studentName}'s comment — possible copy-paste error`,
          `Check whether "${otherFirst}" should be changed to "${studentName}".`,
          improved
        )];
      }
    }
  }
  return [];
}

/* ── 2. PRONOUN MIX — per section, show exact sentences ───
   Find the specific sentences where pronouns conflict.
──────────────────────────────────────────────────────────── */
function checkPronouns(sentences, studentName) {
  const heSents  = sentences.filter(s => isSentenceClean(s) && /\b(he|him|his)\b/i.test(s));
  const sheSents = sentences.filter(s => isSentenceClean(s) && /\b(she|her|hers)\b/i.test(s));

  if (heSents.length > 0 && sheSents.length > 0) {
    // Pick one example sentence from each
    const heEx  = heSents[0];
    const sheEx = sheSents.find(s => s !== heEx) || sheSents[0];
    const example = heEx === sheEx ? heEx : `${heEx} / ${sheEx}`;
    return [mk('names','High', example,
      `This comment mixes "he/him/his" and "she/her" — possible copy-paste error`,
      `Make all pronouns consistent for ${studentName}. Check whether this student uses he/him, she/her, or they/them.`,
      `(Review every sentence and use the correct pronouns for ${studentName} throughout.)`
    )];
  }
  return [];
}

/* ── 3. SPELLING TYPOS ────────────────────────────────────
   High-confidence only. Listed common errors.
──────────────────────────────────────────────────────────── */
const SPELLING_ERRORS = [
  ['recieve','receive'],['recieved','received'],['acheive','achieve'],['acheivement','achievement'],
  ['occured','occurred'],['occurance','occurrence'],['seperate','separate'],['seperately','separately'],
  ['accomodate','accommodate'],['beleive','believe'],['definately','definitely'],
  ['enviroment','environment'],['grammer','grammar'],['independant','independent'],
  ['knowlege','knowledge'],['knowlegeable','knowledgeable'],['neccessary','necessary'],
  ['perseverence','perseverance'],['principaled','principled'],['priviledge','privilege'],
  ['reccommend','recommend'],['resiliance','resilience'],['responsibilty','responsibility'],
  ['communcation','communication'],['collaberation','collaboration'],['succesful','successful'],
  ['untill','until'],['writting','writing'],['develope','develop'],['managment','management'],
  ['relfection','reflection'],['experiance','experience'],['thier','their'],['truely','truly'],
  ['leanring','learning'],['apporach','approach'],['colaborate','collaborate'],
];

function checkTypos(sentence) {
  if (!isSentenceClean(sentence)) return [];
  for (const [wrong, right] of SPELLING_ERRORS) {
    const re = new RegExp(`\\b${wrong}\\b`,'i');
    const m  = sentence.match(re);
    if (m) {
      return [mk('spelling','High', sentence,
        `"${m[0]}" — misspelled word`,
        `Change "${m[0]}" to "${right}".`,
        sentence.replace(re, right)
      )];
    }
  }
  return [];
}

/* ── 4. SPELLING-STYLE CONSISTENCY ───────────────────────
   Only when styles are mixed across the document.
   Shows both UK and US options in the improved sentence.
──────────────────────────────────────────────────────────── */
function checkSpellingConsistency(sentence, dominantStyle) {
  if (dominantStyle === 'either' || dominantStyle === 'us') return [];
  // Only flag when dominant style is uk or mixed (both found in doc)
  if (!isSentenceClean(sentence)) return [];

  for (const pair of UK_US_PAIRS) {
    if (dominantStyle === 'uk' || dominantStyle === 'mixed') {
      const m = sentence.match(pair.us);
      if (m) {
        const ukVersion = sentence.replace(pair.us, mm => mm.replace(pair.usW.slice(0,-1), pair.ukW.slice(0,-1)));
        return [mk('spelling', dominantStyle==='mixed'?'Low':'Medium', sentence,
          `"${m[0]}" — the document uses both UK and US spelling styles (e.g. ${pair.ukW}/${pair.usW})`,
          `Choose one spelling style for the full class set. UK option: change "${m[0]}" to "${m[0].replace(pair.usW.slice(0,-1), pair.ukW.slice(0,-1))}".`,
          `UK option: "${ukVersion}" / US option: keep as is.`,
          ''
        )];
      }
    }
  }
  return [];
}

/* ── 5. A/AN — strict, explicit list only ─────────────────
   Never creates "an a" or "an an".
   Never flags "a Unit", "a UOI", "a university" etc.
──────────────────────────────────────────────────────────── */

// Explicit list of words where "a" is wrong (needs "an")
const NEEDS_AN = /^(understanding|inquiry|excellent|important|interesting|effective|essential|exciting|engaging|opportunity|active|accurate|inclusive|independent|organised|organized|authentic|honest|open\b|overall\b|inquirer\b)/i;

// Explicit list of words where "an" is wrong (needs "a")
const NEEDS_A  = /^(strong\b|great\b|good\b|student\b|significant\b|skilled\b|specific\b|steady\b|structured\b|successful\b|supportive\b|systematic\b)/i;

function checkAAN(sentence) {
  if (!isSentenceClean(sentence)) return [];

  // Check "a [vowel-sound word]" — but ONLY from the explicit list
  const m1 = sentence.match(/\ba\s+(\w+)/gi);
  if (m1) {
    for (const match of m1) {
      const word = match.replace(/^a\s+/i,'');
      // Skip YOO-sound words — "a unit" is correct
      if (YOO_SOUND_STARTS.has(word.toLowerCase())) continue;
      // Only flag if word is in our explicit NEEDS_AN list
      if (NEEDS_AN.test(word)) {
        const re       = new RegExp(`\\ba\\s+${escRe(word)}\\b`,'i');
        const improved = sentence.replace(re, `an ${word}`);
        // Safety: never produce "an a" or "an an"
        if (/\ban\s+a[n]?\b/i.test(improved)) continue;
        return [mk('grammar','High', sentence,
          `"a ${word}" — should be "an" before the vowel sound in "${word}"`,
          `Change "a ${word}" to "an ${word}".`,
          improved
        )];
      }
    }
  }

  // Check "an [consonant-sound word]" — but only from explicit list
  const m2 = sentence.match(/\ban\s+(\w+)/gi);
  if (m2) {
    for (const match of m2) {
      const word = match.replace(/^an\s+/i,'');
      if (NEEDS_A.test(word)) {
        const re       = new RegExp(`\\ban\\s+${escRe(word)}\\b`,'i');
        const improved = sentence.replace(re, `a ${word}`);
        return [mk('grammar','High', sentence,
          `"an ${word}" — should be "a" before the consonant sound in "${word}"`,
          `Change "an ${word}" to "a ${word}".`,
          improved
        )];
      }
    }
  }
  return [];
}

/* ── 6. SUBJECT-VERB AGREEMENT ────────────────────────────
   Only the two most common, high-confidence cases.
──────────────────────────────────────────────────────────── */
function checkSV(sentence, studentName) {
  if (!isSentenceClean(sentence)) return [];

  // "[StudentFirstName] are ..." → "... is ..."
  // Only when the student name is actually in the sentence
  if (studentName) {
    const firstName = studentName.split(' ')[0];
    const m1 = sentence.match(new RegExp(`\\b${escRe(firstName)}\\s+(are)\\b`,'i'));
    if (m1) {
      const improved = sentence.replace(m1[0], `${firstName} is`);
      return [mk('grammar','High', sentence,
        `"${m1[0]}" — should be "is", not "are"`,
        `Change "are" to "is".`,
        improved
      )];
    }
  }

  // "who/that enjoy/share/like..." → "who/that enjoys/shares/likes..."
  const m2 = sentence.match(/\b(who|that)\s+(enjoy|share|like|love|hate|prefer|need|want|feel|think|know|understand|help|make|take|give|find|keep|show|seem|become|appear)\b/);
  if (m2) {
    const fixed    = m2[2] + 's';
    const improved = sentence.replace(m2[0], `${m2[1]} ${fixed}`);
    return [mk('grammar','High', sentence,
      `"${m2[0]}" — the verb should agree with the singular subject`,
      `Change "${m2[2]}" to "${fixed}".`,
      improved
    )];
  }
  return [];
}

/* ── 7. PUNCTUATION — spacing after full stop ─────────────
   Only when the merged text is clearly from a real sentence.
──────────────────────────────────────────────────────────── */
function checkSpacingAfterStop(text) {
  // Pattern: word.CapitalWord (two real words merged by missing space)
  const re = /([a-z]{3,}|[,])\.([A-Z][a-z]{2,})/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    // Confirm the part after the stop looks like a real word, not a heading or abbreviation
    const afterWord = m[2];
    if (NOT_NAMES.has(afterWord) && afterWord.length < 5) continue; // skip "In", "At", etc.

    const snippet  = text.substring(Math.max(0, m.index - 60), m.index + 80);
    const improved = snippet.replace(/([a-z]{3,}|[,])\.([A-Z][a-z]{2,})/g, '$1. $2');
    return [mk('punctuation','High',
      `"...${m[0]}..."`,
      `"${m[0]}" — missing space after full stop`,
      'Add a space after the full stop.',
      improved
    )];
  }
  return [];
}

function checkExtraPunct(sentence) {
  if (!isSentenceClean(sentence)) return [];

  // ". ." or ".." — extra full stop
  const m1 = sentence.match(/\.\s*\./);
  if (m1) {
    const improved = sentence.replace(/\.\s*\.(\s|$)/g, '. ').trim();
    return [mk('punctuation','High', sentence,
      `"${m1[0]}" — extra full stop`,
      'Remove the extra full stop.',
      improved
    )];
  }
  // "word ," — space before comma
  const m2 = sentence.match(/([a-z])\s,/i);
  if (m2) {
    const improved = sentence.replace(/([a-z])\s,/gi, '$1,');
    return [mk('punctuation','Low', sentence,
      `"${m2[0]}" — space before comma`,
      'Remove the space before the comma.',
      improved
    )];
  }
  return [];
}

/* ── 8. DUPLICATION — repeated words/phrases ──────────────
   Handles "a a" as duplication (NOT as an a/an error).
──────────────────────────────────────────────────────────── */
function checkDuplication(sentence) {
  if (!isSentenceClean(sentence)) return [];

  // "furthermore/moreover ... also" — repeated connector
  const m1 = sentence.match(/\b(furthermore|moreover)\b[^.]{0,60}\balso\b/i);
  if (m1) {
    return [mk('duplication','Medium', sentence,
      `"furthermore" and "also" in the same sentence — repeated idea`,
      'Remove "also" from the sentence.',
      sentence.replace(/\balso\b/, '').replace(/\s{2,}/g,' ').trim()
    )];
  }

  // Exact word repeated twice in a row ("the the", "and and", "a a", "to to")
  const m2 = sentence.match(/\b(\w{1,15})\s+\1\b/i);
  if (m2) {
    const dup = m2[1].toLowerCase();
    const improved = sentence.replace(new RegExp(`\\b${escRe(m2[1])}\\s+${escRe(m2[1])}\\b`,'i'), m2[1]);
    return [mk('duplication','High', sentence,
      `"${m2[0]}" — word repeated twice in a row`,
      `Remove the duplicate "${m2[1]}".`,
      improved
    )];
  }

  // Contradiction: same skill described as achieved AND still developing
  const m3 = sentence.match(/\bcan\s+([\w\s]{3,30})\band\s+is\s+learning\s+to\s+\1\b/i);
  if (m3) {
    return [mk('duplication','Medium', sentence,
      `The same skill ("${m3[1].trim()}") is described as both achieved and still developing`,
      'Choose one version: either the student can do it, or is learning to do it.',
      sentence.replace(/\bcan\s+([\w\s]{3,30})\band\s+is\s+learning\s+to\s+\1\b/i,
        `can ${m3[1].trim()} and is developing this skill further`)
    )];
  }

  // Word repeated within 4 words (skip very common short words)
  const SKIP = new Set(['the','a','an','and','or','but','in','on','at','to','of','is','are',
    'was','were','has','have','his','her','their','its','this','with','for','as','by','from',
    'be','been','he','she','they','it','we','you','i','that','which','who','not','more','than']);
  const words = sentence.toLowerCase().replace(/[^a-z\s]/g,' ').split(/\s+/).filter(Boolean);
  for (let i = 0; i < words.length - 4; i++) {
    const w = words[i];
    if (w.length < 5 || SKIP.has(w)) continue;
    for (let j = i + 1; j <= i + 4 && j < words.length; j++) {
      if (words[j] === w) {
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

/* ── 9. TONE / SENSITIVE LANGUAGE ─────────────────────────
   Only when word is used about the student, not a task.
──────────────────────────────────────────────────────────── */
const TONE_RULES = [
  { re: /\b(become[s]?\s+)?dysregulated\b/i,
    err: m => `"${m[0]}" — sensitive clinical language for a parent-facing report`,
    fix: 'Rephrase in a supportive tone focused on strategies and growth.',
    imp: (s, name) => `${name} is continuing to develop strategies to manage focus and emotions during lessons, which will support their learning and help them contribute positively to the classroom environment.` },
  { re: /\bdistracts?\s+others?\b/i,
    err: () => '"distracts others" — can sound negative in a parent-facing report',
    fix: 'Describe the self-management skill being developed instead.',
    imp: s => s.replace(/distracts?\s+others?\b/i, 'is developing the self-management skills to remain focused during lessons') },
  { re: /\btime.?wasting\b/i,
    err: () => '"time-wasting" — too blunt for a report card',
    fix: 'Describe the skill professionally.',
    imp: s => s.replace(/time.?wasting\b/i, 'is working to develop stronger time-management skills') },
  { re: /\bdoes\s+not\s+care\b/i,
    err: () => '"does not care" — too negative',
    fix: 'Rephrase constructively.',
    imp: s => s.replace(/does\s+not\s+care\b/i, 'is encouraged to develop greater engagement with their learning') },
  { re: /\b(is\s+)?lazy\b/i,
    err: () => '"lazy" — character judgement not appropriate in a report',
    fix: 'Describe the specific learning behaviour that needs developing.',
    imp: s => s.replace(/(is\s+)?lazy\b/i, 'is developing greater independence and effort in their work') },
  { re: /\b(is\s+)?rude\b/i,
    err: () => '"rude" — too blunt for a parent-facing report',
    fix: 'Describe the communication skill that needs developing.',
    imp: s => s.replace(/(is\s+)?rude\b/i, 'is encouraged to communicate more respectfully with peers and teachers') },
  { re: /\bbad\s+attitude\b/i,
    err: () => '"bad attitude" — too vague and negative',
    fix: 'Name the specific skill that needs development.',
    imp: s => s.replace(/bad\s+attitude\b/i, 'is developing a more positive approach to learning') },
  { re: /\bpoor\s+behavio(u?)r\b/i,
    err: () => '"poor behaviour" — too negative',
    fix: 'Describe the specific self-management area.',
    imp: s => s.replace(/poor\s+behavio(u?)r\b/i, 'is developing greater self-management in the classroom') },
  { re: /\blooking\s+cool\b/i,
    err: () => '"looking cool" — informal and inappropriate',
    fix: 'Describe the behaviour professionally.',
    imp: s => s.replace(/looking\s+cool\b/i, 'prioritising social interaction over learning at times') },
  { re: /\bis\s+struggling\s+to\b/i,
    err: () => '"is struggling to" — rephrase as development rather than deficit',
    fix: 'Use "is developing the ability to" instead.',
    imp: s => s.replace(/is\s+struggling\s+to\b/i, 'is developing the ability to') },
  { re: /\bstruggles?\s+to\b/i,
    err: () => '"struggles to" — sounds negative; rephrase as progress',
    fix: 'Use "is working towards" instead.',
    imp: s => s.replace(/struggles?\s+to\b/i, 'is working towards') },
  { re: /\brefuses?\s+to\b/i,
    err: () => '"refuses to" — too blunt for a report card',
    fix: 'Use "is working on" or "is developing" instead.',
    imp: s => s.replace(/refuses?\s+to\b/i, 'is working on') },
  { re: /\bfails?\s+to\b/i,
    err: () => '"fails to" — rephrase as a next step rather than failure',
    fix: 'Use "is working towards" instead.',
    imp: s => s.replace(/fails?\s+to\b/i, 'is working towards') },
  { re: /\bmust\s+try\s+harder\b/i,
    err: () => '"must try harder" — too vague',
    fix: 'Name the specific skill or area the student should develop.',
    imp: s => s.replace(/must\s+try\s+harder\b/i, 'is encouraged to strengthen focus and effort during independent tasks') },
  { re: /\b(low\s+ability|weak\s+student|low\s+level\s+student|low\s+ability\s+student)\b/i,
    err: m => `"${m[0]}" — inappropriate label for a report card`,
    fix: 'Describe where the student is in their learning journey in positive, specific terms.',
    imp: (s, n, m) => s.replace(new RegExp(escRe(m[0]),'i'), 'continuing to build foundational skills') },
  { re: /\b(annoying|naughty|disruptive)\b/i,
    err: m => `"${m[0]}" — too blunt or informal for a parent-facing report`,
    fix: 'Describe the specific behaviour and the skill being developed.',
    imp: s => s.replace(/\b(annoying|naughty|disruptive)\b/i, 'working on self-management in the classroom') },
];

function checkTone(sentence, studentName) {
  if (!isSentenceClean(sentence)) return [];

  for (const rule of TONE_RULES) {
    const m = sentence.match(rule.re);
    if (!m) continue;
    // Skip "challenging/difficult task/work/concept" — that's about the content, not the student
    if (/(challenging|difficult)\s+(task|work|concept|text|question|problem|activity|topic|reading)/i.test(sentence)) {
      if (/(challenging|difficult)\b/.test(m[0])) continue;
    }
    let improved;
    try { improved = rule.imp(sentence, studentName, m); } catch(e) { improved = sentence; }
    // Safety: never produce an improved sentence that looks worse than the original
    if (!improved || improved === sentence) continue;
    return [mk('tone','High', sentence,
      typeof rule.err === 'function' ? rule.err(m) : rule.err,
      rule.fix,
      improved
    )];
  }
  return [];
}

/* ── 10. WORDINESS & EAL CLARITY ──────────────────────────
   Threshold: 40 words.
   Only flag if a genuinely shorter improved sentence can be written.
──────────────────────────────────────────────────────────── */
const WORDY_PHRASES = [
  ['has been able to demonstrate an understanding of', 'understands'],
  ['is able to demonstrate an understanding of',       'understands'],
  ['has been able to demonstrate',                     'has demonstrated'],
  ['is able to demonstrate',                           'demonstrates'],
  ['has been able to',                                 'has'],
  ['is able to',                                       'can'],
  ['a variety of different',                           'a variety of'],
  ['due to the fact that',                             'because'],
  ['in order to',                                      'to'],
  ['on a regular basis',                               'regularly'],
  ['at this point in time',                            'now'],
  ['for the purpose of',                               'to'],
  ['with regard to',                                   'regarding'],
  ['prior to',                                         'before'],
  ['in the process of',                                'currently'],
  ['a wide variety of',                                'many'],
  ['at the present time',                              'currently'],
];

function checkEAL(sentence) {
  if (!isSentenceClean(sentence)) return [];

  // Wordy phrases (flag these first — specific and fixable)
  for (const [phrase, replacement] of WORDY_PHRASES) {
    const re = new RegExp(escRe(phrase), 'i');
    const m  = sentence.match(re);
    if (m) {
      const improved = sentence.replace(re, replacement);
      return [mk('eal','Low', sentence,
        `"${m[0]}" — unnecessary phrase that makes the sentence harder to follow`,
        `Replace "${m[0]}" with "${replacement}".`,
        improved
      )];
    }
  }

  // Long sentences (40+ words) — only flag when we can actually shorten it
  const wordCount = sentence.split(/\s+/).length;
  if (wordCount >= 40) {
    // Try to produce a shorter version by removing wordy phrases
    let improved = sentence;
    for (const [phrase, replacement] of WORDY_PHRASES) {
      improved = improved.replace(new RegExp(escRe(phrase),'gi'), replacement);
    }
    // If still long, try splitting at natural break
    if (improved.split(/\s+/).length >= 35) {
      const andIdx = improved.lastIndexOf(' and ', Math.floor(improved.length * 0.6));
      const whichIdx = improved.lastIndexOf(', which ', Math.floor(improved.length * 0.7));
      const breakAt = Math.max(andIdx, whichIdx);
      if (breakAt > 30) {
        const p1 = improved.substring(0, breakAt).trim().replace(/,$/, '') + '.';
        const p2 = improved.substring(breakAt).trim()
          .replace(/^and\s+/i,'').replace(/^,\s*which\s+/i,'This ')
          .replace(/^\w/, c => c.toUpperCase());
        improved = `${p1} ${p2}`;
      }
    }
    if (improved !== sentence && improved.split(/\s+/).length < wordCount - 3) {
      return [mk('eal','Medium', sentence,
        `Sentence has ${wordCount} words — long sentences are harder for EAL parents to follow`,
        'Shorten or split the sentence at a natural joining point.',
        improved.trim()
      )];
    }
    // Can't improve it confidently — skip
  }
  return [];
}

/* ── 11. IB / ATL ─────────────────────────────────────────
   Only for UOI and Student as a Learner.
   Only suggest when it fits naturally with what the teacher wrote.
──────────────────────────────────────────────────────────── */
const IB_MAP = [
  { re: /\b(asks?\s+questions?|investigates?|is\s+curious|wonders?|seeks?\s+answers?)\b/i,
    imp: n => `${n} demonstrated the attributes of an inquirer by asking thoughtful questions and using them to guide further research.`,
    ib:  'ATL: thinking skills, research skills; LPA: inquirer' },
  { re: /\b(applies?\s+(learning|knowledge)|builds?\s+understanding|understands?\s+(concepts?|the\s+central)|explains?\s+(the|how|why)\b)\b/i,
    imp: n => `${n} developed conceptual understanding by making connections between the unit concepts and real-life examples.`,
    ib:  'ATL: thinking skills; LPA: knowledgeable, thinker' },
  { re: /\b(makes?\s+connections?|analyse[sd]?|analyzes?|solves?\s+problems?|compares?|evaluates?)\b/i,
    imp: n => `${n} demonstrates the attributes of a thinker by making connections, analysing information, and applying reasoning to solve problems.`,
    ib:  'ATL: thinking skills; LPA: thinker' },
  { re: /\b(shares?\s+ideas?|explains?\s+(his|her|their|ideas?)|presents?|listens?\s+to\s+(others?|peers?)|discusses?)\b/i,
    imp: n => `${n} demonstrates strong communication skills by sharing ideas clearly, listening to different perspectives, and contributing positively during discussions.`,
    ib:  'ATL: communication skills, social skills; LPA: communicator' },
  { re: /\b(takes?\s+responsibility|follows?\s+(class\s+)?agreements?|makes?\s+positive\s+choices?|takes?\s+ownership)\b/i,
    imp: n => `${n} demonstrates the attributes of a principled learner by taking responsibility for actions, following class agreements, and contributing respectfully to the learning community.`,
    ib:  'ATL: self-management skills, social skills; LPA: principled' },
  { re: /\b(listens?\s+to\s+(others?|peers?|different\s+\w+)|considers?\s+different\s+views?|accepts?\s+feedback|respects?\s+perspectives?)\b/i,
    imp: n => `${n} demonstrates open-mindedness by listening to different perspectives, accepting feedback, and respecting the views of others.`,
    ib:  'ATL: social skills, communication skills; LPA: open-minded' },
  { re: /\b(helps?\s+(others?|classmates?|peers?)|supports?\s+classmates?|shows?\s+kindness|includes?\s+others?)\b/i,
    imp: n => `${n} demonstrates the attribute of a caring learner by helping peers, showing kindness, and contributing to a positive classroom community.`,
    ib:  'ATL: social skills; LPA: caring' },
  { re: /\b(tries?\s+(new|different)\s+strategies?|takes?\s+on\s+challenges?|has\s+a\s+go|participates?\s+when\s+unsure)\b/i,
    imp: n => `${n} shows the attributes of a risk-taker by trying new strategies, taking on challenges, and persevering when learning is difficult.`,
    ib:  'ATL: thinking skills, self-management skills; LPA: risk-taker' },
  { re: /\b(reflects?\s+on\s+(his|her|their|learning)|uses?\s+feedback\s+to|identifies?\s+strengths?|thinks?\s+about\s+next\s+steps?)\b/i,
    imp: n => `${n} demonstrated the attribute of a reflective learner by identifying strengths, using feedback to improve, and thinking about next steps.`,
    ib:  'ATL: thinking skills, self-management skills; LPA: reflective' },
  { re: /\b(manages?\s+time|stays?\s+(organised?|organized?|focused)|balances?\s+tasks?)\b/i,
    imp: n => `${n} demonstrates the attribute of a balanced learner by managing time effectively, staying organised, and maintaining focus throughout the unit.`,
    ib:  'ATL: self-management skills; LPA: balanced' },
  { re: /\b(works?\s+well\s+with\s+others?|collaborates?|contributes?\s+to\s+(the\s+)?groups?|works?\s+in\s+(a\s+)?group)\b/i,
    imp: n => `${n} demonstrates strong social and communication skills by working respectfully with others, listening to different ideas, and contributing positively during group tasks.`,
    ib:  'ATL: social skills, communication skills; LPA: communicator, caring' },
  { re: /\b(researched?|gathered\s+information|found\s+(information|sources?)|collected\s+data)\b/i,
    imp: n => `${n} strengthened research skills by gathering relevant information and using it to build understanding of the Unit of Inquiry.`,
    ib:  'ATL: research skills; LPA: knowledgeable, inquirer' },
];

function checkIB(text, cleanSentences, reportArea, studentName) {
  const isIB = reportArea === 'Student as a Learner' || reportArea === 'Unit of Inquiry';
  if (!isIB) return [];

  const hasLP  = LP_ATTRS.some(a  => text.toLowerCase().includes(a));
  const hasATL = ATL_SKILLS.some(s => text.toLowerCase().includes(s));
  if (hasLP && hasATL) return []; // already has IB language — no suggestion needed

  for (const map of IB_MAP) {
    for (const sent of cleanSentences) {
      const m = sent.match(map.re);
      if (m) {
        return [mk('ib','Medium', sent,
          `"${m[0]}" — positive observation that could be strengthened with IB Learner Profile and ATL language`,
          'Link this behaviour to a specific Learner Profile attribute and ATL skill.',
          map.imp(studentName),
          map.ib
        )];
      }
    }
  }
  return [];
}

/* ═══════════════════════════════════════════════════════════
   SEGMENT CHECKER
   Runs all checks on one student's one report area.
═══════════════════════════════════════════════════════════ */
function checkSegment(seg, settings, dominantSpelling) {
  const { studentName, reportArea, text } = seg;
  const { strictness, includeIB, includeEAL, includeTone, knownNames } = settings;

  const allSentences  = splitSentences(text);
  const cleanSentences = allSentences.filter(s => isSentenceClean(s));

  // If too few clean sentences, extraction is probably garbled — skip
  if (allSentences.length > 3 && cleanSentences.length < allSentences.length * 0.4) return [];

  let issues = [];

  // Section-level: pronouns (uses clean sentences to find examples)
  issues.push(...checkPronouns(cleanSentences, studentName));

  // Section-level: wrong name (uses clean sentences, needs roster)
  issues.push(...checkWrongName(cleanSentences, studentName, knownNames));

  // Full-text: spacing after full stop (scans the whole block)
  issues.push(...checkSpacingAfterStop(text));

  // Per-sentence checks
  for (const s of cleanSentences) {
    issues.push(...checkTypos(s));
    issues.push(...checkSpellingConsistency(s, dominantSpelling));
    issues.push(...checkAAN(s));
    issues.push(...checkSV(s, studentName));
    issues.push(...checkExtraPunct(s));
    issues.push(...checkDuplication(s));
    if (includeTone) issues.push(...checkTone(s, studentName));
    if (includeEAL)  issues.push(...checkEAL(s));
  }

  if (includeIB) issues.push(...checkIB(text, cleanSentences, reportArea, studentName));

  // Remove any issue where the improved sentence looks weird or still has placeholder text
  issues = issues.filter(iss => {
    if (!iss.improvedSentence) return true; // no improved sentence needed (ok)
    if (/\[.*?\]/.test(iss.improvedSentence)) return false; // has placeholder
    if (/Unknown Student/i.test(iss.improvedSentence)) return false;
    if (iss.improvedSentence === iss.exactSentence) return false; // no change = bad fix
    return true;
  });

  // Strictness filter
  if (strictness === 'light')         issues = issues.filter(i => i.priority === 'High');
  else if (strictness === 'balanced') issues = issues.filter(i => i.priority !== 'Low');

  // Cap per section to avoid overwhelming teachers
  const high   = issues.filter(i => i.priority === 'High').slice(0, 4);
  const medium = issues.filter(i => i.priority === 'Medium').slice(0, 3);
  const low    = issues.filter(i => i.priority === 'Low').slice(0, 2);
  return [...high, ...medium, ...low];
}

/* ═══════════════════════════════════════════════════════════
   RENDER RESULTS
═══════════════════════════════════════════════════════════ */
function pClass(p) {
  return p==='High'?'badge-high':p==='Medium'?'badge-medium':'badge-low';
}

function renderResults(allResults, warnings, mixedSpelling) {
  const catEl   = document.getElementById('categoryTables');
  const warnEl  = document.getElementById('extractionWarnings');
  const warnList= document.getElementById('warningList');
  catEl.innerHTML = '';

  if (warnings.length > 0) {
    warnList.innerHTML = warnings.map(w => `<li>${escHtml(w)}</li>`).join('');
    warnEl.hidden = false;
  } else {
    warnEl.hidden = true;
  }

  // Mixed spelling: one document-level row in the spelling table
  const docSpellingRow = mixedSpelling ? {
    studentName:'(Whole document)', reportArea:'—', category:'spelling', priority:'Low',
    exactSentence:'(Whole document)',
    exactError:'The document mixes UK and US spelling styles (e.g. analyse/analyze, organise/organize, behaviour/behavior)',
    suggestedFix:'Choose one spelling style for the full class set. Both UK and US are acceptable — but they must be consistent.',
    improvedSentence:'(Review the whole document and standardise to one spelling style.)',
    ibAtlLink:'', confidence:'High'
  } : null;

  const flat = [];
  if (docSpellingRow) flat.push(docSpellingRow);
  allResults.forEach(({ studentName, reportArea, issues }) => {
    issues.forEach(i => flat.push({ studentName, reportArea, ...i }));
  });

  let highC=0, medC=0, lowC=0, okC=0;
  flat.forEach(i => { if(i.priority==='High') highC++; else if(i.priority==='Medium') medC++; else lowC++; });
  allResults.forEach(({ issues }) => { if(issues.length === 0) okC++; });

  document.getElementById('summary').innerHTML = `
    <div class="summary-pill pill-red">  <span>${highC}</span>High priority</div>
    <div class="summary-pill pill-amber"><span>${medC}</span>Medium priority</div>
    <div class="summary-pill pill-blue"> <span>${lowC}</span>Low priority</div>
    <div class="summary-pill pill-green"><span>${okC}</span>Sections with no issues</div>
  `;

  CATEGORIES.forEach(({ key, label }) => {
    const catIssues = flat.filter(i => i.category === key);
    const el = document.createElement('div');
    el.className = 'category-section';

    if (!catIssues.length) {
      el.innerHTML = `<div class="category-header category-ok">
        <span class="cat-icon">&#10003;</span>
        <strong>${escHtml(label)}</strong>
        <span class="cat-ok-msg">No issues found in this category</span>
      </div>`;
      catEl.appendChild(el);
      return;
    }

    const badge = catIssues.some(i=>i.priority==='High') ? 'badge-high'
                : catIssues.some(i=>i.priority==='Medium') ? 'badge-medium' : 'badge-low';
    const isIB  = key === 'ib';

    const rows = catIssues.map(iss => `<tr>
      <td><strong>${escHtml(iss.studentName)}</strong></td>
      <td><span class="area-tag">${escHtml(iss.reportArea)}</span></td>
      <td><span class="badge-pill ${pClass(iss.priority)}">${escHtml(iss.priority)}</span></td>
      <td class="cell-sentence">${escHtml(iss.exactSentence)}</td>
      <td class="cell-error">${escHtml(iss.exactError)}</td>
      <td class="cell-fix">${escHtml(iss.suggestedFix)}</td>
      <td class="cell-improved">${escHtml(iss.improvedSentence)}</td>
      ${isIB ? `<td class="cell-notes">${escHtml(iss.ibAtlLink)}</td>` : ''}
    </tr>`).join('');

    const extraTh = isIB ? '<th>IB / ATL Link</th>' : '';
    el.innerHTML = `
      <div class="category-header">
        <span class="badge-pill ${badge} cat-count">${catIssues.length}</span>
        <strong>${escHtml(label)}</strong>
      </div>
      <div class="table-wrap">
        <table><thead><tr>
          <th>Student Name</th><th>Report Area</th><th>Priority</th>
          <th>Exact Sentence from Report</th><th>Exact Error</th>
          <th>Suggested Fix</th><th>Improved Sentence</th>${extraTh}
        </tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
    catEl.appendChild(el);
  });

  document.getElementById('resultsSection').hidden = false;
  ['downloadPdfBtn','downloadHtmlBtn','downloadCsvBtn'].forEach(id => {
    document.getElementById(id).hidden = false;
  });
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });
}

/* ═══════════════════════════════════════════════════════════
   DOWNLOADS
═══════════════════════════════════════════════════════════ */
function flattenAll(allResults, mixedSpelling) {
  const flat = [];
  if (mixedSpelling) flat.push({
    studentName:'(Whole document)', reportArea:'—', category:'spelling', priority:'Low',
    exactSentence:'(Whole document)',
    exactError:'Mixed UK/US spelling styles found across the class set',
    suggestedFix:'Choose one style (UK or US) and apply consistently to all reports.',
    improvedSentence:'(Review and standardise to one spelling style.)', ibAtlLink:''
  });
  allResults.forEach(({ studentName, reportArea, issues }) => {
    issues.forEach(i => flat.push({ studentName, reportArea, ...i }));
  });
  return flat;
}

function downloadPdf(allResults, filename, mixedSpelling) {
  const { jsPDF } = window.jspdf;
  const doc     = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  const dateStr = new Date().toLocaleDateString('en-GB');
  const flat    = flattenAll(allResults, mixedSpelling);
  let h=0,m=0,l=0;
  flat.forEach(i => { if(i.priority==='High')h++; else if(i.priority==='Medium')m++; else l++; });

  doc.setFontSize(16); doc.setTextColor(31,78,121);
  doc.text('IB Report Card Feedback — Whole Class', 14, 15);
  doc.setFontSize(8.5); doc.setTextColor(90,90,90);
  doc.text(`File: ${filename}   Date: ${dateStr}   Total: ${h+m+l}   High: ${h}  Medium: ${m}  Low: ${l}`, 14, 22);
  doc.setTextColor(160,80,0);
  doc.text('This tool gives high-confidence suggestions only. Please complete a final teacher read-through before submitting reports.', 14, 28);

  CATEGORIES.forEach(({ key, label }) => {
    const catRows = flat.filter(i => i.category === key);
    if (!catRows.length) return;
    const isIB = key === 'ib';
    const body  = catRows.map(i => isIB
      ? [i.studentName, i.reportArea, i.priority, i.exactSentence, i.exactError, i.suggestedFix, i.improvedSentence, i.ibAtlLink]
      : [i.studentName, i.reportArea, i.priority, i.exactSentence, i.exactError, i.suggestedFix, i.improvedSentence]);
    const headRow = isIB
      ? ['Student','Area','Priority','Exact Sentence','Exact Error','Suggested Fix','Improved Sentence','IB / ATL Link']
      : ['Student','Area','Priority','Exact Sentence','Exact Error','Suggested Fix','Improved Sentence'];
    const colStyles = isIB
      ? {0:{cellWidth:20},1:{cellWidth:20},2:{cellWidth:14},3:{cellWidth:38},4:{cellWidth:34},5:{cellWidth:34},6:{cellWidth:46},7:{cellWidth:28}}
      : {0:{cellWidth:22},1:{cellWidth:22},2:{cellWidth:14},3:{cellWidth:44},4:{cellWidth:40},5:{cellWidth:40},6:{cellWidth:52}};

    doc.autoTable({
      startY: (doc.lastAutoTable ? doc.lastAutoTable.finalY : 30) + 6,
      head: [[{ content:label, colSpan: isIB?8:7, styles:{fillColor:[31,78,121],fontSize:9,fontStyle:'bold'}}], headRow],
      body, theme:'striped',
      headStyles: { fillColor:[31,78,121], fontSize:7, cellPadding:2 },
      bodyStyles: { fontSize:6.5, cellPadding:2, valign:'top' },
      columnStyles: colStyles,
      didParseCell: d => {
        if (d.section==='body' && d.column.index===2) {
          if(d.cell.raw==='High')  {d.cell.styles.fillColor=[253,232,232];d.cell.styles.textColor=[192,57,43];d.cell.styles.fontStyle='bold';}
          if(d.cell.raw==='Medium'){d.cell.styles.fillColor=[255,248,225];d.cell.styles.textColor=[196,125,0];d.cell.styles.fontStyle='bold';}
          if(d.cell.raw==='Low')   {d.cell.styles.fillColor=[232,241,255];d.cell.styles.textColor=[31,78,121];}
        }
        if (d.section==='body' && d.column.index===6) d.cell.styles.textColor=[23,107,52];
      }
    });
  });
  doc.save(filename.replace(/\.[^.]+$/,'') + '_feedback.pdf');
}

function downloadHtml(allResults, filename, mixedSpelling) {
  const dateStr = new Date().toLocaleDateString('en-GB');
  const flat    = flattenAll(allResults, mixedSpelling);
  let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Report Card Feedback</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:28px;background:#f5f7fb;font-size:12px}
h1{color:#1f4e79}h2{color:#1f4e79;margin:24px 0 6px;font-size:13px;border-bottom:2px solid #e8f1ff;padding-bottom:4px}
table{width:100%;border-collapse:collapse;background:#fff;margin-bottom:8px}
thead th{background:#1f4e79;color:#fff;padding:7px 10px;text-align:left;font-size:10px}
tbody td{padding:7px 10px;border-bottom:1px solid #edf0f7;vertical-align:top;font-size:11px;line-height:1.4}
.improved{color:#176b34}.notes{color:#6b7280;font-style:italic}
.warn{background:#fff8e1;border:1px solid #ffe082;color:#725000;padding:10px 14px;border-radius:8px;margin-bottom:12px}
</style></head><body>
<h1>IB Report Card Feedback — Whole Class</h1>
<p style="color:#6b7280">File: ${escHtml(filename)} | Date: ${dateStr}</p>`;

  CATEGORIES.forEach(({ key, label }) => {
    const catRows = flat.filter(i => i.category === key);
    if (!catRows.length) return;
    const isIB = key === 'ib';
    const rows = catRows.map(iss => `<tr>
      <td><strong>${escHtml(iss.studentName)}</strong></td><td>${escHtml(iss.reportArea)}</td>
      <td>${escHtml(iss.priority)}</td><td>${escHtml(iss.exactSentence)}</td>
      <td>${escHtml(iss.exactError)}</td><td>${escHtml(iss.suggestedFix)}</td>
      <td class="improved">${escHtml(iss.improvedSentence)}</td>
      ${isIB ? `<td class="notes">${escHtml(iss.ibAtlLink)}</td>` : ''}
    </tr>`).join('');
    const extraTh = isIB ? '<th>IB / ATL Link</th>' : '';
    html += `<h2>${escHtml(label)}</h2><table>
      <thead><tr><th>Student</th><th>Area</th><th>Priority</th><th>Exact Sentence</th>
        <th>Exact Error</th><th>Suggested Fix</th><th>Improved Sentence</th>${extraTh}</tr></thead>
      <tbody>${rows}</tbody></table>`;
  });
  html += `<p class="warn">&#9888; High-confidence suggestions only. Please complete a final teacher read-through before submitting reports.</p></body></html>`;

  dlBlob(new Blob([html],{type:'text/html;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.html');
}

function downloadCsv(allResults, filename) {
  const flat    = flattenAll(allResults, false);
  const headers = ['Student Name','Report Area','Priority','Issue Category',
    'Exact Sentence from Report','Exact Error','Suggested Fix','Improved Sentence','IB / ATL Link'];
  const rows = flat.map(i => [
    i.studentName, i.reportArea, i.priority,
    CATEGORIES.find(c=>c.key===i.category)?.label || i.category,
    i.exactSentence, i.exactError, i.suggestedFix, i.improvedSentence, i.ibAtlLink||''
  ]);
  const csv = [headers,...rows].map(r => r.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  dlBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.csv');
}

function dlBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href:url, download:name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ═══════════════════════════════════════════════════════════
   MAIN PROCESS
═══════════════════════════════════════════════════════════ */
async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (ext === 'doc') {
    alert('Please convert .doc to .docx first.\n\nOpen in Word or Google Docs, then save/download as .docx and try again.');
    return;
  }

  let fullText;
  try {
    if      (ext === 'docx') fullText = await readDocx(file);
    else if (ext === 'pdf')  fullText = await readPdf(file);
    else { alert('Please upload a .pdf or .docx file.'); return; }
  } catch(err) {
    alert('Could not read the file. Make sure it is not password-protected.\n\nError: ' + err.message);
    return;
  }

  // Quality gate
  const quality = assessExtractionQuality(fullText);
  if (quality === 'empty') {
    alert('No text could be extracted from this file.\n\nIf this is a PDF, it may be scanned. Please export as a text-based PDF or upload the .docx version.');
    return;
  }
  if (quality === 'too_short') {
    alert('Very little text was extracted from this file. The results may not be reliable.\n\nFor best results, please upload the .docx version.');
    return;
  }
  if (quality === 'garbled') {
    alert('The extracted text looks garbled or mixed up — this often happens with scanned PDFs or PDFs exported from certain table layouts.\n\nPlease upload the .docx version for accurate results. A bad extraction is worse than no feedback.');
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

  if (segments.length === 0) {
    const msg = warnings.length > 0
      ? `The app could not identify any student sections.\n\n${warnings.join('\n')}\n\nFor best results, upload a .docx file or add student names to the Class List box.`
      : 'The app could not find any student sections in this file.\n\nFor best results, upload a .docx file where each student\'s name appears on its own line as a heading.';
    alert(msg);
    return;
  }

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
