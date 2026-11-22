/**
 * Drafts made entirely on the device, so every flow works without a Claude key.
 * Built from the Course (definitions, check questions), the chapter TIK when one is synced, and the
 * teacher's own words. Everything here is still a draft that the teacher approves (BR-1).
 * Offline drafts are in English only; the engine says so when the class is taught in another language.
 */
import { act, tikHeader, GUIDELINES } from "./data.js";
import { TikTabs } from "./tiktabs.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniqBy = (arr, key) => { const seen = new Set(); return arr.filter((x) => { const k = key(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
const uniq = (arr) => [...new Set(arr)];

const stop = new Set(["and", "the", "of", "a", "an", "its", "in", "to", "for", "on", "with", "using", "other", "types"]);

/** A short, speakable keyword for a topic: "Poles of a magnet" -> "poles". */
export const keyword = (tp) => tp.name.toLowerCase().split(/[ -]/).find((w) => w.length > 3 && !stop.has(w)) || tp.name.toLowerCase();

const numberWords = { "twenty five": 25, "thirty five": 35, "forty five": 45, fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, ten: 10 };

function numberBefore(t, unit) {
  const m = t.match(new RegExp(`(\\d{1,3})\\s*${unit}`));
  if (m) return parseInt(m[1], 10);
  for (const [w, n] of Object.entries(numberWords)) if (new RegExp(`\\b${w}\\s+${unit}`).test(t)) return n;
  return null;
}

/** What the teacher said about their class (the need statement), parsed on the device. */
export function parseNeed(text, ch) {
  if (!text || !text.trim()) return null;
  const t = text.toLowerCase();
  const known = [...(ch.syncedTik ? TikTabs.materials(ch.syncedTik) : []),
    "magnets", "ring magnets", "bar magnets", "paper clips", "talking thermometer", "thermometer", "ruler", "tactile ruler", "string", "clay", "battery", "bulb", "wire", "leaves", "marbles", "balloon", "drum", "rubber band", "cups", "salt"];
  return {
    minutes: numberBefore(t, "min"),
    students: numberBefore(t, "(?:students|children|kids)"),
    mixed: /mixed|different levels|some are|weaker|slow learners|levels/.test(t),
    pairs: t.includes("pair"),
    groups: t.includes("group"),
    braille: t.includes("braille"),
    lowVision: t.includes("low vision") || t.includes("partially"),
    materials: uniq(known.map((m) => m.toLowerCase())).filter((m) => t.includes(m)),
  };
}

const LEVELS = "For mixed levels: Level 1 students do it with help, one step at a time, and say what they notice. Level 2 students predict first, then try it and explain why.";
const PAIRS = "Ask the students to work in pairs.", GROUPS = "Ask the students to form small groups of three or four.";
const HANDLE = "Students should be able to handle the given material.";

/** Apply f to every activity in the TIK (interest, concept and exercises). */
const mapActs = (t, f) => ({ ...t, interest: t.interest.map(f), concepts: t.concepts.map((c) => ({ ...c, activities: c.activities.map(f) })), exercises: t.exercises.map(f) });
/** Apply f to the activities taught in class (interest and concept), not exercises. */
const mapTeach = (t, f) => ({ ...t, interest: t.interest.map(f), concepts: t.concepts.map((c) => ({ ...c, activities: c.activities.map(f) })) });
/** Put a grouping line first in an activity's flow, replacing any earlier grouping line. */
const grouped = (line) => (a) => ({ ...a, flow: [line, ...a.flow.filter((s) => !/form (?:small )?groups|in pairs|sit in pairs|work in pairs/i.test(s))] });
const withLine = (line) => (a) => (a.flow.includes(line) ? a : { ...a, flow: [...a.flow, line] });

function guidelines(n) {
  const g = [...GUIDELINES];
  if (n && n.braille) g.push("Have the key words ready in Braille for students who read Braille.");
  if (n && n.lowVision) g.push("For students with low vision, use large bold print and good light on their desk.");
  return g;
}

const CHECKS = ["Syllabus check: uses only this chapter's Course", "Fact check: every fact comes from the Course text", "Translation check: not needed (English)"];

