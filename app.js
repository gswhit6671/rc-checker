/* ═══════════════════════════════════════════════════════
   IB REPORT CARD CHECKER  — app.js
   GitHub Pages static site (runs entirely in the browser)
═══════════════════════════════════════════════════════ */

/* ── IB CONSTANTS ─────────────────────────────────────────── */
const LP_ATTRS = [
  'inquirer','knowledgeable','thinker','communicator','principled',
  'open-minded','caring','risk-taker','balanced','reflective'
];

const ATL_SKILLS = [
  'thinking skills','research skills','communication skills',
  'social skills','self-management skills'
];

const LP_SUGGESTIONS = {
  uoi: [
    'During the Unit of Inquiry, ___ demonstrated strong {attr} skills by…',
    'As a {attr} learner, ___ asked thoughtful questions about…',
    '___ showed the Learner Profile attribute of {attr} when…'
  ],
  sal: [
    '___ shows the attributes of a {attr} learner by…',
    'As a {attr} learner, ___ consistently…',
    '___ demonstrates the IB Learner Profile attribute of {attr} through…'
  ]
};

/* ── FILE READING ─────────────────────────────────────────── */
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
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();

    // Group items by Y position to reconstruct lines
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

    pageTexts.push(lines.join('\n'));
  }

  return pageTexts.join('\n\n');
}

/* ── SECTION SPLITTING ────────────────────────────────────── */
function splitIntoSections(fullText) {
  // Split on blank lines
  let sections = fullText
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(s => s.length >= 80);

  if (sections.length < 2) {
    // Fallback: split on name-like patterns at start of line
    sections = fullText
      .split(/\n(?=[A-Z][a-z]+ [A-Z][a-z]+\s*[:\-\n])/)
      .map(s => s.trim())
      .filter(s => s.length >= 80);
  }

  if (sections.length < 1) sections = [fullText.trim()];
  return sections;
}

