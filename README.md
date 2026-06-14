# IB Report Card Comment Checker

A private, browser-based tool for IB PYP teachers to check report card comments before submission.

## What it checks

- Grammar, spelling & punctuation
- Wrong student name or pronoun mix-up (copy-paste detection)
- Negative or informal tone
- Missing next step or target
- IB Learner Profile & ATL skills (in UOI and Student as Learner comments)
- EAL clarity: long sentences, stacked clauses, idioms, vague phrases
- Vague language (not actionable for parents)
- Level mismatch (comment doesn't match the student's grade level)
- **Auto-detects Report Area**: UOI, Student as Learner, Mathematics, Language Arts, Science, Specialist, General

## Privacy

All processing happens in your browser. No file is ever uploaded to any server. Student data never leaves your device.

## How to use

1. Go to the website (GitHub Pages URL)
2. Optionally expand **Settings** to choose strictness, comment type, and which checks to run
3. Upload a `.pdf` or `.docx` report card file
4. Optionally select the student level to enable level-match checking
5. Click **Check Comments**
6. Review the table and download as `.html` or `.csv`

## How to publish to GitHub Pages

1. Create a new GitHub repository (e.g. `rc-checker`)
2. Upload all these files to the repository
3. Go to **Settings → Pages**
4. Under **Source**, choose **GitHub Actions**
5. The deploy workflow runs automatically on every push to `main`
6. Your site will be live at `https://yourusername.github.io/rc-checker/`

## Files

| File | Purpose |
|------|---------|
| `index.html` | Main page structure and UI |
| `style.css` | Professional styling |
| `app.js` | All checking logic (runs in browser) |
| `.github/workflows/deploy.yml` | Auto-deploy to GitHub Pages |
