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

/** What the agent says for this step: status, then one question and its options in a fixed order (AC-48.2). */
export function spoken(s, includeSections = false, readOptions = true) {
  let out = "";
  if (s.banner) out += s.banner + ". ";
  if (s.announce) out += s.announce + " ";
  if (includeSections) {
    if (s.tik) TikTabs.summary(s.tik).forEach((x) => { out += x.heading + ". "; x.lines.forEach((l) => { out += trimDot(l) + ". "; }); });
    s.sections.forEach((x) => {
      out += x.heading + ". ";
      x.lines.forEach((l) => { out += inLang(x.lang, trimDot(l) + ".") + " "; });
    });
  }
  out += s.question;
  if (readOptions && s.choices.length) {
    const opts = s.choices.filter((c) => c.enabled).map((c, i) => `${i + 1}, ${c.label}`);
    if (opts.length) out += " Say " + opts.join("; ") + ".";
  }
  return out.replace(/\.\./g, ".").trim();
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