/** A concept generation activity for one topic, built from its Course text. */
const conceptAct = (tp) => act(tp.name, ["Everyday objects that students can hold, one set per group"], HANDLE, `To know about ${tp.name.toLowerCase()}.`, [
  "Ask the students to form groups of three.", "Give each group the objects and let them touch and explore them.",
  `Ask: ${tp.checkQuestions[0] || "what do you notice?"}`, "Allow the students to discuss in their group and share with others.",
  `From the students' responses, explain: ${tp.definitions.join(" ")}`]);

/** Topic TIK in Vision Empower's format, from the topic's Course and the chapter TIK's matching activities. */
export function topicTik(ch, tp, need, instruction, previous) {
  const n = parseNeed(need, ch);
  const kw = keyword(tp);
  const minutes = Math.min(90, Math.max(15, (n && n.minutes) || 40));
  const sTik = ch.syncedTik;
  const fromChapter = sTik ? sTik.concepts.find((c) => c.topic.toLowerCase() === tp.name.toLowerCase() || c.topic.toLowerCase().includes(kw)) : null;
  let concept = fromChapter ? fromChapter.activities.map((a) => ({ ...a })) : [conceptAct(tp)];
  if (n && n.materials.length) concept = concept.map((a, i) => (i ? a : { ...a, materials: uniqBy([...a.materials, ...n.materials.map(cap)], (m) => m.toLowerCase()) }));
  const interestFlow = [
    ...(previous ? [`Recap: go over what was not finished last time. ${previous}`] : []),
    `Ask the class: where have you noticed ${kw} at home or on the way to school?`, "Take two or three answers aloud."];
  let t = {
    provenance: "Generated for this lesson", scope: "topic", lang: "English",
    header: tikHeader(ch, tp),
    objectives: [`To know about ${tp.name.toLowerCase()}.`, `Students can explain it in their own words: ${tp.definitions[0]}`],
    prerequisites: `Earlier topics of ${ch.name}, and what students learned in earlier classes.`,
    keyPoints: tp.definitions, learnMore: "",
    interest: [act("Introduction to the topic", [], HANDLE, "", interestFlow)],
    concepts: [{ topic: tp.name, activities: concept }],
    exercises: sTik && sTik.exercises.length ? sTik.exercises : [act("Tell a partner", [], `Know the key points of ${tp.name.toLowerCase()}.`, "",
      ["Ask the students to sit in pairs.", `Each student thinks of one more example of ${kw} from home and explains it to their partner.`])],
    references: [`Course: ${tp.name} (Content Studio, sample)`, ...(sTik ? sTik.references : [])],
    guidelines: guidelines(n),
    reasoning: "", checks: CHECKS, instruction: instruction || need || null,
  };
  if (n && n.pairs) t = mapTeach(t, grouped(PAIRS));
  else if (n && n.groups) t = mapTeach(t, grouped(GROUPS));
  if (n && n.mixed) t = mapTeach(t, withLine(LEVELS));
  let reasoning = `Built on this device from the Course for ${tp.name}, in Vision Empower's TIK format`;
  if (fromChapter) reasoning += ", using the matching activity from the chapter TIK";
  reasoning += `. Planned for a ${minutes}-minute period.`;
  if (n && n.mixed) reasoning += " Each activity says how to run it at two levels, because you said the class has mixed levels.";
  if (n && n.pairs) reasoning += " Activities are in pairs because you asked for pairs.";
  if (n && n.groups) reasoning += " Activities are in small groups because you asked for groups.";
  if (n && n.students) reasoning += ` Planned for about ${n.students} students.`;
  if (instruction) reasoning += ` Your request: "${instruction}".`;
  return { ...t, reasoning };
}

