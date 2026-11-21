import { Tier, FLOWS, allChoices, proposal } from "./step.js";
import { TikTabs } from "./tiktabs.js";
import { Curriculum } from "./data.js";


/**
 * Deterministic fast path (what a transcript means, worked out on the device before any LLM call).
 * Constrained answers (an option's word or number, the fixed commands) are matched locally for low
 * latency and offline use (FR-54, FR-55). Anything else goes to Claude when a key is set.
 * Intents: {type:"command",name} {type:"choose",choiceId} {type:"goto",flow} {type:"confirm"} {type:"cancel"} {type:"none"}
 */
const numbers = {
  "1": 1, one: 1, first: 1, "option one": 1, "number one": 1,
  "2": 2, two: 2, second: 2, to: 2, too: 2, "option two": 2, "number two": 2,
  "3": 3, three: 3, third: 3, tree: 3, "option three": 3, "number three": 3,
  "4": 4, four: 4, fourth: 4, for: 4, "option four": 4, "number four": 4,
};

export const COMMANDS = {
  what_did_you_do: ["what did you just do", "what did you do", "what just happened"],
  where_am_i: ["where am i", "where are we"],
  voice_off: ["turn off voice guide", "voice guide off", "stop guiding me"],
  voice_on: ["turn on voice guide", "voice guide on"],
  repeat: ["repeat", "say again", "say that again", "pardon", "come again", "repeat that"],
  back: ["back", "go back", "previous screen"],
  help: ["help", "what can i say", "help me"],
  home: ["home", "go home", "go to home", "main menu"],
  stop: ["stop", "stop talking", "quiet", "be quiet", "sleep"],
  why: ["why", "why that", "why this", "why did you suggest that"],
  undo: ["undo", "undo that", "undo it", "go back to before", "reverse that"],
  next_tab: ["next tab", "next section", "go to next tab", "following tab"],
  prev_tab: ["previous tab", "previous section", "last tab", "go to previous tab", "back a tab"],
  sign_out: ["sign out", "log out", "sign me out"],
};

const yes = new Set(["yes", "yes please", "yeah", "yep", "okay", "ok", "correct", "confirm", "sure", "haan", "ha"]);
const cancel = new Set(["no", "cancel", "don't", "do not", "stop that", "no thanks", "nahi"]);

export const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, " ").replace(/\s+/g, " ").trim();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wc = (t) => t.split(" ").length;

/** 1.0 = same text; based on edit distance, so a one-letter mishearing of a long word still scores high. */
export function similarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

export function match(text, step, pending) {
  const t = normalize(text);
  if (!t) return { type: "none" };

  if (pending) {
    if (cancel.has(t)) return { type: "cancel" };
    const word = normalize(pending.choice.commitWord || pending.choice.label);
    if (t.includes(word)) return { type: "confirm" };
    if (pending.choice.tier === Tier.CHANGE && (yes.has(t) || pending.choice.words.some((w) => t === normalize(w)))) return { type: "confirm" };
  }

  for (const [name, phrases] of Object.entries(COMMANDS)) if (phrases.includes(t)) return { type: "command", name };

  // TIK tabs: "activities tab", "open materials", "summary"
  if (step.tik) { const i = TikTabs.parse(t); if (i !== null) return { type: "command", name: `tab:${i}` }; }

  // a number ("2", "two", "option two") picks the nth option in the fixed order (AC-48.2)
  const n = numbers[t];
  if (n && step.choices[n - 1]) return { type: "choose", choiceId: step.choices[n - 1].id };

  const all = allChoices(step);
  const exact = all.find((c) => normalize(c.label) === t || c.words.some((w) => normalize(w) === t));
  if (exact) return { type: "choose", choiceId: exact.id };

  // "yes" / "okay" to the one thing the agent just offered ("How about chapter 2?")
  if (yes.has(t)) { const p = proposal(step); if (p) return { type: "choose", choiceId: p.id }; }

  // a request with its details ("plan class 7 science for Thursday") fills them all at once (FR-102),
  // instead of its one keyword ("plan") picking a button and the details being lost
  if (!pending && !step.freeSpeech) {
    const o = opening(text);
    if (o && o.explicit && (o.classNum != null || o.chapter)) return { type: "open", ...o };
  }

  // short utterance containing a label or word ("yes, approve it")
  if (wc(t) <= 6) {
    const hits = all.filter((c) => [c.label, ...c.words].map(normalize).filter((w) => w.length >= 3).some((w) => new RegExp(`\\b${esc(w)}\\b`).test(t)));
    if (hits.length === 1) return { type: "choose", choiceId: hits[0].id };
  }

  // flow names (AC-48.4): "go to workspace", "quiz"
  if (wc(t) <= 5) for (const f of FLOWS) if (f.words.some((w) => t === w || t === `go to ${w}` || t === `open ${w}`)) return { type: "goto", flow: f };

  // misheard option word ("approved" for "approve"): one clear best match only
  if (wc(t) <= 4 && all.length) {
    const scored = all.map((c) => [c, Math.max(...[c.label, ...c.words].map((w) => similarity(t, normalize(w))))]);
    scored.sort((a, b) => b[1] - a[1]);
    const best = scored[0], second = scored[1] ? scored[1][1] : 0;
    if (best[1] >= 0.8 && best[1] - second >= 0.15) return { type: "choose", choiceId: best[0].id };
  }
  return { type: "none" };
}

const classWords = { five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };

/** Offline parse of an opening request (FR-102), used when no Claude key is set. Returns null when it is not one. */
export function opening(text) {
  const t = normalize(text);
  const toNum = (w) => (w == null ? null : (parseInt(w.replace(/th$/, ""), 10) || classWords[w] || null));
  // "class 7", "class seven", "seventh class", "7th standard": keep the first candidate that is a number
  const c1 = t.match(/\b(?:class|grade|standard|std)\s+(\d{1,2}(?:th)?|[a-z]+)\b/);
  const c2 = t.match(/\b(\d{1,2}(?:th)?|[a-z]+)\s+(?:class|grade|standard|std)\b/);
  const cls = toNum(c1 && c1[1]) ?? toNum(c2 && c2[1]);
  let intent = null;
  if (/what (?:should|do|shall|can) i teach|teach next|what is my lesson plan|what's next/.test(t)) intent = "next";
  else if (t.includes("quiz")) intent = "quiz";
  else if (t.startsWith("teach") || t.includes("start class")) intent = "teach";
  else if (t.includes("plan") || t.includes("prepare") || cls != null) intent = "plan";
  if (!intent) return null;
  const ch = Curriculum.findChapter(cls, t);
  // explicit: the teacher said what to do, not only a class ("class 7" alone answers a "Which class?")
  const explicit = intent !== "plan" || /\b(plan|prepare)\b/.test(t);
  return { intent, classNum: cls, chapter: ch ? ch.name : null, explicit };
}

/** Words the recogniser should expect at this step (FR-101). */
export function hints(step) {
  const w = [...allChoices(step).flatMap((c) => [c.label, ...c.words]), ...Object.values(COMMANDS).flat(), "yes", "no", "cancel", "approve", "save"];
  return [...new Set(w.map((x) => x.toLowerCase()))].slice(0, 100);
}
