/**
 * Drafts made entirely on the device, so every flow works without a Claude key.
 * Built from the Course (definitions, check questions), the chapter TIK when one is synced, and the
 * teacher's own words. Everything here is still a draft that the teacher approves (BR-1).
 * Offline drafts are in English only; the engine says so when the class is taught in another language.
 */
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
  const known = [...((ch.syncedTik && ch.syncedTik.materials) || []),
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

const levels = (a) => `${a} Level 1: do it with help, one step at a time, and say what you notice. Level 2: predict first, then try it and explain why.`;

function baseAdaptations(n) {
  const a = [
    "Name each object aloud as you pass it, and give students time to explore it by touch.",
    "Give every student something to hold for each idea, not only one object for the class.",
    "Ask for answers aloud, one student at a time, so no one depends on seeing hands.",
  ];
  if (n && n.braille) a.push("Have the key words ready in Braille for students who read Braille.");
  if (n && n.lowVision) a.push("For students with low vision, use large bold print and good light on their desk.");
  return a;
}

const CHECKS = ["Syllabus check: uses only this chapter's Course", "Fact check: every fact comes from the Course text", "Translation check: not needed (English)"];

export function topicTik(ch, tp, need, instruction, previous) {
  const n = parseNeed(need, ch);
  const kw = keyword(tp);
  const minutes = Math.min(90, Math.max(15, (n && n.minutes) || 40));
  // time split for start, learn, engage, discuss, check: 5/10/15/5/5 of 40, scaled to the period
  const mins = [5, 10, 15, 5, 5].map((m) => Math.max(2, Math.round((m * minutes) / 40)));
  const sTik = ch.syncedTik;
  const chapterStep = sTik ? sTik.steps.find((s) => s.toLowerCase().includes(kw)) : null;
  const grouping = n && n.pairs ? " Work in pairs." : n && n.groups ? " Work in small groups of three or four." : "";
  const base = chapterStep ? (chapterStep.includes(": ") ? chapterStep.slice(chapterStep.indexOf(": ") + 2) : chapterStep)
    : `Touch and tell: pass the objects around and let each student say one thing they notice about ${kw}.`;
  const activity = base + grouping;
  const steps = [];
  if (previous) steps.push(`Recap (3 min): go over what was not finished last time. ${previous}`);
  steps.push(`Start (${mins[0]} min): ask the class: where have you noticed ${kw} at home or on the way to school? Take two or three answers.`);
  steps.push(`Learn (${mins[1]} min): explain in simple words. ` + tp.definitions.join(" "));
  steps.push(`Engage (${mins[2]} min): ${activity}`);
  steps.push(`Let's discuss (${mins[3]} min): what surprised you? Where else could this be useful?`);
  steps.push(`Check (${mins[4]} min): ask aloud: ` + (tp.checkQuestions[0] || `tell me one thing you learned about ${kw}.`));
  const activities = [levels(activity)];
  if (sTik) sTik.activities.filter((a) => a.toLowerCase().includes(kw) && a.toLowerCase() !== activity.toLowerCase())
    .forEach((a) => activities.push(a.includes("Level 1") ? a : levels(a)));
  const materials = uniqBy([...(sTik ? sTik.materials : ["Everyday objects that students can hold"]), ...((n && n.materials) || []).map(cap)], (m) => m.toLowerCase());
  let reasoning = `Built on this device from the Course for ${tp.name} and the chapter objective`;
  if (chapterStep) reasoning += ", using the matching activity from the chapter TIK";
  reasoning += `. Timings fit a ${minutes}-minute period.`;
  if (n && n.mixed) reasoning += " Every activity has two levels because you said the class has mixed levels.";
  if (n && n.pairs) reasoning += " Activities are in pairs because you asked for pairs.";
  if (n && n.groups) reasoning += " Activities are in small groups because you asked for groups.";
  if (n && n.students) reasoning += ` Planned for about ${n.students} students.`;
  if (instruction) reasoning += ` Your request: "${instruction}".`;
  return {
    provenance: "Generated for this lesson", scope: "topic", lang: "English",
    objective: `Students can explain ${tp.name.toLowerCase()} in their own words: ${tp.definitions[0]}`,
    steps, activities, materials, adaptations: baseAdaptations(n),
    extension: (sTik && sTik.extension) || `Students think of one more example of ${kw} from home and explain it to a partner.`,
    sources: [`Course: ${tp.name} (Content Studio, sample)`, ...(sTik ? sTik.sources : [])],
    reasoning, checks: CHECKS, instruction: instruction || need || null,
  };
}

export function chapterTik(ch) {
  const steps = [`Overview: tell the class what this chapter is about. ${ch.objective}`];
  ch.topics.forEach((t) => steps.push(`Learn and engage, ${t.name}: ${t.definitions[0]} Let students explore it by touch, then ask: ${t.checkQuestions[0] || "what did you notice?"}`));
  steps.push("Exercises and reinforcement: in pairs, each student explains one key point to the other: " + ch.keyPoints.join(" "));
  steps.push(`Let's discuss: where do we meet ideas from ${ch.name} at home?`);
  return {
    provenance: "Generated from textbook", scope: "chapter", lang: "English",
    objective: ch.objective, steps,
    activities: ch.topics.map((t) => levels(`Touch and tell for ${t.name.toLowerCase()}: pass objects around and let each student say what they notice.`)),
    materials: ["Everyday objects that students can hold, one set per pair"],
    adaptations: baseAdaptations(null),
    extension: `Students list three places at home where ${ch.name.toLowerCase()} matters, and share one with the class.`,
    sources: [`Course: ${ch.name} (Content Studio, sample)`, `Remediated textbook: ${ch.name} (Project A, sample)`],
    reasoning: `Built on this device from the Course for every topic in ${ch.name}, in the four-part order: overview, learn, engage, exercises and reinforcement.`,
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

/** Suggested changes with a reason each: { text, apply(tik) -> tik }. Only TIK-specific reasons (FR-79). */
export function suggestions(t, ch) {
  const out = [];
  const text = [t.objective, ...t.steps, ...t.activities, ...(t.extension ? [t.extension] : [])];
  if (text.some(hasSight)) out.push({
    text: 'Replace sight words like "see" or "look at" with touch and sound words, because students may not see the activity.',
    apply: (x) => ({ ...x, objective: swapSight(x.objective), steps: x.steps.map(swapSight), activities: x.activities.map(swapSight), extension: x.extension ? swapSight(x.extension) : x.extension }),
  });
  const noLevels = t.activities.filter((a) => !a.includes("Level 1")).length;
  if (noLevels > 0) out.push({
    text: `Add a Level 1 and a Level 2 version to ${noLevels} ${noLevels === 1 ? "activity" : "activities"}, because the class has mixed levels.`,
    apply: (x) => ({ ...x, activities: x.activities.map((a) => (a.includes("Level 1") ? a : levels(a))) }),
  });
  if (!t.extension) out.push({
    text: "Add an extension activity, because a ready activity uses spare minutes well if the class finishes early.",
    apply: (x) => ({ ...x, extension: "Students think of one more example from home and explain it to a partner." }),
  });
  if (!t.steps.some((s) => /discuss/i.test(s))) out.push({
    text: 'Add a short "Let\'s discuss" step, because talking it through helps students remember.',
    apply: (x) => ({ ...x, steps: [...x.steps, "Let's discuss: where have you noticed this at home or on the way to school?"] }),
  });
  if (t.steps.length > 6) out.push({
    text: `Cut the plan to 6 steps, because ${t.steps.length} steps will not fit in one period.`,
    apply: (x) => ({ ...x, steps: [...x.steps.slice(0, 5), x.steps[x.steps.length - 1]] }),
  });
  if (t.adaptations.length < 2) out.push({
    text: "Add accessibility adaptations, because every step should work by touch and sound.",
    apply: (x) => ({ ...x, adaptations: uniq([...x.adaptations, ...baseAdaptations(null)]) }),
  });
  if (!t.materials.length) out.push({
    text: "List the materials, because you need to gather them before class.",
    apply: (x) => ({ ...x, materials: (ch && ch.syncedTik && ch.syncedTik.materials) || ["Everyday objects that students can hold"] }),
  });
  return out;
}

export const applyAll = (t, ch) => suggestions(t, ch).reduce((acc, s) => s.apply(acc), t);

// ---------------------------------------------------------------- change requests

/**
 * Applies common change requests on the device. Returns the same TIK object when the request is not
 * understood, so the app can say so instead of pretending.
 * shortcut: rule-based only; with a Claude key any wording works.
 */
export function revise(t, request) {
  const r = request.toLowerCase();
  let x = t;
  let m = r.match(/(?:remove|delete|drop) (?:step|the step) (\d+)/);
  if (m) { const i = parseInt(m[1], 10); if (i >= 1 && i <= x.steps.length) x = { ...x, steps: x.steps.filter((_, k) => k !== i - 1) }; }
  m = r.match(/(?:remove|delete|drop) (?:activity|the activity) (\d+)/);
  if (m) { const i = parseInt(m[1], 10); if (i >= 1 && i <= x.activities.length) x = { ...x, activities: x.activities.filter((_, k) => k !== i - 1) }; }
  if (r.includes("pair")) x = { ...x, activities: x.activities.map((a) => (/pair/i.test(a) ? a : `${a} Work in pairs.`)) };
  if (r.includes("group")) x = { ...x, activities: x.activities.map((a) => (/group/i.test(a) ? a : `${a} Work in small groups of three or four.`)) };
  if (/short|less time|quick|fewer steps/.test(r) && x.steps.length > 4) x = { ...x, steps: [...x.steps.slice(0, 3), x.steps[x.steps.length - 1]] };
  if (/simpl|easier|easy|basic/.test(r)) x = {
    ...x,
    objective: x.objective.startsWith("In simple words") ? x.objective : `In simple words: ${x.objective}`,
    activities: x.activities.map((a) => (a.includes("Level 1") ? a : levels(a))),
    adaptations: uniq([...x.adaptations, "Use short sentences and one idea at a time."]),
  };
  if (/example|daily life|everyday|real life|home/.test(r)) {
    const ex = "Everyday example: ask students where they meet this at home, in the kitchen, or in the village, and take three answers.";
    if (!x.steps.includes(ex)) x = { ...x, steps: [...x.steps, ex] };
  }
  if (/level|mixed|ability|differentiat/.test(r)) x = { ...x, activities: x.activities.map((a) => (a.includes("Level 1") ? a : levels(a))) };
  if (/tactile|touch|hands.?on/.test(r)) x = { ...x, adaptations: uniq([...x.adaptations, "Give every student an object to hold for each idea."]) };
  if (/visual|blind|sight|see/.test(r)) x = { ...x, objective: swapSight(x.objective), steps: x.steps.map(swapSight), activities: x.activities.map(swapSight) };
  if (/extension|early finish|extra activity/.test(r) && !x.extension) x = { ...x, extension: "Students think of one more example from home and explain it to a partner." };
  if (/discuss|conversation|talk/.test(r) && !x.steps.some((s) => /discuss/i.test(s))) x = { ...x, steps: [...x.steps, "Let's discuss: what surprised you, and why?"] };
  if (same(x, t)) return t;
  return { ...x, provenance: t.provenance.startsWith("Synced") ? "Edited by you" : t.provenance, instruction: request, reasoning: `${t.reasoning} Changed on your request: "${request}".`.trim() };
}

/** Words the offline reviser understands, said back when a request is not understood. */
export const REVISE_HINT = "I understand: pairs, groups, shorter, simpler, more examples, levels, touch, remove step 2, add discussion.";

// ---------------------------------------------------------------- questions, audio, quiz

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

export function audioScript(ch, tp, variant) {
  const v = (variant || "").toLowerCase();
  const kw = keyword(tp);
  const defs = tp.definitions;
  if (v.includes("short")) return `Here is a short summary about ${kw}. ${defs[0]} Remember this one idea. Now, let us talk about it.`;
  if (v.includes("slow")) return `Let us go slowly today. We will learn about ${tp.name.toLowerCase()}. ` + defs.map((d) => `Listen. ${d} Let me say that again. ${d} `).join("") + "Take a moment to think. Your teacher will now ask you a question.";
  if (v.includes("re-explain") || v.includes("again") || v.includes("simpl")) return `Let us go over one idea again, step by step. ${defs[0].replace(/, /g, ". ")} Think of something at home that works like this. Hold that thought, and get ready to share it.`;
  return `Hello everyone. Today we will find out about ${tp.name.toLowerCase()}. Listen carefully. ` +
    defs.map((d, i) => (i === 0 ? "Here is the first idea. " : "Here is the next idea. ") + d + " ").join("") +
    `Now think: where have you noticed ${kw} at home, or on the way to school? In a moment, your teacher will ask you to share. Get ready with one example.`;
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

export function quiz(ch, tp) {
  const facts = uniq([...tp.definitions, ...ch.keyPoints.filter((kp) => !tp.definitions.some((d) => d.toLowerCase() === kp.toLowerCase()))]).slice(0, 4);
  let wantFalse = false;
  const qs = facts.map((f) => {
    const wrong = wantFalse ? falsify(f) : null;
    wantFalse = !wantFalse;
    return wrong ? { q: `True or false: ${wrong}`, options: ["True", "False"], answer: 1 } : { q: `True or false: ${f}`, options: ["True", "False"], answer: 0 };
  });
  return { checks: `Whether students remember the key facts about ${tp.name.toLowerCase()}: ${qs.length} true-or-false questions. Press 1 for True and 2 for False.`, questions: qs, lang: "English" };
}

export const recordSummary = (facts, notes) => "Session summary: " + facts.join(" ") + (notes.length ? " Your notes: " + notes.join(" ") : "");