/** Chapter TIK in Vision Empower's format, from the Course for every topic. */
export function chapterTik(ch) {
  return {
    provenance: "Generated from textbook", scope: "chapter", lang: "English",
    header: tikHeader(ch),
    objectives: [ch.objective, ...ch.topics.map((t) => `To know about ${t.name.toLowerCase()}.`)],
    prerequisites: `Earlier chapters of class ${ch.classNum} ${ch.subject.toLowerCase()}, and what students learned in earlier classes.`,
    keyPoints: ch.topics.map((t) => `${t.name}: ${t.definitions.join(" ")}`), learnMore: "",
    interest: [act("Can you guess it?", ["Everyday objects linked to the chapter"], HANDLE, "",
      ["Pass the objects around and let each student explore them by touch.", `Ask: what do you think these have to do with ${ch.name.toLowerCase()}?`, "Take two or three answers aloud."])],
    concepts: ch.topics.map((t) => ({ topic: t.name, activities: [conceptAct(t)] })),
    exercises: [act("Sort and explain", ["Objects available in the classroom"], `Know the key points of ${ch.name}.`, "",
      ["Divide the students into groups.", `Ask each group to collect objects around them that relate to ${ch.name.toLowerCase()}.`,
        "Ask them to sort the objects and say aloud why each one goes where it does.", "In pairs, each student explains one key point to the other."])],
    references: [`Course: ${ch.name} (Content Studio, sample)`, `Remediated textbook: ${ch.name} (Project A, sample)`],
    guidelines: guidelines(null),
    reasoning: `Built on this device from the Course for every topic in ${ch.name}, in Vision Empower's TIK format: overview, learn, engage, and exercises and reinforcement.`,
    checks: CHECKS, instruction: null,
  };
}

// ---------------------------------------------------------------- suggestions (shown on the Summary tab)

const sightSwaps = [
  ["look at", "explore by touch"], ["looking at", "exploring by touch"], ["watch", "listen to"],
  ["seeing", "feeling"], ["see", "feel"], ["pictures", "tactile models"], ["picture", "tactile model"],
  ["colours", "textures"], ["colors", "textures"], ["colour", "texture"], ["color", "texture"],
  ["on the blackboard", "aloud"], ["on the board", "aloud"], ["draw", "build with clay or string"],
];
function swapSight(s) {
  let out = s;
  for (const [from, to] of sightSwaps) out = out.replace(new RegExp(`\\b${esc(from)}\\b`, "gi"), (m) => (m[0] === m[0].toUpperCase() ? cap(to) : to));
  return out;
}
const hasSight = (s) => sightSwaps.some(([from]) => new RegExp(`\\b${esc(from)}\\b`, "i").test(s));
const swapAll = (t) => mapActs({ ...t, objectives: t.objectives.map(swapSight), keyPoints: t.keyPoints.map(swapSight) },
  (a) => ({ ...a, name: swapSight(a.name), objective: swapSight(a.objective), flow: a.flow.map(swapSight) }));
const allText = (t) => [...t.objectives, ...t.keyPoints, ...[...TikTabs.activities(t), ...t.exercises].flatMap((a) => [a.name, a.objective, ...a.flow])];
const DISCUSS = "Allow the students to discuss with the group and share their ideas with others.";
const EXERCISE = act("Tell a partner", [], "Know the key points of this lesson.", "", ["Ask the students to sit in pairs.", "Each student thinks of one more example from home and explains it to their partner."]);

/** Suggested changes with a reason each: { text, apply(tik) -> tik }. Only TIK-specific reasons (FR-79). */
export function suggestions(t, ch) {
  const out = [];
  if (allText(t).some(hasSight)) out.push({
    text: 'Replace sight words like "see" or "look at" with touch and sound words, because students may not see the activity.',
    apply: swapAll,
  });
  if (!t.exercises.length) out.push({
    text: "Add an exercises and reinforcement activity, because practice helps students remember, and it uses spare minutes if the class finishes early.",
    apply: (x) => ({ ...x, exercises: [EXERCISE] }),
  });
  const quiet = TikTabs.activities(t).filter((a) => !a.flow.some((s) => /discuss|share/i.test(s))).length;
  if (quiet) out.push({
    text: `Add a discussion line to ${quiet} ${quiet === 1 ? "activity" : "activities"}, because talking it through helps students remember.`,
    apply: (x) => mapTeach(x, (a) => (a.flow.some((s) => /discuss|share/i.test(s)) ? a : withLine(DISCUSS)(a))),
  });
  if (t.scope === "topic" && TikTabs.activities(t).length > 4) out.push({
    text: `Keep 4 activities, because ${TikTabs.activities(t).length} activities will not fit in one period.`,
    apply: (x) => ({ ...x, concepts: x.concepts.map((c) => ({ ...c, activities: c.activities.slice(0, Math.max(1, 4 - x.interest.length)) })) }),
  });
  if (t.guidelines.length < 2) out.push({
    text: "Add the important guidelines, because every activity should work by touch and sound.",
    apply: (x) => ({ ...x, guidelines: uniq([...x.guidelines, ...GUIDELINES]) }),
  });
  if (!TikTabs.materials(t).length) out.push({
    text: "List the materials required, because you need to gather them before class.",
    apply: (x) => mapTeach(x, (a) => (a.materials.length ? a : { ...a, materials: ["Everyday objects that students can hold"] })),
  });
  return out;
}

