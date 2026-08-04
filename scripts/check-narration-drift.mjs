// Compares every narration script in tutorial-placeholder-narration.json against
// the title and body of its step, in both directions. Run from the repo root:
//
//   node scripts/check-narration-drift.mjs
//
// Why this exists: the script in the JSON is what was fed to the TTS, so it is
// what the customer HEARS. The step's body is what a screen reader ANNOUNCES.
// When the two drift apart, a blind customer and a hearing one are told
// different things, and there is nothing in the app that would ever surface it.
// One audit found sixteen drifted steps, three of which had audio that flatly
// contradicted the step - including one that sat waiting for the customer to add
// a property while the narration never mentioned doing so.
//
// Three findings, in descending order of how much they matter:
//
//   DRIFT        the script and the body say different things. Decide which side
//                is right: if the clip is already recorded and the difference is
//                cosmetic, move the BODY onto the clip and record nothing. If the
//                body is the newer, better text, move the script onto it and add
//                the clip to the re-record list.
//   DEAD SCRIPT  a script whose step no longer exists. Delete it.
//   NO SCRIPT    a step with no script here at all. Usually harmless: most of
//                these were recorded before this file was kept as a record, so
//                the clip exists and only the paper trail is missing. It does
//                mean those steps are invisible to this checker, so their bodies
//                can drift from their clips undetected. Do not "fix" them by
//                copying the body in - that would fabricate a record of what was
//                recorded, and if the two already disagree it cements the wrong
//                text. A step here with no clip on disk is a different matter:
//                the audio preflight silently drops it, so it never appears.
//
// Note that a few scripts open straight into the body with no spoken title line,
// so both arrangements are accepted below.
import fs from 'fs';
const j = JSON.parse(fs.readFileSync('tutorial-placeholder-narration.json','utf8'));
const norm = s => s.replace(/\s+/g,' ').trim();
let issues = 0;
for (const key of Object.keys(j)) {
  if (!Array.isArray(j[key])) continue;
  const src = key === 'property' ? 'src/lib/propertyTutorial.ts' : 'src/lib/tutorial.ts';
  const code = fs.readFileSync(src,'utf8');
  const stepIds = [...code.matchAll(/id:\s*"([^"]+)"/g)].map(m=>m[1]);
  for (const e of j[key]) {
    if (!e.id || !e.text) continue;
    const re = new RegExp('id:\\s*"'+e.id+'"[\\s\\S]{0,3000}?body:\\s*"((?:[^"\\\\]|\\\\.)*)"');
    const m = code.match(re);
    if (!m) { console.log('DEAD SCRIPT (no step) ['+key+'] '+e.id); issues++; continue; }
    const body = norm(JSON.parse('"'+m[1]+'"'));
    const lines = e.text.split('\n').map(l=>l.replace(/^\[Alice\]\s*/,'').trim()).filter(Boolean);
    if (norm(lines.slice(1).join(' ')) === body) continue;   // title line + body
    if (norm(lines.join(' ')) === body) continue;            // body only, no title line
    console.log('DRIFT ['+key+'] '+e.id);
    console.log('  body  : '+body);
    console.log('  script: '+norm(lines.join(' ')));
    issues++;
  }
  // The other direction: a step with no script at all never gets a clip, and the
  // audio preflight silently drops it, so it is invisible rather than broken.
  for (const id of stepIds) {
    if (!j[key].some(e => e.id === id)) { console.log('NO SCRIPT ['+key+'] '+id); issues++; }
  }
}
console.log(issues ? issues+' issue(s)' : 'no drift');
