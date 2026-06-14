/* ═══════════════════════════════════════════════════════
   IB REPORT CARD CHECKER  — app.js  (Precise Edition)
   Goal: exact sentence → exact mistake → exact fix → improved sentence
═══════════════════════════════════════════════════════ */

/* ── CONSTANTS ────────────────────────────────────────────── */

// Never treat these as student names
const NOT_NAMES = new Set([
  'Term','Report','Cards','Year','Unit','Inquiry','Mathematics','English','UOI',
  'Student','Learner','Learning','Teacher','Primary','Secondary','Comments',
  'Progress','ATL','IB','PYP','Reading','Writing','Science','Overall',
  'Curriculum','Language','Class','School','Section','Areas','Strengths',
  'Next','Steps','During','This','Their','These','They','There','When',
  'While','With','Through','After','Before','Also','Both','Each','Such',
  'That','Which','Who','What','Where','How','His','Her','Its','Our','The',
  'And','But','For','Not','Are','Was','Has','Had','Have','From','Into',
  'More','Some','Other','First','Last','New','Good','Well','Just','Only',
  'Social','Communication','Self','Management','Thinking','Research',
  'Maths','Language','Arts','Subject','General','Skills','Skill',
  'Learner','Profile','Attribute','Attributes','Beginning','Developing',
  'Emerging','Secure','Extending','Exceeding','Meeting','Expectations'
]);

// Words where "a" before them is CORRECT (yoo sound or special)
const YOO_SOUND_WORDS = /^(unit|university|unique|uniform|use|user|useful|usual|usage|unity|union|universal|unanimous|utensil|european|one|once|eulogy|euphemism|euphoric)/i;

const LP_ATTRS = [
  'knowledgeable','risk-taker','inquirer','open-minded','reflective',
  'communicator','principled','caring','thinker','balanced'
];

const ATL_SKILLS = [
  'thinking skills','research skills','communication skills',
  'social skills','self-management skills'
];

// Synonym map: teacher words → LP attribute + ATL suggestion
const LP_SYNONYM_MAP = [
  {
    attr: 'inquirer',
    re: /\b(asks? questions?|wonders?|investigates?|explores?|curious|seek[s]? answers?|wants? to (know|find out)|interested in (learning|finding))\b/i,
    atl: 'thinking skills; research skills'
  },
  {
    attr: 'knowledgeable',
    re: /\b(understand[s]?|explains?|uses? (his|her|their)? ?knowledge|applies? (what|learning)|builds? understanding|shares? information|demonstrates? understanding)\b/i,
    atl: 'thinking skills; research skills'
  },
  {
    attr: 'thinker',
    re: /\b(analyse[s]?|analyzes?|makes? connections?|solves? problems?|gives? reasons?|explains? (his|her|their)? ?thinking|compares?|evaluates?|thinks? (critically|deeply))\b/i,
    atl: 'thinking skills'
  },
  {
    attr: 'communicator',
    re: /\b(shares? (ideas?|thoughts?)|explains? clearly|listens?|discusses?|presents?|contributes? (to )?conversations?|speaks? (well|confidently)|expresses?)\b/i,
    atl: 'communication skills; social skills'
  },
  {
    attr: 'principled',
    re: /\b(responsible|honest|respectful|follows? (agreements?|rules?|guidelines?)|makes? positive choices?|takes? ownership|trustworthy)\b/i,
    atl: 'self-management skills; social skills'
  },
  {
    attr: 'open-minded',
    re: /\b(listens? to others?|considers? different (views?|perspectives?|ideas?)|respects? perspectives?|accepts? feedback|learns? from others?|open to)\b/i,
    atl: 'social skills; communication skills'
  },
  {
    attr: 'caring',
    re: /\b(helps? others?|supports? (classmates?|peers?)|shows? kindness|includes? others?|encourages? (peers?|classmates?)|empathetic|compassionate)\b/i,
    atl: 'social skills'
  },
  {
    attr: 'risk-taker',
    re: /\b(tries? new (strategies?|approaches?|ideas?)|has? a go|takes? on challenges?|participates? (even )?when unsure|steps? outside (his|her|their)? ?comfort zone|brave|courageous|attempts?)\b/i,
    atl: 'thinking skills; self-management skills'
  },
  {
    attr: 'reflective',
    re: /\b(reflects?|uses? feedback|identifies? strengths?|thinks? about next steps?|improves? (his|her|their)? ?(own )?work|reviews? (his|her|their)?|looks? back)\b/i,
    atl: 'thinking skills; self-management skills'
  },
  {
    attr: 'balanced',
    re: /\b(manages? (time|tasks?)|stays? (organised|organized|focused|on track)|balances? (tasks?|learning)|manages? (his|her|their)? ?learning habits?|well-rounded)\b/i,
    atl: 'self-management skills'
  }
];

// IB improved sentence templates for SAL
const SAL_TEMPLATES = {
  communicator: (name, gp) => `${name} demonstrates strong social and communication skills by sharing ${gp} ideas clearly, listening to different perspectives, and contributing positively during group discussions.`,
  caring: (name, gp) => `${name} shows the attribute of a caring learner by supporting peers, including others in activities, and encouraging classmates during collaborative tasks.`,
  'risk-taker': (name, gp) => `${name} shows resilience and a positive attitude by continuing to try when learning is challenging, taking on new tasks with confidence, and stepping outside ${gp} comfort zone.`,
  reflective: (name, gp) => `${name} demonstrates the attribute of a reflective learner by identifying ${gp} strengths, considering next steps, and using feedback to improve ${gp} understanding.`,
  balanced: (name, gp) => `${name} demonstrates self-management skills by organising ${gp} materials, following routines, and taking increasing responsibility for ${gp} learning.`,
  principled: (name, gp) => `${name} consistently demonstrates the attribute of a principled learner by making responsible choices, following classroom agreements, and taking ownership of ${gp} actions.`,
  inquirer: (name, gp) => `${name} demonstrates the attribute of an inquirer by asking thoughtful questions, seeking answers independently, and showing genuine curiosity about new topics.`,
  knowledgeable: (name, gp) => `${name} demonstrates strong understanding by applying ${gp} learning across different contexts and confidently sharing ${gp} knowledge during discussions.`,
  thinker: (name, gp) => `${name} demonstrates strong thinking skills by making connections between concepts, analysing information carefully, and explaining ${gp} reasoning clearly.`,
  'open-minded': (name, gp) => `${name} shows the attribute of an open-minded learner by listening respectfully to different perspectives, accepting feedback, and learning from peers.`
};