export const applyAll = (t, ch) => suggestions(t, ch).reduce((acc, s) => s.apply(acc), t);

// ---------------------------------------------------------------- change requests

/** Remove the activity numbered `i` (1-based, as shown in the Engage and Exercises tabs). */
function removeActivity(t, i) {
  let n = 0;
  const keep = (a) => ++n !== i;
  const x = { ...t, interest: t.interest.filter(keep), concepts: t.concepts.map((c) => ({ ...c, activities: c.activities.filter(keep) })), exercises: t.exercises.filter(keep) };
  return n >= i ? x : t;
}

/**
 * Applies common change requests on the device. Returns the same TIK object when the request is not
 * understood, so the app can say so instead of pretending.
 * shortcut: rule-based only; with a Claude key any wording works.
 */
export function revise(t, request) {
  const r = request.toLowerCase();
  let x = t;
  const m = r.match(/(?:remove|delete|drop) (?:the )?(?:activity|step) (\d+)/);
  if (m) x = removeActivity(x, parseInt(m[1], 10));
  if (r.includes("pair")) x = mapTeach(x, grouped(PAIRS));
  else if (r.includes("group")) x = mapTeach(x, grouped(GROUPS));
  if (/short|less time|quick|fewer/.test(r)) x = mapTeach(x, (a) => (a.flow.length > 4 ? { ...a, flow: [...a.flow.slice(0, 3), a.flow[a.flow.length - 1]] } : a));
  if (/simpl|easier|easy|basic/.test(r)) x = {
    ...x,
    objectives: x.objectives.map((o) => (o.startsWith("In simple words") ? o : `In simple words: ${o}`)),
    guidelines: uniq([...x.guidelines, "Use short sentences and one idea at a time."]),
  };
  if (/example|daily life|everyday|real life|home/.test(r)) {
    const ex = "Ask students where they meet this at home, in the kitchen or in the village, and take three answers.";
    x = { ...x, interest: x.interest.map(withLine(ex)) };
  }
  if (/level|mixed|ability|differentiat/.test(r)) x = mapTeach(x, withLine(LEVELS));
  if (/tactile|touch|hands.?on/.test(r)) x = { ...x, guidelines: uniq([...x.guidelines, "Give every student an object to hold for each idea."]) };
  if (/visual|blind|sight|see/.test(r)) x = swapAll(x);
  if (/extension|exercise|early finish|extra activity/.test(r) && !x.exercises.length) x = { ...x, exercises: [EXERCISE] };
  if (/discuss|conversation|talk/.test(r)) x = mapTeach(x, (a) => (a.flow.some((s) => /discuss/i.test(s)) ? a : withLine(DISCUSS)(a)));
  if (same(x, t)) return t;
  return { ...x, provenance: t.provenance.startsWith("Synced") ? "Edited by you" : t.provenance, instruction: request, reasoning: `${t.reasoning} Changed on your request: "${request}".`.trim() };
}

/** Words the offline reviser understands, said back when a request is not understood. */
export const REVISE_HINT = "I understand: pairs, groups, shorter, simpler, more examples, levels, touch, remove activity 2, add discussion.";

// ---------------------------------------------------------------- questions, quiz

export function questionSets(ch, tp) {
  const kw = keyword(tp);
  const overviewCourse = (ch.topics[0] && ch.topics[0].checkQuestions.slice(0, 1)) || [];
  return [
    { key: "overview", title: `Chapter overview: ${ch.name}`, lang: "English",
      discussion: [`What is one new thing you learned about ${ch.name.toLowerCase()} today?`, "Which part was the most surprising, and why?"],
      check: overviewCourse.length ? overviewCourse : [`Tell me one fact from ${ch.name}.`], fromCourse: overviewCourse.length, approved: false },
    { key: tp.id, title: `Topic: ${tp.name}`, lang: "English",
      discussion: [`In your own words, what did the audio say about ${kw}?`, `Where have you noticed ${kw} at home or on the way to school?`],
      check: [...tp.checkQuestions, `Tell me one fact about ${kw} in your own words.`], fromCourse: tp.checkQuestions.length, approved: false },
  ];
}

