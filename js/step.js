import { TikTabs } from "./tiktabs.js";
import { LANG_CODE } from "./data.js";

/** FR-98 risk tiers: what confirmation an action needs. */
export const Tier = { READ: "READ", MOVE: "MOVE", CHANGE: "CHANGE", COMMIT: "COMMIT" };
/** Who caused an action. SYSTEM = the app itself (for example lesson audio finished). */
export const Source = { BUTTON: "button", VOICE: "voice", SYSTEM: "system" };

export const Flow = {
  HOME: { key: "HOME", label: "Home", words: ["home", "main menu", "start"] },
  SCHEDULE: { key: "SCHEDULE", label: "Calendar Scheduling", words: ["schedule", "my schedule", "calendar", "my week", "timetable"] },
  PLAN: { key: "PLAN", label: "Content/TIK generation", words: ["plan", "plan a lesson", "prepare", "tik", "lesson plan", "content", "tik generation"] },
  TEACH: { key: "TEACH", label: "Teaching", words: ["teach", "start class", "teaching", "class"] },
  QUIZ: { key: "QUIZ", label: "Assessment/Quiz", words: ["quiz", "assessment", "test"] },
  FOLLOWUP: { key: "FOLLOWUP", label: "Post class feedback and remediation", words: ["follow up", "follow-up", "followups", "remediation", "class record", "records", "feedback"] },
  WORKSPACE: { key: "WORKSPACE", label: "Workspace", words: ["workspace", "my workspace", "my content", "all my content", "my tiks", "my audio", "my quizzes", "library"] },
  SETUP: { key: "SETUP", label: "Getting set up", words: [] },
};
export const FLOWS = Object.values(Flow);

/** One named action at a step (FR-96). Buttons and the agent call the same id. */
export const choice = (id, label, o = {}) => ({ id, label, tier: Tier.MOVE, words: [], enabled: true, whyDisabled: null, suggested: false, readBack: null, commitWord: null, ...o });

export const section = (heading, lines, o = {}) => ({ heading, lines, emphasis: false, lang: null, ...o });

/** FR-97 step description. Every screen is built from one of these; the agent works from it, never from the layout. */
export const makeStep = (id, flow, title, question, choices, o = {}) => ({
  id, flow, title, question, choices,
  announce: null, banner: null, known: [], sections: [], secondary: [], freeSpeech: null,
  suggestion: null, inClass: false, help: null, tik: null, progress: null, contentLang: null, ...o,
});

export const allChoices = (s) => [...s.choices, ...s.secondary];

// ---------------------------------------------------------------- content language markers (FR-110)
// Text in Hindi, Tamil or Bengali is wrapped so the speech layer reads it in a voice for that language,
// never in the agent's English voice. The screen shows the text with its lang attribute instead.
const OPEN = "⟦", CLOSE = "⟧";
export function inLang(lang, text) {
  if (!lang || lang === "English" || !text) return text;
  return `${OPEN}${lang}${CLOSE}${text}${OPEN}/${CLOSE}`;
}
/** "abc ⟦Hindi⟧xyz⟦/⟧ def" -> [{text:"abc", lang:null}, {text:"xyz", lang:"Hindi"}, {text:"def", lang:null}] */
export function splitLang(s) {
  const out = [];
  const re = new RegExp(`${OPEN}([A-Za-z]+)${CLOSE}([\\s\\S]*?)${OPEN}/${CLOSE}`, "g");
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index), lang: null });
    out.push({ text: m[2], lang: m[1] });
    last = re.lastIndex;
  }
  if (last < s.length) out.push({ text: s.slice(last), lang: null });
  return out.filter((p) => p.text.trim());
}
export const stripLang = (s) => splitLang(s || "").map((p) => p.text.trim()).join(" ");
export const langCode = (lang) => LANG_CODE[lang] || "en-IN";

const trimDot = (s) => s.replace(/\.+$/, "");

// Options the agent talks about. Leaving, paging and the menu are always there, so they are not read out.
const QUIET = new Set(["home", "__more", "__first", "menu"]);
const talkable = (s) => s.choices.filter((c) => c.enabled && !QUIET.has(c.id));
/** How an option is said: "Chapter 1: Exploring Magnets (next)" -> "chapter 1, Exploring Magnets". */
export const sayLabel = (l) => l.replace(/ \(next\)$/, "").replace(/\?$/, "").replace(/^Same as last time: /, "").replace(/: /g, ", ").replace(/^(Chapter|Class|Period) /, (m) => m.toLowerCase()).replace(/^\+ /, "");
const orList = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1]);
const keyWord = (l) => sayLabel(l).toLowerCase().split(/[ ,]+/).find((w) => w.length > 3 && !["with", "from", "this", "your", "that"].includes(w)) || sayLabel(l).toLowerCase();

/** The one option the agent offers first, like "Same as last time?" or the next chapter (FR-87). Null when there is no clear one. */
export function proposal(s) { return talkable(s).find((c) => c.suggested) || null; }