// IB improved sentence templates for UOI
const UOI_TEMPLATES = {
  inquirer: (name, gp) => `${name} demonstrated the attributes of an inquirer by asking thoughtful questions and using them to guide further research during the Unit of Inquiry.`,
  knowledgeable: (name, gp) => `${name} developed conceptual understanding by making connections between the unit concepts and real-life examples.`,
  thinker: (name, gp) => `${name} demonstrated strong thinking skills by analysing information, making connections between ideas, and explaining ${gp} reasoning clearly.`,
  communicator: (name, gp) => `${name} demonstrated social and communication skills by collaborating with peers, listening to different perspectives, and contributing ideas during group inquiry tasks.`,
  reflective: (name, gp) => `${name} demonstrated the attribute of a reflective learner by identifying strengths, considering next steps, and using feedback to improve ${gp} understanding.`,
  'risk-taker': (name, gp) => `${name} showed initiative and risk-taking by trying new strategies, sharing ideas even when uncertain, and taking on challenging aspects of the inquiry.`,
  'open-minded': (name, gp) => `${name} demonstrated an open-minded approach by considering different perspectives during the inquiry and respectfully engaging with the ideas of peers.`,
  caring: (name, gp) => `${name} showed care and responsibility by considering the impact of the unit's central idea on others and contributing positively to collaborative tasks.`,
  principled: (name, gp) => `${name} demonstrated the principled attribute by taking responsibility for ${gp} research, ensuring accuracy, and acknowledging different viewpoints honestly.`,
  balanced: (name, gp) => `${name} demonstrated balance by managing ${gp} time effectively, organising ${gp} research materials, and maintaining focus across the different stages of the inquiry.`
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

/* ── SECTION & SENTENCE SPLITTING ────────────────────────────── */
function splitIntoSections(fullText) {
  let sections = fullText
    .split(/\n{2,}/)
    .map(s => s.trim())
    .filter(s => s.length >= 60);

  if (sections.length < 2) {
    sections = fullText
      .split(/\n(?=[A-Z][a-z]+ [A-Z][a-z]+\s*[:\-\n])/)
      .map(s => s.trim())
      .filter(s => s.length >= 60);
  }

  return sections.length >= 1 ? sections : [fullText.trim()];
}

function splitSentences(text) {
  // Split on . ! ? but handle common abbreviations
  const raw = text.match(/[^.!?]+(?:[.!?]+(?=\s+[A-Z]|$)|[.!?]+)/g) || [text];
  return raw.map(s => s.trim()).filter(s => s.length > 5);
}

/* ── NAME DETECTION ───────────────────────────────────────── */
function detectStudentName(sectionText) {
  // Only look at the first ~150 characters (opening of the comment)
  const opening = sectionText.substring(0, 200);

  // Pattern 1: "FirstName LastName is/has/shows/demonstrates..."
  const m1 = opening.match(/^([A-Z][a-z]{1,14}(?:\s[A-Z][a-z]{1,14})?)\s+(?:is\b|has\b|shows?\b|demonstrates?\b|continues?\b|works?\b|enjoys?\b|can\b|was\b|will\b|loves?\b|tries?\b)/);
  if (m1 && !NOT_NAMES.has(m1[1].split(' ')[0])) return m1[1].trim();

  // Pattern 2: "Name:" label
  const m2 = opening.match(/^([A-Z][a-z]{1,14}(?:\s[A-Z][a-z]{1,14})?)\s*:/);
  if (m2 && !NOT_NAMES.has(m2[1].split(' ')[0])) return m2[1].trim();

  // Pattern 3: First capitalised word-pair that isn't excluded
  const m3 = opening.match(/\b([A-Z][a-z]{1,14})\s+([A-Z][a-z]{1,14})\b/);
  if (m3 && !NOT_NAMES.has(m3[1]) && !NOT_NAMES.has(m3[2])) return `${m3[1]} ${m3[2]}`;

  // Pattern 4: Single first name at start
  const m4 = opening.match(/^([A-Z][a-z]{2,14})\b/);
  if (m4 && !NOT_NAMES.has(m4[1])) return m4[1];

  return null;
}

// Guess pronoun group based on what's in the text
function detectPronounGroup(text) {
  const he  = (text.match(/\bhe\b|\bhim\b|\bhis\b/gi) || []).length;
  const she = (text.match(/\bshe\b|\bher\b|\bhers\b/gi) || []).length;
  const they= (text.match(/\bthey\b|\bthem\b|\btheir\b/gi) || []).length;
  if (he > she && he > they) return { pronoun: 'his', obj: 'him', poss: 'his' };
  if (she > he && she > they) return { pronoun: 'her', obj: 'her', poss: 'her' };
  return { pronoun: 'their', obj: 'them', poss: 'their' };
}

/* ── REPORT AREA DETECTION ────────────────────────────────── */
function detectReportArea(text, override) {
  if (override && override !== 'auto') {
    const map = { sal:'Student as a Learner', uoi:'Unit of Inquiry', subject:'Other', general:'Other' };
    return map[override] || 'Other';
  }
  const t = text.toLowerCase();
  if (/unit of inquiry|central idea|line[s]? of inquiry|\buoi\b|inquiry unit/.test(t)) return 'Unit of Inquiry';
  if (/student as a? learner|\bsal\b|learner profile|atl skill|approaches to learning/.test(t)) return 'Student as a Learner';
  return 'Other';
}

/* ═══════════════════════════════════════════════════════════
   CHECK FUNCTIONS
   Each returns [] or [issueObject(s)]
═══════════════════════════════════════════════════════════ */

// ── A/AN grammar ──────────────────────────────────────────
function checkAAnRule(sentence) {
  const issues = [];
  // Match "a" followed by a vowel-starting word
  const re = /\ba\s+([AEIOUaeiou][a-zA-Z]*)/g;
  let m;
  while ((m = re.exec(sentence)) !== null) {
    const nextWord = m[1];
    if (YOO_SOUND_WORDS.test(nextWord)) continue; // "a unit" is correct
    const mistake = `a ${nextWord}`;
    const fixed   = `an ${nextWord}`;
    const improved = sentence.slice(0, m.index) + fixed + sentence.slice(m.index + m[0].length);
    issues.push({
      priority: 'High',
      issueType: 'Grammar — A/An',
      exactSentence: sentence,
      exactMistake: `"${mistake}"`,
      whyItMatters: `"An" is required before vowel sounds, not "a".`,
      exactFix: `Change "${mistake}" to "${fixed}".`,
      improvedSentence: improved,
      ibAtlLink: '',
      confidence: 'High'
    });
  }
  return issues;
}

// ── SPELLING ──────────────────────────────────────────────
const SPELLING_LIST = [
  ['recieve','receive'],['acheive','achieve'],['occured','occurred'],
  ['seperately','separately'],['accomodate','accommodate'],['begining','beginning'],
  ['beleive','believe'],['definately','definitely'],['enviroment','environment'],
  ['grammer','grammar'],['independant','independent'],['knowlege','knowledge'],
  ['neccessary','necessary'],['perseverence','perseverance'],['priviledge','privilege'],
  ['reccommend','recommend'],['responsibilty','responsibility'],['succesful','successful'],
  ['untill','until'],['writting','writing'],['comunication','communication'],
  ['colaborate','collaborate'],['colaboration','collaboration'],['excercise','exercise'],
  ['develope','develop'],['managment','management'],['organistion','organisation'],
  ['organiztion','organization'],['relfection','reflection'],['indepenence','independence'],
  ['mathmatices','mathematics'],['mathermatics','mathematics'],['excell','excel'],
];

function checkSpelling(sentence) {
  const issues = [];
  for (const [wrong, right] of SPELLING_LIST) {
    const re = new RegExp(`\\b${wrong}\\b`, 'i');
    const m  = sentence.match(re);
    if (m) {
      const improved = sentence.replace(re, right);
      issues.push({
        priority: 'High',
        issueType: 'Spelling',
        exactSentence: sentence,
        exactMistake: `"${m[0]}"`,
        whyItMatters: `"${m[0]}" is a spelling error.`,
        exactFix: `Change "${m[0]}" to "${right}".`,
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'High'
      });
    }
  }
  return issues.slice(0, 1); // max 1 spelling error per sentence
}

// ── PUNCTUATION SPACING ───────────────────────────────────
function checkPunctuationSpacing(sentence) {
  const issues = [];
  // Space before comma/period
  const m = sentence.match(/(\w)\s([,.])/);
  if (m) {
    const improved = sentence.replace(/(\w)\s([,.])/g, '$1$2');
    issues.push({
      priority: 'Low',
      issueType: 'Punctuation — Extra Space',
      exactSentence: sentence,
      exactMistake: `"${m[0]}"`,
      whyItMatters: 'There is an unnecessary space before the punctuation mark.',
      exactFix: `Remove the space before the "${m[2]}".`,
      improvedSentence: improved,
      ibAtlLink: '',
      confidence: 'High'
    });
  }
  return issues;
}

// ── NEGATIVE/UNPROFESSIONAL TONE ──────────────────────────
const NEGATIVE_PATTERNS = [
  { re: /\brefuses?\s+to\b/i,
    fix: (s,m) => s.replace(m[0], 'is working on'),
    why: '"Refuses to" is too blunt for a report card.' },
  { re: /\bnever\s+(listens?|pays?\s+attention|tries?|completes?|finishes?)\b/i,
    fix: (s,m) => s.replace(m[0], `is working on strengthening ${m[1]}`),
    why: '"Never" is an absolute term that is too negative for a report card.' },
  { re: /\balways\s+(disrupts?|distracts?|forgets?|fails?|misbehaves?)\b/i,
    fix: (s,m) => s.replace(m[0], `sometimes finds it challenging to avoid ${m[1].replace(/s$/, 'ing')}`),
    why: '"Always" with a negative behaviour is too absolute and unprofessional.' },
  { re: /\b(lazy|indifferent|apathetic|careless|rude|badly)\b/i,
    fix: (s,m) => s.replace(m[0], '[describe the specific observed behaviour]'),
    why: 'Character judgements like this are not appropriate in a report card.' },
  { re: /\bpoor\s+(?!progress|effort)\b/i,
    fix: (s,m) => s.replace(m[0], 'developing'),
    why: '"Poor" is too negative. Use constructive language instead.' },
  { re: /\bfails?\s+to\b/i,
    fix: (s,m) => s.replace(m[0], 'is working towards'),
    why: '"Fails to" is too negative. Rephrase as a next step.' },
  { re: /\bmust\s+try\s+harder\b/i,
    fix: (s,m) => s.replace(m[0], 'is encouraged to strengthen [specific skill]'),
    why: 'Too vague and negative. Name the specific skill and action.' },
];

function checkNegativeTone(sentence) {
  const issues = [];
  for (const p of NEGATIVE_PATTERNS) {
    const m = sentence.match(p.re);
    if (m) {
      const improved = p.fix(sentence, m);
      issues.push({
        priority: 'High',
        issueType: 'Tone — Negative/Unprofessional',
        exactSentence: sentence,
        exactMistake: `"${m[0]}"`,
        whyItMatters: p.why,
        exactFix: `Replace "${m[0]}" with more constructive language.`,
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'High'
      });
      break; // one per sentence
    }
  }
  return issues;
}

// ── EAL CLARITY ───────────────────────────────────────────
const WORDY_PHRASES = [
  ['due to the fact that', 'because'],
  ['in order to', 'to'],
  ['on a regular basis', 'regularly'],
  ['a variety of different', 'a variety of'],
  ['is able to demonstrate an understanding of', 'understands'],
  ['is able to demonstrate', 'demonstrates'],
  ['has been able to', 'has'],
  ['at this point in time', 'now'],
  ['for the purpose of', 'to'],
  ['with regard to', 'regarding'],
  ['prior to', 'before'],
  ['a wide variety of', 'many'],
  ['in the process of', 'currently'],
];

function checkEALClarity(sentence) {
  const issues = [];

  // Long sentence check
  const wordCount = sentence.trim().split(/\s+/).length;
  if (wordCount > 35) {
    issues.push({
      priority: 'Medium',
      issueType: 'EAL Clarity — Long Sentence',
      exactSentence: sentence,
      exactMistake: `Sentence has ${wordCount} words`,
      whyItMatters: 'This sentence may be difficult for EAL parents to follow.',
      exactFix: 'Split into two shorter sentences.',
      improvedSentence: '(See fix — split at a natural joining point such as "and" or "by")',
      ibAtlLink: '',
      confidence: 'High'
    });
    return issues; // don't double-flag with wordy phrase too
  }

  // Wordy phrase check
  for (const [phrase, replacement] of WORDY_PHRASES) {
    const re = new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    const m  = sentence.match(re);
    if (m) {
      const improved = sentence.replace(re, replacement);
      issues.push({
        priority: 'Low',
        issueType: 'EAL Clarity — Wordy Phrase',
        exactSentence: sentence,
        exactMistake: `"${m[0]}"`,
        whyItMatters: 'Simpler wording is easier for all parents to read, especially EAL families.',
        exactFix: `Replace "${m[0]}" with "${replacement}".`,
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'High'
      });
      break; // one per sentence
    }
  }
  return issues;
}

// ── INCOMPLETE SENTENCE ───────────────────────────────────
function checkIncompleteSentence(sentence) {
  const issues = [];
  const words = sentence.trim().split(/\s+/);
  // Flag very short sentences that lack a verb
  if (words.length < 5 && !/\b(is|are|was|were|has|have|had|can|will|does|do|shows?|works?|enjoys?|tries?|helps?|makes?)\b/i.test(sentence)) {
    issues.push({
      priority: 'High',
      issueType: 'Incomplete Sentence',
      exactSentence: sentence,
      exactMistake: `"${sentence.trim()}"`,
      whyItMatters: 'This appears to be an incomplete sentence or fragment.',
      exactFix: 'Expand into a full sentence with a subject, verb, and specific detail.',
      improvedSentence: '(Expand with: [Student name] [verb] [specific skill/behaviour].)',
      ibAtlLink: '',
      confidence: 'Medium'
    });
  }
  return issues;
}

// ── WRONG NAME / PRONOUN MIX ──────────────────────────────
function checkPronounMix(sectionText) {
  const issues = [];
  const he  = (sectionText.match(/\bhe\b|\bhim\b|\bhis\b/gi) || []).length;
  const she = (sectionText.match(/\bshe\b|\bher\b|\bhers\b/gi) || []).length;
  if (he > 0 && she > 0) {
    issues.push({
      priority: 'High',
      issueType: 'Pronoun Mix-up',
      exactSentence: '(Across the whole comment)',
      exactMistake: `Both "he/him/his" (${he}×) and "she/her" (${she}×) are used`,
      whyItMatters: 'Mixing pronouns suggests this comment was copied from another student\'s report.',
      exactFix: 'Read through the whole comment and change all pronouns to match this student.',
      improvedSentence: '(Check every sentence and use consistent pronouns throughout.)',
      ibAtlLink: '',
      confidence: 'High'
    });
  }
  return issues;
}

function checkWrongName(sectionText, studentName) {
  const issues = [];
  if (!studentName) return issues;

  // Look for a DIFFERENT capitalised name appearing mid-comment
  const firstName = studentName.split(' ')[0];
  const nameRe = /\b([A-Z][a-z]{2,14})\b/g;
  let m;
  const otherNames = new Set();
  while ((m = nameRe.exec(sectionText)) !== null) {
    const word = m[1];
    if (word === firstName) continue;
    if (NOT_NAMES.has(word)) continue;
    if (LP_ATTRS.map(a => a.charAt(0).toUpperCase() + a.slice(1)).includes(word)) continue;
    // Only flag if it looks like a name (appears with another capital near it or after a pronoun)
    const context = sectionText.substring(Math.max(0, m.index - 20), m.index + word.length + 20);
    if (/\b(he|she|his|her|they)\b/i.test(context)) continue; // skip if near a pronoun (likely a concept)
    otherNames.add(word);
  }

  // Only flag if we found multiple distinct capitalised words that look like names
  const candidates = [...otherNames].filter(n => !NOT_NAMES.has(n));
  if (candidates.length >= 2) {
    issues.push({
      priority: 'High',
      issueType: 'Possible Wrong Name',
      exactSentence: '(Across the whole comment)',
      exactMistake: `Other capitalised names found: ${candidates.slice(0,3).join(', ')}`,
      whyItMatters: 'This comment may contain another student\'s name — possible copy-paste error.',
      exactFix: `Check that the comment refers to ${studentName} throughout, not to another student.`,
      improvedSentence: '(Review the comment carefully and replace any incorrect names.)',
      ibAtlLink: '',
      confidence: 'Medium'
    });
  }
  return issues;
}

// ── MISSING NEXT STEP ─────────────────────────────────────
function checkMissingNextStep(sectionText, sentences, studentName, sectionType) {
  const issues = [];
  const hasNextStep = /next step|moving forward|is encouraged to|will continue|should (focus|practise|try|explore|work)|a goal for|to further|in order to improve|to strengthen|to develop|to extend|to build on/i.test(sectionText);
  const wordCount = sectionText.split(/\s+/).length;
  if (!hasNextStep && wordCount > 25) {
    const name = studentName || 'This student';
    let improved = '';
    if (sectionType === 'Student as a Learner') {
      improved = `Moving forward, ${name} is encouraged to strengthen ${name === 'This student' ? 'their' : 'their'} self-management skills by using success criteria to check work more independently.`;
    } else if (sectionType === 'Unit of Inquiry') {
      improved = `Moving forward, ${name} is encouraged to make deeper connections between unit concepts and real-life examples, and to use evidence to support thinking.`;
    } else {
      improved = `A next step for ${name} is to [specific skill], which will help to strengthen [area] further.`;
    }
    issues.push({
      priority: 'Medium',
      issueType: 'Missing Next Step',
      exactSentence: sentences[sentences.length - 1] || '(Last sentence of comment)',
      exactMistake: 'No clear next step is included in this comment.',
      whyItMatters: 'IB report comments should include a forward-looking next step so parents know what to support at home.',
      exactFix: 'Add a final sentence beginning with "Moving forward, …" or "A next step for … is to …"',
      improvedSentence: improved,
      ibAtlLink: '',
      confidence: 'High'
    });
  }
  return issues;
}

// ── IB/ATL LANGUAGE CHECK (SAL + UOI only) ───────────────
function checkIBATLLanguage(sectionText, sentences, sectionType, studentName, pronounGroup) {
  const issues = [];
  const t = sectionText.toLowerCase();

  const hasLPAlready = LP_ATTRS.some(a => t.includes(a));
  const hasATLAlready = ATL_SKILLS.some(s => t.includes(s));
  if (hasLPAlready && hasATLAlready) return issues; // already good

  const name = studentName || 'This student';
  const gp   = pronounGroup?.poss || 'their';

  // Find a matching synonym in the text
  for (const mapping of LP_SYNONYM_MAP) {
    const m = sectionText.match(mapping.re);
    if (!m) continue;

    // Find the sentence containing this match
    const matchSentence = sentences.find(s => s.includes(m[0])) || sentences[0];
    const templates = sectionType === 'Unit of Inquiry' ? UOI_TEMPLATES : SAL_TEMPLATES;
    const templateFn = templates[mapping.attr];
    const improved = templateFn ? templateFn(name, gp) : matchSentence;

    issues.push({
      priority: 'Medium',
      issueType: 'IB/ATL Language — Enhancement',
      exactSentence: matchSentence,
      exactMistake: `"${m[0]}" — could be expressed with IB language`,
      whyItMatters: `${sectionType} comments benefit from explicit IB Learner Profile and ATL language.`,
      exactFix: `Rephrase to include the "${mapping.attr}" Learner Profile attribute and ${mapping.atl}.`,
      improvedSentence: improved,
      ibAtlLink: `LPA: ${mapping.attr}; ATL: ${mapping.atl}`,
      confidence: 'Medium'
    });

    if (issues.length >= 1) break; // max 1 IB suggestion per section
  }

  // If nothing matched synonyms but section has no IB language at all
  if (issues.length === 0 && !hasLPAlready && !hasATLAlready) {
    const templateFn = sectionType === 'Unit of Inquiry'
      ? UOI_TEMPLATES['knowledgeable']
      : SAL_TEMPLATES['reflective'];
    issues.push({
      priority: 'Medium',
      issueType: 'IB/ATL Language — Missing',
      exactSentence: sentences[0] || sectionText.substring(0, 100),
      exactMistake: '(No IB Learner Profile or ATL language found in this comment)',
      whyItMatters: `${sectionType} comments should include at least one IB Learner Profile attribute and ATL skill.`,
      exactFix: 'Add an IB connection, e.g. reference to a Learner Profile attribute such as "reflective", "inquirer", or "communicator".',
      improvedSentence: templateFn ? templateFn(name, gp) : '(Add an IB Learner Profile attribute to the comment.)',
      ibAtlLink: sectionType === 'Unit of Inquiry' ? 'LPA: thinker; ATL: thinking skills' : 'LPA: reflective; ATL: self-management skills',
      confidence: 'Medium'
    });
  }

  return issues;
}

// ── STUDENT LEVEL CHECK ───────────────────────────────────
function checkStudentLevel(sectionText, selectedLevel, studentName) {
  const issues = [];
  if (selectedLevel === 'none') return issues;
  const name = studentName || 'This student';

  const positive = (sectionText.match(/\b(excell?ent|outstanding|exception|impressive|strength|superb|brilliant|high[- ]level|advanced|deep understanding|consistently|beyond|exceeds?)\b/gi) || []).length;
  const supportLang = (sectionText.match(/\b(with support|with guidance|scaffolding|visual prompts?|check-?in|not yet|beginning to|emerging|struggles?|finds? it challenging)\b/gi) || []).length;
  const hasClearStrength = /\b(shows?|demonstrates?|excels?|achieves?|understands?|applies?|contributes?)\b/i.test(sectionText);
  const hasNextStep = /next step|moving forward|encouraged to|will continue|should|to strengthen|to develop/i.test(sectionText);

  let improved = '';

  if (selectedLevel === 'emerging') {
    if (positive > 3 && supportLang === 0) {
      improved = `Moving forward, ${name} will benefit from continued scaffolding, visual prompts, and teacher check-ins to support independence.`;
      issues.push({
        priority: 'Medium',
        issueType: 'Level Check — Mismatch',
        exactSentence: '(Overall comment)',
        exactMistake: 'Comment sounds too advanced for an Emerging/High support student — no scaffolding or support language included.',
        whyItMatters: 'The comment does not reflect the support this student needs.',
        exactFix: 'Add a sentence about the support strategies being used.',
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'Medium'
      });
    }
  } else if (selectedLevel === 'developing') {
    if (!hasNextStep) {
      improved = `${name} is developing confidence in this area and is encouraged to continue using feedback and success criteria to strengthen independence.`;
      issues.push({
        priority: 'Medium',
        issueType: 'Level Check — Missing Progress + Next Step',
        exactSentence: '(Overall comment)',
        exactMistake: 'Comment does not include a clear next step for a Developing student.',
        whyItMatters: 'Developing students should have a clear next step so parents can support progress at home.',
        exactFix: 'Add a sentence about progress and the specific next step.',
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'Medium'
      });
    }
  } else if (selectedLevel === 'secure') {
    if (supportLang > 2) {
      improved = `${name} consistently demonstrates this skill and is now encouraged to apply it more independently across different learning situations.`;
      issues.push({
        priority: 'Medium',
        issueType: 'Level Check — Too Support-Heavy',
        exactSentence: '(Overall comment)',
        exactMistake: 'Comment has too much support/scaffolding language for a Secure/Meeting Expectations student.',
        whyItMatters: 'A student meeting expectations should be described with confident, independent language.',
        exactFix: 'Reduce support language and emphasise independence and application.',
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'Medium'
      });
    }
  } else if (selectedLevel === 'extending') {
    if (positive < 2 || !hasClearStrength) {
      improved = `To extend this further, ${name} is encouraged to apply these skills more independently, make deeper connections, and take a leadership role during collaborative tasks.`;
      issues.push({
        priority: 'Medium',
        issueType: 'Level Check — Comment Too Basic',
        exactSentence: '(Overall comment)',
        exactMistake: 'Comment sounds too basic for an Extending/Exceeding student.',
        whyItMatters: 'Extending students should have strong strengths acknowledged with a challenge-focused next step.',
        exactFix: 'Acknowledge specific strengths and add an extension-level next step.',
        improvedSentence: improved,
        ibAtlLink: '',
        confidence: 'Medium'
      });
    }
  }

  return issues;
}

/* ═══════════════════════════════════════════════════════════
   ORCHESTRATOR — run all checks on one section
═══════════════════════════════════════════════════════════ */
function checkSection(sectionText, studentName, selectedLevel, settings) {
  const { strictness, reportTypeOverride, includeIB, includeEAL, includeStyle } = settings;
  const sectionType   = detectReportArea(sectionText, reportTypeOverride);
  const sentences     = splitSentences(sectionText);
  const pronounGroup  = detectPronounGroup(sectionText);

  let issues = [];

  // Section-level checks
  issues.push(...checkPronounMix(sectionText));
  issues.push(...checkWrongName(sectionText, studentName));
  issues.push(...checkMissingNextStep(sectionText, sentences, studentName, sectionType));
  issues.push(...checkStudentLevel(sectionText, selectedLevel, studentName));

  // Per-sentence checks
  for (const sentence of sentences) {
    issues.push(...checkAAnRule(sentence));
    issues.push(...checkSpelling(sentence));
    issues.push(...checkNegativeTone(sentence));
    issues.push(...checkIncompleteSentence(sentence));
    if (includeEAL) issues.push(...checkEALClarity(sentence));
    if (includeStyle) issues.push(...checkPunctuationSpacing(sentence));
  }

  // IB/ATL (only for SAL and UOI)
  if (includeIB && (sectionType === 'Student as a Learner' || sectionType === 'Unit of Inquiry')) {
    issues.push(...checkIBATLLanguage(sectionText, sentences, sectionType, studentName, pronounGroup));
  }

  // Add student name + section type to every issue
  issues = issues.map(i => ({ ...i, studentName, sectionType }));

  // Strictness filter
  if (strictness === 'light')    issues = issues.filter(i => i.priority === 'High');
  else if (strictness === 'balanced') issues = issues.filter(i => i.priority !== 'Low');

  // Non-nitpicky cap: max 5 per section (all High first, then Medium, then Low)
  const high   = issues.filter(i => i.priority === 'High');
  const medium = issues.filter(i => i.priority === 'Medium');
  const low    = issues.filter(i => i.priority === 'Low');
  let capped = [...high];
  if (capped.length < 5) capped = capped.concat(medium.slice(0, 5 - capped.length));
  if (capped.length < 5) capped = capped.concat(low.slice(0, 5 - capped.length));

  if (capped.length === 0) {
    capped = [{
      studentName,
      sectionType,
      priority: 'OK',
      issueType: 'No major issues found',
      exactSentence: '—',
      exactMistake: '—',
      whyItMatters: 'This comment looks good!',
      exactFix: '—',
      improvedSentence: 'No major issues found. Please still complete a final teacher read-through.',
      ibAtlLink: '',
      confidence: 'High'
    }];
  }

  return { sectionType, issues: capped };
}

/* ═══════════════════════════════════════════════════════════
   RENDER RESULTS
═══════════════════════════════════════════════════════════ */
function priorityClass(p) {
  if (p === 'High')   return 'badge-high';
  if (p === 'Medium') return 'badge-medium';
  if (p === 'Low')    return 'badge-low';
  return 'badge-ok';
}

function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderResults(allResults) {
  const tbody   = document.getElementById('tableBody');
  const summaryEl = document.getElementById('summary');
  tbody.innerHTML = '';

  let highCount = 0, medCount = 0, lowCount = 0, okCount = 0;

  allResults.forEach(({ name, sectionType, issues }) => {
    issues.forEach((issue, idx) => {
      if      (issue.priority === 'High')   highCount++;
      else if (issue.priority === 'Medium') medCount++;
      else if (issue.priority === 'Low')    lowCount++;
      else                                   okCount++;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx === 0 ? `<strong>${escHtml(name)}</strong>` : ''}</td>
        <td>${idx === 0 ? `<span class="area-tag">${escHtml(sectionType)}</span>` : ''}</td>
        <td><span class="badge-pill ${priorityClass(issue.priority)}">${escHtml(issue.priority)}</span></td>
        <td>${escHtml(issue.issueType)}</td>
        <td class="exact-sentence">${escHtml(issue.exactSentence)}</td>
        <td class="exact-mistake">${escHtml(issue.exactMistake)}</td>
        <td>${escHtml(issue.whyItMatters)}</td>
        <td>${escHtml(issue.exactFix)}</td>
        <td class="improved-cell">${escHtml(issue.improvedSentence)}</td>
        <td class="ib-cell">${escHtml(issue.ibAtlLink)}</td>
      `;
      tbody.appendChild(tr);
    });
  });

  summaryEl.innerHTML = `
    <div class="summary-pill pill-red">  <span>${highCount}</span>High priority</div>
    <div class="summary-pill pill-amber"><span>${medCount}</span>Medium priority</div>
    <div class="summary-pill pill-blue"> <span>${lowCount}</span>Low priority</div>
    <div class="summary-pill pill-green"><span>${okCount}</span>Sections OK</div>
  `;

  document.getElementById('resultsSection').hidden = false;
  document.getElementById('downloadPdfBtn').hidden  = false;
  document.getElementById('downloadHtmlBtn').hidden = false;
  document.getElementById('downloadCsvBtn').hidden  = false;
  document.getElementById('resultsSection').scrollIntoView({ behavior: 'smooth' });

  window._lastResults  = allResults;
}

/* ═══════════════════════════════════════════════════════════
   PDF DOWNLOAD (jsPDF + autotable, landscape)
═══════════════════════════════════════════════════════════ */
function downloadPdf(allResults, filename) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const dateStr = new Date().toLocaleDateString();
  let highC=0, medC=0, lowC=0, okC=0;
  allResults.forEach(r => r.issues.forEach(i => {
    if (i.priority==='High') highC++;
    else if (i.priority==='Medium') medC++;
    else if (i.priority==='Low') lowC++;
    else okC++;
  }));

  // Title block
  doc.setFontSize(18);
  doc.setTextColor(31, 78, 121);
  doc.text('IB Report Card Feedback', 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`File: ${filename}    Date: ${dateStr}    High: ${highC}  Medium: ${medC}  Low: ${lowC}  OK: ${okC}`, 14, 26);
  doc.setTextColor(180, 80, 0);
  doc.text('This tool gives high-confidence suggestions only. Please complete a final teacher read-through before submitting reports.', 14, 32);

  // Build table rows
  const rows = [];
  allResults.forEach(({ name, sectionType, issues }) => {
    issues.forEach((issue, idx) => {
      rows.push([
        idx === 0 ? name : '',
        idx === 0 ? sectionType : '',
        issue.priority,
        issue.issueType,
        issue.exactSentence,
        issue.exactMistake,
        issue.whyItMatters,
        issue.exactFix,
        issue.improvedSentence,
        issue.ibAtlLink
      ]);
    });
  });

  doc.autoTable({
    startY: 36,
    head: [['Student / Section','Report Area','Priority','Issue Type','Exact Sentence','Exact Mistake','Why It Matters','Exact Fix','Improved Sentence','IB / ATL Link']],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [31, 78, 121], fontSize: 7, cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, valign: 'top' },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 22 },
      2: { cellWidth: 14 },
      3: { cellWidth: 24 },
      4: { cellWidth: 40 },
      5: { cellWidth: 28 },
      6: { cellWidth: 28 },
      7: { cellWidth: 28 },
      8: { cellWidth: 42 },
      9: { cellWidth: 24 }
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 2) {
        const p = data.cell.raw;
        if (p === 'High')   { data.cell.styles.fillColor = [253, 232, 232]; data.cell.styles.textColor = [192, 57, 43]; }
        if (p === 'Medium') { data.cell.styles.fillColor = [255, 248, 225]; data.cell.styles.textColor = [196, 125, 0]; }
        if (p === 'Low')    { data.cell.styles.fillColor = [232, 241, 255]; data.cell.styles.textColor = [31, 78, 121]; }
        if (p === 'OK')     { data.cell.styles.fillColor = [232, 248, 238]; data.cell.styles.textColor = [23, 107, 52]; }
      }
      if (data.section === 'body' && data.column.index === 8) {
        data.cell.styles.textColor = [23, 107, 52];
      }
    }
  });

  doc.save(filename.replace(/\.[^.]+$/, '') + '_feedback.pdf');
}

/* ── HTML DOWNLOAD ──────────────────────────────────────── */
function downloadHtml(allResults, filename) {
  const rows = allResults.flatMap(({ name, sectionType, issues }) =>
    issues.map((issue, idx) => `
      <tr>
        <td>${idx===0 ? `<strong>${escHtml(name)}</strong>` : ''}</td>
        <td>${idx===0 ? `<span style="background:#f0f4ff;color:#2d5099;border:1px solid #c5d5f5;border-radius:4px;padding:2px 7px;font-size:11px;font-weight:700">${escHtml(sectionType)}</span>` : ''}</td>
        <td><span style="padding:3px 9px;border-radius:99px;font-size:12px;font-weight:700;${pStyle(issue.priority)}">${escHtml(issue.priority)}</span></td>
        <td>${escHtml(issue.issueType)}</td>
        <td style="font-style:italic;color:#374151">${escHtml(issue.exactSentence)}</td>
        <td style="color:#c0392b;font-weight:600">${escHtml(issue.exactMistake)}</td>
        <td>${escHtml(issue.whyItMatters)}</td>
        <td>${escHtml(issue.exactFix)}</td>
        <td style="color:#176b34">${escHtml(issue.improvedSentence)}</td>
        <td style="color:#1f4e79;font-size:11px">${escHtml(issue.ibAtlLink)}</td>
      </tr>`)
  ).join('');

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Report Card Feedback</title>
<style>body{font-family:Arial,sans-serif;margin:0;padding:28px;background:#f5f7fb;font-size:12px}
h1{color:#1f4e79;margin:0 0 4px}p{color:#6b7280;margin:0 0 16px}
table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 4px 14px rgba(31,78,121,.1)}
thead th{background:#1f4e79;color:#fff;padding:9px 12px;text-align:left;font-size:11px;letter-spacing:.03em;white-space:nowrap}
tbody td{padding:8px 12px;border-bottom:1px solid #edf0f7;vertical-align:top;line-height:1.4}
tbody tr:last-child td{border-bottom:none}tbody tr:hover td{background:#f9fafd}
.note{margin-top:14px;background:#fff8e1;border:1px solid #ffe082;color:#725000;padding:10px 14px;border-radius:8px}</style>
</head><body>
<h1>Report Card Feedback</h1>
<p>File: ${escHtml(filename)} &nbsp;|&nbsp; ${new Date().toLocaleDateString()}</p>
<table><thead><tr><th>Student/Section</th><th>Report Area</th><th>Priority</th><th>Issue Type</th>
<th>Exact Sentence</th><th>Exact Mistake</th><th>Why It Matters</th><th>Exact Fix</th>
<th>Improved Sentence</th><th>IB/ATL Link</th></tr></thead><tbody>${rows}</tbody></table>
<p class="note">&#9888; This tool gives high-confidence suggestions only. Please complete a final teacher read-through before submitting reports.</p>
</body></html>`;

  triggerDownload(new Blob([html], {type:'text/html;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.html');
}

function pStyle(p) {
  if (p==='High')   return 'background:#fde8e8;color:#c0392b;border:1px solid #f5c6c6';
  if (p==='Medium') return 'background:#fff8e1;color:#c47d00;border:1px solid #ffe082';
  if (p==='Low')    return 'background:#e8f1ff;color:#1f4e79;border:1px solid #c3d7f5';
  return 'background:#e8f8ee;color:#176b34;border:1px solid #bde8ca';
}

/* ── CSV DOWNLOAD ───────────────────────────────────────── */
function downloadCsv(allResults, filename) {
  const headers = ['Student/Section','Report Area','Priority','Issue Type','Exact Sentence From Report','Exact Mistake','Why It Matters','Exact Fix','Improved Sentence','IB/ATL Link'];
  const rows = allResults.flatMap(({ name, sectionType, issues }) =>
    issues.map(i => [name, sectionType, i.priority, i.issueType, i.exactSentence, i.exactMistake, i.whyItMatters, i.exactFix, i.improvedSentence, i.ibAtlLink])
  );
  const csv = [headers, ...rows].map(row => row.map(c => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  triggerDownload(new Blob([csv],{type:'text/csv;charset=utf-8'}), filename.replace(/\.[^.]+$/,'')+'_feedback.csv');
}

function triggerDownload(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
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
    if (ext === 'docx') {
      fullText = await readDocx(file);
    } else if (ext === 'pdf') {
      fullText = await readPdf(file);
    } else {
      alert('Unsupported file type. Please upload a .pdf or .docx file.');
      return;
    }
  } catch (err) {
    alert('Could not read the file. Make sure it is not password-protected.\n\nError: ' + err.message);
    return;
  }

  if (!fullText || fullText.trim().length < 30) {
    alert('This PDF looks scanned. Please export it as a text-based PDF or .docx first.\n\nScanned PDFs cannot be read by this tool — the text must be selectable in the original file.');
    return;
  }

  const sections = splitIntoSections(fullText);

  const settings = {
    strictness:       document.querySelector('input[name="strictness"]:checked')?.value || 'balanced',
    reportTypeOverride: document.getElementById('reportTypeSelect').value,
    includeIB:        document.getElementById('chkIB').checked,
    includeEAL:       document.getElementById('chkEAL').checked,
    includeStyle:     document.getElementById('chkStyle').checked,
  };
  const selectedLevel = document.getElementById('levelSelect').value;

  const allResults = sections.map((sec, idx) => {
    const name = detectStudentName(sec) || `Section ${idx + 1}`;
    const { sectionType, issues } = checkSection(sec, name, selectedLevel, settings);
    return { name, sectionType, issues };
  });

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