/** Applies a change request to question sets. Returns null when the request is not understood. */
export function reviseQuestions(sets, request) {
  const r = request.toLowerCase();
  let out = null;
  if (/easier|simpl|easy/.test(r)) out = sets.map((s) => ({ ...s, check: s.check.map((q) => (q.startsWith("In simple words") ? q : `In simple words: ${q}`)) }));
  else if (/fewer|less|shorter|only one/.test(r)) out = sets.map((s) => ({ ...s, check: s.check.slice(0, Math.max(1, s.fromCourse)), discussion: s.discussion.slice(0, 1) }));
  else if (/more|another|add/.test(r)) out = sets.map((s) => ({ ...s, discussion: [...s.discussion, "Can you explain it to the person next to you?"] }));
  else if (/harder|difficult|challenge/.test(r)) out = sets.map((s) => ({ ...s, check: [...s.check, "Why do you think that happens?"] }));
  return out ? out.map((s) => ({ ...s, approved: false })) : null;
}

// pairs that turn a true Course sentence into a false one; first match only
const falseSwaps = [
  ["does not need", "needs"], ["needs a medium", "does not need a medium"], ["good conductors", "poor conductors"],
  ["attracts", "repels"], ["attract", "repel"], ["north", "south"], ["strongest", "weakest"], ["hotter", "colder"],
  ["colder", "hotter"], ["closed", "open"], ["one hundred", "ten"], ["thirty-seven", "forty-seven"], ["sunlight", "moonlight"],
  ["oxygen", "nitrogen"], ["vibrates", "stays still"], ["straight line", "circle"], ["metre", "kilogram"], ["zero mark", "middle"],
  ["chlorophyll", "starch"], ["Solids have", "Gases have"], ["fixed volume", "changing volume"], ["cooling", "heating"],
  ["below its boiling point", "only at its boiling point"], ["shortest", "longest"], ["unlike poles", "like poles"],
];
function falsify(s) {
  for (const [a, b] of falseSwaps) {
    const m = new RegExp(`\\b${esc(a)}\\b`, "i").exec(s);
    if (m) return s.slice(0, m.index) + (m[0][0] === m[0][0].toUpperCase() ? cap(b) : b) + s.slice(m.index + m[0].length);
  }
  return null;
}

/** Multiple-choice quiz with an answer key, for a whole chapter or some of its topics (v5.4 8.6). Exactly one option is true. */
export function quiz(ch, topics) {
  // a swap inside a negated sentence can stay true ("does not attract" -> "does not repel"), so those are never wrong answers
  const lie = (s) => (/\b(?:not|neither|nor|no)\b/i.test(s) ? null : falsify(s));
  const pool = uniq([...ch.topics.flatMap((t) => t.definitions), ...ch.keyPoints].map(lie).filter(Boolean));
  const questions = topics.flatMap((tp) => tp.definitions.map((d) => ({ d, tp }))).slice(0, 8).map(({ d, tp }, i) => {
    const own = lie(d);
    const wrong = uniq([own, ...pool].filter((x) => x && x !== d)).slice(0, 3);
    const options = [d, ...(wrong.length ? wrong : ["None of these"])];
    const k = i % options.length; // spread the right answer across positions
    return { q: `${tp.name}: which of these is true?`, options: [...options.slice(options.length - k), ...options.slice(0, options.length - k)], answer: k, topicId: tp.id };
  });
  const what = topics.length === ch.topics.length ? ch.name : topics.map((t) => t.name).join(", ");
  return { checks: `Whether students remember the key facts of ${what}: ${questions.length} multiple-choice questions. Students press the number of the right answer.`, questions, lang: "English" };
}

export const recordSummary = (facts, notes) => "Session summary: " + facts.join(" ") + (notes.length ? " Your notes: " + notes.join(" ") : "");