/**
 * The choices in plain words, never as a numbered phone menu: a suggestion first when there is one, otherwise
 * the options the question has not already named. Numbers still work when the teacher says them.
 */
export function optionsPhrase(s, full = false) {
  const opts = talkable(s);
  if (!opts.length) return "";
  const more = s.choices.some((c) => c.id === "__more") ? " There are more choices too; just say more." : "";
  const p = proposal(s);
  if (p && !full) {
    // one offer, like a person would make it; at most one named alternative
    const rest = opts.filter((c) => c !== p);
    const offer = p.label.startsWith("Same as last time") ? `Same as last time, ${sayLabel(p.label)}?` : `How about ${sayLabel(p.label)}?`;
    // the reason goes with the offer, as a person would give it: "It comes next in the textbook." (FR-88)
    const why = s.suggestion && s.suggestion.choiceId === p.id ? ` ${s.suggestion.reason.replace(/^because /, "").replace(/^./, (x) => x.toUpperCase())}.` : "";
    return offer + why + (rest.length === 1 ? ` Or ${sayLabel(rest[0].label)}.` : rest.length || more ? " Or tell me another one." : "");
  }
  const q = s.question.toLowerCase();
  // a yes-or-no question needs no list: "Shall we get it ready now?" is answered with "yes"
  if (!full && /^(shall|do|is|would|should|can|start|prepare|add|use|open)\b/.test(q.split(/(?<=[.?!])\s+/).pop()) && opts.some((c) => c.words.includes("yes"))) return more.trim();
  // an option counts as named by the question only through a word no other option shares ("class" names none of "Class 6/7/9")
  const keys = opts.map((c) => keyWord(c.label));
  const named = opts.filter((c, i) => q.includes(sayLabel(c.label).toLowerCase()) || (keys.indexOf(keys[i]) === keys.lastIndexOf(keys[i]) && q.includes(keys[i]))).length;
  if (!full && named * 2 >= opts.length) return more.trim();
  return `You can say ${orList(opts.map((c) => sayLabel(c.label)))}.` + more;
}

/** What the agent says for this step: where things stand, then one question, in plain words (AC-48.2). */
export function spoken(s, includeSections = false, readOptions = true) {
  let out = "";
  if (s.banner) out += "This is a draft and isn't approved yet. ";
  if (s.announce) out += s.announce + " ";
  if (includeSections) {
    if (s.tik) TikTabs.summary(s.tik).forEach((x) => { out += x.heading + ". "; x.lines.forEach((l) => { out += trimDot(l) + ". "; }); });
    s.sections.forEach((x) => {
      out += x.heading + ". ";
      x.lines.forEach((l) => { out += inLang(x.lang, trimDot(l) + ".") + " "; });
    });
  }
  out += s.question;
  if (readOptions) { const o = optionsPhrase(s); if (o) out += " " + o; }
  return out.replace(/\.\./g, ".").replace(/\?\./g, "?").trim();
}

/** Text the LLM orchestrator reads each turn (FR-97). */
export function describe(s) {
  let o = `step_id: ${s.id}\nflow: ${s.flow.label}\ntitle: ${s.title}\n`;
  if (s.inClass) o += "in_class: true (session in progress: no suggestions, keep speech very short)\n";
  if (s.banner) o += `banner: ${s.banner}\n`;
  if (s.announce) o += `status: ${stripLang(s.announce)}\n`;
  if (s.known.length) o += "known_details: " + s.known.map(([k, v]) => `${k}=${v}`).join("; ") + "\n";
  if (s.tik) {
    o += `tik_tabs: ${TikTabs.titles.join(", ")} (commands: next_tab, prev_tab, open_tab)\n`;
    TikTabs.summary(s.tik).forEach((x) => { o += `tik ${x.heading}: ${x.lines.join(" | ")}\n`; });
    for (let i = 1; i < TikTabs.titles.length; i++) o += `tik tab ${TikTabs.titles[i]}: ${TikTabs.lines(s.tik.tik, i).join(" | ")}\n`;
  }
  s.sections.forEach((x) => { o += `section ${x.heading}: ${x.lines.join(" | ")}\n`; });
  o += `question: ${s.question}\noptions (fixed order):\n`;
  s.choices.forEach((c, i) => {
    o += `  ${i + 1}. id=${c.id} label="${c.label}" tier=${c.tier}`;
    if (!c.enabled) o += ` UNAVAILABLE(${c.whyDisabled})`;
    if (c.suggested) o += " SUGGESTED";
    o += "\n";
  });
  s.secondary.forEach((c) => { o += `  - id=${c.id} label="${c.label}" tier=${c.tier}\n`; });
  if (s.suggestion) o += `suggestion: ${s.suggestion.choiceId} (${s.suggestion.reason})\n`;
  if (s.freeSpeech) o += `free_speech_allowed: ${s.freeSpeech.prompt}\n`;
  return o;
}