function guessStudentName(text) {
  const patterns = [
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(?:is|has|can|demonstrates|shows|continues|works|enjoys)/m,
    /^([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*[:\-]/m,
    /Student(?:\s+Name)?:\s*([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1].trim();
  }
  return null;
}

/* ── REPORT AREA DETECTION ────────────────────────────────── */
function detectReportArea(text, override) {
  if (override && override !== 'auto') {
    const map = { sal: 'Student as Learner', uoi: 'Unit of Inquiry', subject: 'Subject', general: 'General' };
    return map[override] || 'General';
  }

  const t = text.toLowerCase();

  if (/unit of inquiry|central idea|line of inquiry|\buoi\b|inquiry unit/.test(t))
    return 'Unit of Inquiry';
  if (/student as a? learner|\bsal\b|learner profile|atl skill|approaches to learning/.test(t))
    return 'Student as Learner';
  if (/\bmath(s|ematics)?\b|\bnumeracy\b/.test(t))
    return 'Mathematics';
  if (/\blanguage arts?\b|\bliteracy\b|\breading\b|\bwriting\b|\bphonics\b/.test(t))
    return 'Language Arts';
  if (/\bscience\b|\bscientific inquiry\b/.test(t))
    return 'Science';
  if (/visual arts?\b|\bmusic\b|\bdrama\b|\bphysical education\b|\bpe\b/.test(t))
    return 'Specialist';

  return 'General';
}

/* ── LEVEL DETECTION ──────────────────────────────────────── */
function detectLevelInText(text) {
  const t = text.toLowerCase();
  if (/\bextend(ing|s|ed)?\b|exceeds? expectations|beyond grade level|highly advanced/.test(t))
    return 'extending';
  if (/\bsecure\b|meeting expectations|at grade level|on grade level|consistently demonstrates/.test(t))
    return 'secure';
  if (/\bdeveloping\b|making progress|with some support|with guidance|sometimes demonstrates/.test(t))
    return 'developing';
  if (/\bemerging\b|beginning to|not yet|with support|with consistent support|struggles to/.test(t))
    return 'emerging';
  return null;
}

/* ══════════════════════════════════════════════════════════
   CHECK FUNCTIONS
   Each returns an array of { priority, category, found, why, fix }
══════════════════════════════════════════════════════════ */

function checkGrammar(text) {
  const issues = [];

  const patterns = [
    { re: /\b(he|she|they)\s+(is|are)\s+a\s+(girl|boy|student)\s+who\s+(is|are)\b/i,
      found: m => m[0], why: 'Redundant construction.', fix: 'Remove "who is" — e.g. "She is a curious learner."' },
    { re: /\bthe\s+the\b/i,
      found: m => m[0], why: 'Duplicated word.', fix: 'Remove one "the".' },
    { re: /\b(a)\s+([aeiou])/i,
      check: m => !/\b(a)\s+unique\b/i.test(m[0]),
      found: m => m[0], why: 'Use "an" before vowel sounds.', fix: 'Change "a" to "an".' },
    { re: /\bshould of\b|\bcould of\b|\bwould of\b/i,
      found: m => m[0], why: 'Common grammar error.', fix: 'Use "should have", "could have", or "would have".' },
    { re: /\btheir\s+is\b|\bthere\s+are\s+a\b/i,
      found: m => m[0], why: 'Likely grammar error (their/there confusion).', fix: 'Check "there is" vs "their".' },
    { re: /\bstudents\s+whom\b|\bchild\s+whom\b/i,
      found: m => m[0], why: '"Whom" may be incorrect here.', fix: 'Consider "who" instead of "whom" after a noun subject.' },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m && (!p.check || p.check(m))) {
      issues.push({ priority: 'High', category: 'Grammar', found: p.found(m), why: p.why, fix: p.fix });
    }
  }
  return issues;
}

function checkSpelling(text) {
  const issues = [];
  const common = [
    ['recieve','receive'], ['acheive','achieve'], ['occured','occurred'],
    ['seperately','separately'], ['accomodate','accommodate'], ['begining','beginning'],
    ['beleive','believe'], ['calender','calendar'], ['definately','definitely'],
    ['enviroment','environment'], ['goverment','government'], ['grammer','grammar'],
    ['independant','independent'], ['knowlege','knowledge'], ['neccessary','necessary'],
    ['occassion','occasion'], ['perseverence','perseverance'], ['priviledge','privilege'],
    ['reccommend','recommend'], ['responsibilty','responsibility'], ['succesful','successful'],
    ['untill','until'], ['writting','writing'], ['comunication','communication'],
    ['colaborate','collaborate'], ['colaboration','collaboration'],
  ];
  for (const [wrong, right] of common) {
    const re = new RegExp(`\\b${wrong}\\b`, 'i');
    const m = text.match(re);
    if (m) {
      issues.push({
        priority: 'High', category: 'Spelling',
        found: m[0], why: 'Misspelled word.', fix: `Change to "${right}".`
      });
    }
  }
  return issues;
}

function checkPunctuation(text) {
  const issues = [];

  if (/[a-z]\s{0,1}$/.test(text.trimEnd()) && !/[.!?]$/.test(text.trimEnd())) {
    issues.push({
      priority: 'Medium', category: 'Punctuation',
      found: '(comment does not end with punctuation)',
      why: 'Comments should end with a full stop or other terminal punctuation.',
      fix: 'Add a period at the end of the comment.'
    });
  }

  const doublePunct = text.match(/[.!?,]{2,}/);
  if (doublePunct) {
    issues.push({
      priority: 'Low', category: 'Punctuation',
      found: doublePunct[0],
      why: 'Double punctuation marks look like a typo.',
      fix: 'Remove the extra punctuation mark.'
    });
  }

  return issues;
}

function checkWrongName(text, studentName) {
  const issues = [];
  if (!studentName) return issues;

  const nameRe = /\b([A-Z][a-z]{2,})\b/g;
  let m;
  const namesFound = new Set();
  while ((m = nameRe.exec(text)) !== null) {
    const word = m[1];
    if (word === studentName) continue;
    if (/^(The|This|These|They|Their|There|When|While|With|During|Through|After|Before|In|At|He|She|It|And|But|Or|For|An|Also|By|To|As|All|Both|Each|Such|That|Which|Who|What|Where|How|His|Her|Its|My|Our)$/.test(word)) continue;
    if (LP_ATTRS.map(a => a.charAt(0).toUpperCase() + a.slice(1)).includes(word)) continue;
    namesFound.add(word);
  }

  if (namesFound.size > 1) {
    const extras = [...namesFound].filter(n => n !== studentName);
    if (extras.length) {
      issues.push({
        priority: 'High', category: 'Wrong Name / Copy-Paste',
        found: extras.slice(0, 3).join(', '),
        why: 'Multiple student names detected. This comment may have been copied from another student.',
        fix: `Check that the comment is written for ${studentName} only.`
      });
    }
  }

  return issues;
}

function checkPronouns(text) {
  const issues = [];
  const heMatches  = (text.match(/\bhe\b|\bhim\b|\bhis\b/gi) || []).length;
  const sheMatches = (text.match(/\bshe\b|\bher\b|\bhers\b/gi) || []).length;
  const theyMatches= (text.match(/\bthey\b|\bthem\b|\btheir\b/gi) || []).length;

  let sets = 0;
  if (heMatches > 0) sets++;
  if (sheMatches > 0) sets++;
  if (theyMatches > 0) sets++;

  if (sets > 1) {
    issues.push({
      priority: 'High', category: 'Pronoun Mix-up',
      found: `Mixed pronouns detected (he/him: ${heMatches}, she/her: ${sheMatches}, they/them: ${theyMatches})`,
      why: 'Switching pronouns suggests the comment was copied from another student\'s report.',
      fix: 'Check and correct all pronouns to match the student.'
    });
  }
  return issues;
}

function checkNegativeTone(text) {
  const issues = [];
  const phrases = [
    { re: /\brefuses? to\b/i, fix: 'Use "is working on" or "is developing confidence to".' },
    { re: /\bnever (listens?|pays? attention|tries?|completes?)\b/i, fix: 'Replace "never" with a specific, measurable observation.' },
    { re: /\balways (disrupts?|distracts?|forgets?|fails?)\b/i, fix: 'Replace "always" — use "sometimes" or a specific example.' },
    { re: /\bcan'?t\b|\bcannot\b/i, fix: 'Reframe as a next step: "is working towards…" or "is developing the skill of…".' },
    { re: /\blazy\b|\bindifferent\b|\bapathetic\b/i, fix: 'Describe the observed behaviour, not a character trait.' },
    { re: /\bpoor\b(?!\s+performance is improving)/i, fix: 'Replace "poor" with a specific description of what needs development.' },
    { re: /\bdisruptive\b|\bbehaves? badly\b/i, fix: 'Describe the behaviour specifically without judging character.' },
    { re: /\bfails? to\b|\bfailed? to\b/i, fix: 'Use "is working on" or describe the current level of skill.' },
  ];

  for (const p of phrases) {
    const m = text.match(p.re);
    if (m) {
      issues.push({
        priority: 'High', category: 'Negative Tone',
        found: m[0], why: 'This language may upset parents and is not aligned with IB report card conventions.',
        fix: p.fix
      });
    }
  }
  return issues;
}

function checkMissingTarget(text) {
  const issues = [];
  const hasTarget = /next step|working (towards|on)|goal|aim(s)? to|will continue|should (focus|practise|try|explore)|to improve|in order to|by the end|target/i.test(text);
  const wordCount = text.split(/\s+/).length;

  if (!hasTarget && wordCount > 30) {
    issues.push({
      priority: 'Medium', category: 'Missing Next Step',
      found: '(no next step or target found)',
      why: 'IB report comments should include a forward-looking next step so parents know what to support.',
      fix: 'Add a sentence like: "___ will continue to work on… by…" or "A next step for ___ is to…"'
    });
  }
  return issues;
}

function checkVagueness(text) {
  const issues = [];
  const patterns = [
    { re: /\ba (good|great|lovely|nice|wonderful|fantastic|awesome) (student|learner|worker|child)\b/i,
      fix: 'Be specific: name a strength and an example — "___ consistently shows curiosity by asking detailed questions."' },
    { re: /\bworks (very )?hard\b/i,
      fix: 'What do they work hard at? "Works hard to explain their thinking in writing" is more useful.' },
    { re: /\benjoyed (this|the) (term|year|unit|topic)\b/i,
      fix: 'Say what specifically they enjoyed and why it mattered.' },
    { re: /\bis a (pleasure|joy) to (have|teach)\b/i,
      fix: 'Warm phrase, but add a specific example of the quality you\'re describing.' },
    { re: /\bkeep(s)? (up the )?good work\b/i,
      fix: 'What good work? Name the specific skill or behaviour.' },
    { re: /\bmust try harder\b|\bneeds to try harder\b/i,
      fix: 'Be specific: "needs to read for 15 minutes each night" or "needs to show working in Maths."' },
    { re: /\bincredible|\bamazing\b|\bfabulous\b/i,
      fix: 'These words are vague positives. Replace with a specific achievement or skill.' },
  ];

  for (const p of patterns) {
    const m = text.match(p.re);
    if (m) {
      issues.push({
        priority: 'Medium', category: 'Vague Language',
        found: m[0], why: 'This phrase doesn\'t give parents actionable information.', fix: p.fix
      });
    }
  }
  return issues;
}

function checkRepeatedPhrases(text) {
  const issues = [];
  const words = text.toLowerCase().split(/\s+/);
  const counted = {};
  words.forEach(w => {
    const clean = w.replace(/[^a-z]/g, '');
    if (clean.length >= 5) counted[clean] = (counted[clean] || 0) + 1;
  });

  const stop = new Set(['their','student','shows','which','during','about','skills','learning',
    'continues','consistently','always','further','develop','using','through','often','other',
    'areas','work','with','this','that','they','them','when','also','able','more','unit','well']);
  const repeated = Object.entries(counted)
    .filter(([w, c]) => c >= 3 && !stop.has(w))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);

  if (repeated.length) {
    issues.push({
      priority: 'Low', category: 'Repeated Words',
      found: repeated.map(([w, c]) => `"${w}" (×${c})`).join(', '),
      why: 'Repeating the same word multiple times can make a comment feel less polished.',
      fix: 'Use synonyms or restructure sentences to vary word choice.'
    });
  }
  return issues;
}

function checkIncompleteSentences(text) {
  const issues = [];
  const sentences = text.match(/[^.!?]+[.!?]/g) || [];
  sentences.forEach(s => {
    const trimmed = s.trim();
    if (trimmed.split(/\s+/).length < 4 && trimmed.length > 2) {
      issues.push({
        priority: 'Medium', category: 'Incomplete Sentence',
        found: trimmed,
        why: 'This sentence is very short — it may be incomplete or a fragment.',
        fix: 'Expand into a full sentence with a subject, verb, and detail.'
      });
    }
  });
  return issues.slice(0, 1);
}

function checkWordiness(text) {
  const issues = [];
  const wordy = [
    { re: /\bdue to the fact that\b/i, fix: 'Replace with "because".' },
    { re: /\bin order to\b/i, fix: 'Replace with "to".' },
    { re: /\bat this point in time\b/i, fix: 'Replace with "now".' },
    { re: /\bfor the purpose of\b/i, fix: 'Replace with "to".' },
    { re: /\bwith regard to\b/i, fix: 'Replace with "about" or "regarding".' },
    { re: /\bprior to\b/i, fix: 'Replace with "before".' },
    { re: /\bsubsequent to\b/i, fix: 'Replace with "after".' },
  ];

  for (const p of wordy) {
    const m = text.match(p.re);
    if (m) {
      issues.push({
        priority: 'Low', category: 'Wordiness',
        found: m[0], why: 'A simpler phrase is easier to read, especially for EAL parents.', fix: p.fix
      });
    }
  }
  return issues;
}

/* ── EAL CLARITY CHECKS ───────────────────────────────────── */
function checkEALClarity(text) {
  const issues = [];

  // Long sentences
  const sentences = text.split(/(?<=[.!?])\s+/);
  sentences.forEach(s => {
    const wordCount = s.trim().split(/\s+/).length;
    if (wordCount > 35) {
      issues.push({
        priority: 'Low', category: 'EAL Clarity — Long Sentence',
        found: s.trim().substring(0, 90) + (s.trim().length > 90 ? '…' : ''),
        why: `This sentence has ~${wordCount} words. EAL parents may find it hard to follow.`,
        fix: 'Split into two shorter sentences.'
      });
    }
  });

  // Stacked clauses
  sentences.forEach(s => {
    const clauseCount = (s.match(/\bbecause\b|\bwhich\b|\bwhile\b|\balthough\b|\bhowever\b|\bwhereby\b/gi) || []).length;
    if (clauseCount >= 2) {
      issues.push({
        priority: 'Low', category: 'EAL Clarity — Stacked Clauses',
        found: s.trim().substring(0, 90) + '…',
        why: 'Multiple connecting clauses in one sentence can be difficult to follow.',
        fix: 'Break into shorter sentences and use simpler connectives.'
      });
    }
  });

  // Vague phrases
  const vagueList = [
    [/\bdo better\b/i, 'Say what specifically needs to improve.'],
    [/\btry harder\b/i, 'Specify what to try: "practise adding fractions daily" or "read for 10 minutes each night".'],
    [/\bgood attitude\b/i, 'Be specific: "always ready to learn" or "volunteers ideas in group discussions".'],
    [/\bneeds (to )?improvement\b/i, 'Name the area and the next step.'],
    [/\bhas potential\b/i, 'Describe what you\'ve seen and what the next step is.'],
    [/\bcould do more\b/i, 'Say specifically what: "could attempt extension tasks" or "could read for 15 minutes nightly".'],
  ];

  for (const [re, fix] of vagueList) {
    const m = text.match(re);
    if (m) {
      issues.push({
        priority: 'Medium', category: 'Vague Language',
        found: m[0], why: 'This phrase is too vague to be actionable for parents.', fix
      });
    }
  }

  // Idioms
  const idiomList = [
    [/\bstep up\b/i, 'Replace with "take more responsibility" or be specific about what that looks like.'],
    [/\bkeep on track\b/i, 'Replace with "maintain their current progress" or "continue to complete work on time".'],
    [/\bgo the extra mile\b/i, 'Replace with "put in extra effort" — specify what that effort looks like.'],
    [/\bthink outside the box\b/i, 'Replace with "explore creative solutions" or "try new approaches".'],
    [/\bon the right track\b/i, 'Replace with "making good progress" or be specific.'],
    [/\bpull (their|his|her) weight\b/i, 'Replace with "contribute equally to group work".'],
    [/\bshoot for the stars\b/i, 'Replace with "aim high and set ambitious goals".'],
  ];

  for (const [re, fix] of idiomList) {
    const m = text.match(re);
    if (m) {
      issues.push({
        priority: 'Low', category: 'EAL Clarity — Idiom',
        found: m[0], why: 'This idiom may confuse parents who speak English as an additional language.', fix
      });
    }
  }

  return issues;
}

/* ── LEVEL MATCH CHECK ────────────────────────────────────── */
function checkLevelMatch(text, selectedLevel) {
  const issues = [];
  const detected = detectLevelInText(text);
  const level = selectedLevel !== 'none' ? selectedLevel : detected;
  if (!level) return issues;

  const positive = (text.match(/\bexcellent\b|\boutstanding\b|\bexceptional\b|\bimpressive\b|\bstrength\b|\bshines?\b|\bbrilliant\b|\bsuperb\b|\btalented?\b/gi) || []).length;
  const negative = (text.match(/\bstruggles?\b|\bdifficulty\b|\bchallenging\b|\bneeds? to\b|\bnot yet\b|\bhardy\b|\brarely\b|\bhesitant\b|\binconsistent\b/gi) || []).length;

  if ((level === 'emerging' || level === 'developing') && positive > 3 && negative === 0) {
    issues.push({
      priority: 'Medium', category: 'Level Mismatch',
      found: `Grade level: ${level}, but comment contains only positive language`,
      why: 'A comment for a student at this level should include a clear next step, not only strengths.',
      fix: 'Add a specific, forward-looking next step so parents understand where to focus support.'
    });
  }

  if ((level === 'secure' || level === 'extending') && negative > positive + 2) {
    issues.push({
      priority: 'Medium', category: 'Level Mismatch',
      found: `Grade level: ${level}, but comment reads mostly negatively`,
      why: 'A student at this level should have clear strengths acknowledged before areas for growth.',
      fix: 'Lead with a specific strength before discussing next steps.'
    });
  }

  // Specific descriptor contradiction
  if (level === 'developing' && /consistently exceeds?|exceeds? expectations|above grade level|highly advanced/i.test(text)) {
    issues.push({
      priority: 'High', category: 'Level Mismatch',
      found: 'Comment says "consistently exceeds" but grade level is Developing',
      why: 'The comment language directly contradicts the grade level assigned.',
      fix: 'Use language aligned with Developing — save "exceeds expectations" for Extending.'
    });
  }

  if (level === 'extending' && /not yet|struggles? to|with support|with guidance|beginning to/i.test(text)) {
    issues.push({
      priority: 'High', category: 'Level Mismatch',
      found: 'Comment uses "not yet / struggles" language but grade level is Extending',
      why: 'Extending-level students should not be described with emerging-level language.',
      fix: 'Check the grade level or revise the comment to reflect genuine strengths.'
    });
  }

  return issues;
}

/* ── IB LANGUAGE CHECK ────────────────────────────────────── */
function checkIBLanguage(text, reportArea) {
  const issues = [];
  if (reportArea !== 'Unit of Inquiry' && reportArea !== 'Student as Learner') return issues;

  const t = text.toLowerCase();
  const hasLP  = LP_ATTRS.some(a => t.includes(a));
  const hasATL = ATL_SKILLS.some(s => t.includes(s));

  if (reportArea === 'Unit of Inquiry' && !hasLP && !hasATL) {
    const exampleAttr = LP_ATTRS[Math.floor(LP_ATTRS.length / 2)];
    issues.push({
      priority: 'Medium', category: 'IB Language — Missing',
      found: '(no Learner Profile attribute or ATL skill mentioned)',
      why: 'UOI comments should connect learning to IB Learner Profile attributes or ATL skills.',
      fix: `Add an IB connection, e.g. "During the Unit of Inquiry, ___ demonstrated the ${exampleAttr} attribute by…"`
    });
  } else if (reportArea === 'Student as Learner' && !hasLP) {
    issues.push({
      priority: 'Medium', category: 'IB Language — Missing',
      found: '(no Learner Profile attribute mentioned)',
      why: 'Student as Learner comments should reference at least one IB Learner Profile attribute.',
      fix: '___ shows the attributes of a reflective and caring learner by…'
    });
  }

  return issues;
}

/* ══════════════════════════════════════════════════════════
   ORCHESTRATOR — runs all checks on one section
══════════════════════════════════════════════════════════ */
function checkSection(text, studentName, selectedLevel, settings) {
  const { strictness, reportTypeOverride, includeIB, includeEAL, includeStyle } = settings;
  const reportArea = detectReportArea(text, reportTypeOverride);

  let issues = [
    ...checkGrammar(text),
    ...checkSpelling(text),
    ...checkPunctuation(text),
    ...checkWrongName(text, studentName),
    ...checkPronouns(text),
    ...checkNegativeTone(text),
    ...checkMissingTarget(text),
    ...checkVagueness(text),
    ...checkIncompleteSentences(text),
    ...checkLevelMatch(text, selectedLevel),
  ];

  if (includeStyle) {
    issues = issues.concat(checkWordiness(text), checkRepeatedPhrases(text));
  }

  if (includeEAL) {
    issues = issues.concat(checkEALClarity(text));
  }

  if (includeIB) {
    issues = issues.concat(checkIBLanguage(text, reportArea));
  }

  // Apply strictness filter
  if (strictness === 'light') {
    issues = issues.filter(i => i.priority === 'High');
  } else if (strictness === 'balanced') {
    issues = issues.filter(i => i.priority !== 'Low');
  }
  // 'detailed' = show all

  // Deduplicate by category (keep first)
  const seenCats = new Set();
  issues = issues.filter(i => {
    const key = i.category + '|' + i.found.substring(0, 20);
    if (seenCats.has(key)) return false;
    seenCats.add(key);
    return true;
  });

  // Non-nitpicky cap: max 5 per section (always show all High, fill to 5 with Medium/Low)
  const high   = issues.filter(i => i.priority === 'High');
  const medium = issues.filter(i => i.priority === 'Medium');
  const low    = issues.filter(i => i.priority === 'Low');

  let capped = [...high];
  if (capped.length < 5) capped = capped.concat(medium.slice(0, 5 - capped.length));
  if (capped.length < 5) capped = capped.concat(low.slice(0, 5 - capped.length));

  if (capped.length === 0) {
    capped = [{ priority: 'OK', category: 'No issues found', found: '', why: 'This comment looks good!', fix: '' }];
  }

  return { reportArea, issues: capped };
}

/* ══════════════════════════════════════════════════════════
   RENDER RESULTS
══════════════════════════════════════════════════════════ */
function priorityClass(p) {
  if (p === 'High')   return 'badge-high';
  if (p === 'Medium') return 'badge-medium';
  if (p === 'Low')    return 'badge-low';
  return 'badge-ok';
}

function renderResults(allResults) {
  const tbody = document.getElementById('tableBody');
  const summaryEl = document.getElementById('summary');
  tbody.innerHTML = '';

  let highCount = 0, medCount = 0, lowCount = 0, okCount = 0;
  let sectionCount = 0;

  allResults.forEach(({ name, reportArea, issues }) => {
    sectionCount++;
    const firstIssue = issues[0];

    issues.forEach((issue, idx) => {
      if (issue.priority === 'High')   highCount++;
      else if (issue.priority === 'Medium') medCount++;
      else if (issue.priority === 'Low')    lowCount++;
      else okCount++;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx === 0 ? `<strong>${escHtml(name)}</strong>` : ''}</td>
        <td>${idx === 0 ? `<span class="area-tag">${escHtml(reportArea)}</span>` : ''}</td>
        <td><span class="badge-pill ${priorityClass(issue.priority)}">${escHtml(issue.priority)}</span></td>
        <td>${escHtml(issue.category)}</td>
        <td class="found-cell">${issue.found ? `"${escHtml(issue.found)}"` : '<em>—</em>'}</td>
        <td>${escHtml(issue.why)}</td>
        <td>${escHtml(issue.fix)}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  // Summary pills
  summaryEl.innerHTML = `
    <div class="summary-pill pill-red">  <span>${highCount}</span>High priority</div>
    <div class="summary-pill pill-amber"><span>${medCount}</span>Medium priority</div>
    <div class="summary-pill pill-blue"> <span>${lowCount}</span>Low priority</div>
    <div class="summary-pill pill-green"><span>${okCount}</span>Sections OK</div>
  `;

  document.getElementById('resultsSection').hidden = false;
  document.getElementById('downloadHtmlBtn').hidden = false;
  document.getElementById('downloadCsvBtn').hidden = false;
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });

  // Store for download
  window._lastResults = allResults;
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════════
   DOWNLOAD — HTML REPORT
══════════════════════════════════════════════════════════ */
function downloadHtml(allResults, filename) {
  const rows = allResults.flatMap(({ name, reportArea, issues }) =>
    issues.map((issue, idx) => `
      <tr>
        <td>${idx === 0 ? `<strong>${escHtml(name)}</strong>` : ''}</td>
        <td>${idx === 0 ? `<span style="background:#f0f4ff;color:#2d5099;border:1px solid #c5d5f5;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700">${escHtml(reportArea)}</span>` : ''}</td>
        <td><span style="padding:3px 9px;border-radius:99px;font-size:12px;font-weight:700;${priorityStyle(issue.priority)}">${escHtml(issue.priority)}</span></td>
        <td>${escHtml(issue.category)}</td>
        <td style="font-style:italic;color:#374151">${issue.found ? `"${escHtml(issue.found)}"` : '—'}</td>
        <td>${escHtml(issue.why)}</td>
        <td>${escHtml(issue.fix)}</td>
      </tr>`)
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Report Card Feedback</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:30px;background:#f5f7fb;color:#1f2937;font-size:13px}
  h1{color:#1f4e79;font-size:28px;margin:0 0 6px}
  p{color:#6b7280;margin:0 0 20px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 14px rgba(31,78,121,.1)}
  thead th{background:#1f4e79;color:#fff;padding:10px 13px;text-align:left;font-size:11.5px;letter-spacing:.04em;white-space:nowrap}
  tbody td{padding:9px 13px;border-bottom:1px solid #edf0f7;vertical-align:top;line-height:1.4}
  tbody tr:last-child td{border-bottom:none}
  tbody tr:hover td{background:#f9fafd}
  .note{margin-top:18px;background:#fff8e1;border:1px solid #ffe082;color:#725000;padding:10px 14px;border-radius:8px;font-size:12px}
</style>
</head><body>
<h1>Report Card Feedback</h1>
<p>Generated by IB Report Card Checker &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</p>
<table>
<thead><tr>
  <th>Student / Section</th><th>Report Area</th><th>Priority</th>
  <th>Category</th><th>Text Found</th><th>Why It Matters</th><th>Suggested Fix</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>
<p class="note">&#9888;&#65039; Automated first-pass only. Apply professional judgement before making changes.</p>
</body></html>`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  triggerDownload(blob, filename.replace(/\.[^.]+$/, '') + '_feedback.html');
}

function priorityStyle(p) {
  if (p === 'High')   return 'background:#fde8e8;color:#c0392b;border:1px solid #f5c6c6';
  if (p === 'Medium') return 'background:#fff8e1;color:#c47d00;border:1px solid #ffe082';
  if (p === 'Low')    return 'background:#e8f1ff;color:#1f4e79;border:1px solid #c3d7f5';
  return 'background:#e8f8ee;color:#176b34;border:1px solid #bde8ca';
}

/* ── DOWNLOAD — CSV ───────────────────────────────────────── */
function downloadCsv(allResults, filename) {
  const headers = ['Student/Section','Report Area','Priority','Category','Text Found','Why It Matters','Suggested Fix'];
  const rows = allResults.flatMap(({ name, reportArea, issues }) =>
    issues.map(issue => [name, reportArea, issue.priority, issue.category, issue.found, issue.why, issue.fix])
  );
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell || '').replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(blob, filename.replace(/\.[^.]+$/, '') + '_feedback.csv');
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/* ══════════════════════════════════════════════════════════
   MAIN PROCESS
══════════════════════════════════════════════════════════ */
async function processFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  if (ext === 'doc') {
    alert('.doc files are not supported. Please open the file in Word or Google Docs, then save/download it as .docx and try again.');
    return;
  }

  let fullText;
  try {
    if (ext === 'docx') {
      fullText = await readDocx(file);
    } else if (ext === 'pdf') {
      fullText = await readPdf(file);
    } else {
      alert('Unsupported file type. Please upload a .pdf or .docx file.');
      return;
    }
  } catch (err) {
    alert('Could not read the file. Make sure it is not password-protected and try again.\n\nError: ' + err.message);
    return;
  }

  if (!fullText || fullText.trim().length < 50) {
    alert('The file appears to be empty or could not be read. If it is a scanned PDF, text extraction will not work.');
    return;
  }

  const sections = splitIntoSections(fullText);

  // Gather settings
  const settings = {
    strictness: document.querySelector('input[name="strictness"]:checked')?.value || 'balanced',
    reportTypeOverride: document.getElementById('reportTypeSelect').value,
    includeIB:    document.getElementById('chkIB').checked,
    includeEAL:   document.getElementById('chkEAL').checked,
    includeStyle: document.getElementById('chkStyle').checked,
  };
  const selectedLevel = document.getElementById('levelSelect').value;

  const allResults = sections.map((sec, idx) => {
    const name = guessStudentName(sec) || `Section ${idx + 1}`;
    const { reportArea, issues } = checkSection(sec, name, selectedLevel, settings);
    return { name, reportArea, issues };
  });

  renderResults(allResults);

  // Wire downloads
  document.getElementById('downloadHtmlBtn').onclick = () => downloadHtml(allResults, file.name);
  document.getElementById('downloadCsvBtn').onclick  = () => downloadCsv(allResults, file.name);
}

/* ══════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  const fileInput  = document.getElementById('fileInput');
  const dropZone   = document.getElementById('dropZone');
  const fileNameEl = document.getElementById('fileName');
  const checkBtn   = document.getElementById('checkBtn');
  const spinner    = document.getElementById('spinner');
  const settingsToggle = document.getElementById('settingsToggle');
  const settingsBody   = document.getElementById('settingsBody');
  const settingsArrow  = document.getElementById('settingsArrow');

  let chosenFile = null;

  function setFile(f) {
    chosenFile = f;
    fileNameEl.textContent = f ? f.name : '';
    checkBtn.disabled = !f;
  }

  // Settings toggle
  settingsToggle.addEventListener('click', () => {
    const open = !settingsBody.hidden;
    settingsBody.hidden = open;
    settingsToggle.setAttribute('aria-expanded', String(!open));
    settingsArrow.classList.toggle('open', !open);
  });

  // File input
  fileInput.addEventListener('change', () => setFile(fileInput.files[0] || null));

  // Drag and drop
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  });

  // Check button
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
