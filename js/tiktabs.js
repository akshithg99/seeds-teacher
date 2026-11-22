import { inLang } from "./step.js";

/**
 * A TIK in Vision Empower's Teacher Instruction Kit format, split into tabs like browser tabs:
 * a Summary tab first, then one tab per heading of the format, always in the same order.
 *
 * TIK: { provenance, scope, lang, header: [string], objectives: [string], prerequisites,
 *        keyPoints: [string], learnMore, interest: [activity], concepts: [{ topic, activities: [activity] }],
 *        exercises: [activity], references: [string], guidelines: [string], reasoning, checks, instruction }
 * activity: { name, materials: [string], prerequisites, objective, flow: [string] }
 * A panel is { tik, before, suggestions: [string], status }.
 */
const uniq = (xs) => [...new Set(xs)];

export const TikTabs = {
  titles: ["Summary", "Overview", "Learn", "Engage", "Exercises", "References", "Guidelines", "Why"],

  names: {
    summary: 0, overview: 1, objective: 1, objectives: 1, prerequisites: 1, learn: 2, "key points": 2,
    engage: 3, activities: 3, activity: 3, "interest generation": 3, "concept generation": 3,
    exercises: 4, reinforcement: 4, "exercises and reinforcement": 4, extension: 4,
    references: 5, sources: 5, guidelines: 6, "important guidelines": 6, accessibility: 6, why: 7, reasoning: 7,
  },

  /** "open the engage tab", "engage tab", "show references" -> 3, 5. Null if it is not a tab request. */
  parse(text) {
    const t = text.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    let core = t;
    for (const p of ["open ", "go to ", "show ", "read ", "the "]) if (core.startsWith(p)) core = core.slice(p.length);
    for (const sfx of [" tab", " section"]) if (core.endsWith(sfx)) core = core.slice(0, -sfx.length);
    core = core.trim();
    const named = this.names[core];
    if (named === undefined) return null;
    // a bare word like "activities" only counts when it was said as a tab request or on its own
    const asked = t.includes("tab") || t.includes("section") || t === core || /^(open|go to|show|read)/.test(t);
    return asked ? named : null;
  },

  // ---------------------------------------------------------------- the TIK's activities
  /** Activities taught in class, in order: interest generation, then concept generation. */
  activities: (t) => [...(t.interest || []), ...(t.concepts || []).flatMap((c) => c.activities)],
  /** Materials to gather before class, from every activity. */
  materials: (t) => uniq([...TikTabs.activities(t), ...(t.exercises || [])].flatMap((a) => a.materials)).filter((m) => m && !/^none$/i.test(m)),
  /** The class steps, in the TIK's order (the header is not a step): one concept step per topic, so a class can stop at a topic and the next one starts there. */
  classSteps: (t) => [
    { name: "Objectives and prerequisites", short: "Objectives", lines: [...t.objectives, `Prerequisite concept: ${t.prerequisites || "None"}`], acts: [] },
    { name: "Key points", short: "Key points", lines: t.keyPoints.map((k, j) => `${j + 1}. ${k}`), acts: [] },
    ...(t.interest.length ? [{ name: "Interest generating activity", short: "Interest", lines: [], acts: t.interest }] : []),
    ...t.concepts.map((c, k) => ({ name: `Concept generation: ${c.topic}`, short: `Topic ${k + 1}`, topic: c.topic, lines: [], acts: c.activities })),
    ...(t.exercises.length ? [{ name: "Exercise and reinforcement activity", short: "Exercise", lines: [], acts: t.exercises }] : []),
  ],
  /** One activity as a sentence, for speech. */
  actText: (a) => `${a.name}. ${a.flow.join(" ")}`,

  /** The headed blocks of one tab (1..7): [{ heading, level, lines }]. Activities are numbered through the TIK. */
  blocks(t, i) {
    let n = 0;
    const act = (a, level) => ({ heading: `Activity ${++n}: ${a.name}`, level, lines: [
      `Materials required: ${a.materials.length ? a.materials.join(", ") : "None"}`, `Prerequisites: ${a.prerequisites || "None"}`,
      ...(a.objective ? [`Objective: ${a.objective}`] : []), "Activity flow:", ...a.flow.map((s, k) => `${k + 1}. ${s}`)] });
    switch (i) {
      case 1: return [{ heading: null, level: 1, lines: t.header || [] }, { heading: "Objectives", level: 1, lines: t.objectives },
        { heading: "Prerequisite concept", level: 1, lines: [t.prerequisites || "None"] }];
      case 2: return [{ heading: "Key points", level: 1, lines: t.keyPoints.map((k, j) => `${j + 1}. ${k}`) },
        { heading: "Learn more", level: 1, lines: [t.learnMore || "None"] }];
      case 3: {
        const out = [{ heading: "Interest generation activity", level: 1, lines: [] }, ...t.interest.map((a) => act(a, 2)), { heading: "Concept generation activity", level: 1, lines: [] }];
        t.concepts.forEach((c) => { out.push({ heading: c.topic, level: 2, lines: [] }, ...c.activities.map((a) => act(a, 3))); });
        return out;
      }
      case 4: n = this.activities(t).length; return t.exercises.length ? t.exercises.map((a) => act(a, 1)) : [{ heading: null, level: 1, lines: ["None yet."] }];
      case 5: return [{ heading: null, level: 1, lines: t.references.length ? t.references : ["None listed."] }];
      case 6: return [{ heading: null, level: 1, lines: t.guidelines.length ? t.guidelines : ["None listed."] }];
      case 7: return [{ heading: null, level: 1, lines: [t.reasoning].filter((x) => x && x.trim()).concat(t.checks || []) }];
      default: return [];
    }
  },

  /** Lines of one tab as read aloud and compared between versions: each heading, then its lines. */
  lines(t, i) { return this.blocks(t, i).flatMap((b) => [b.heading, ...b.lines]).filter(Boolean); },

  /** Per teaching-content tab (1..6): lines added and removed since `before`. Map of tab -> [added, removed]. */
  changes(before, after) {
    const out = new Map();
    if (!before) return out;
    for (let i = 1; i <= 6; i++) {
      const a = this.lines(before, i), b = this.lines(after, i);
      const added = b.filter((x) => !a.includes(x)), removed = a.filter((x) => !b.includes(x));
      if (added.length || removed.length) out.set(i, [added, removed]);
    }
    return out;
  },

  /** One short sentence for feedback after a change, for example "Engage: 1 added. Learn: 2 changed." */
  changeText(before, after) {
    const c = this.changes(before, after);
    if (!c.size) return "";
    return [...c.entries()].map(([i, [added, removed]]) => {
      const changed = Math.min(added.length, removed.length);
      const parts = [];
      if (added.length - changed > 0) parts.push(`${added.length - changed} added`);
      if (changed > 0) parts.push(`${changed} changed`);
      if (removed.length - changed > 0) parts.push(`${removed.length - changed} removed`);
      return `${this.titles[i]}: ${parts.join(", ")}.`;
    }).join(" ");
  },

  /** The Summary tab: what is in the TIK, what changed, and what is suggested. */
  summary(p) {
    const t = p.tik;
    const inside = { heading: "In this TIK", lines: [
      `${t.provenance} · ${t.scope} TIK · ${p.status}` + (t.lang && t.lang !== "English" ? ` · ${t.lang}` : ""),
      `${t.objectives.length} objectives, ${t.keyPoints.length} key points, ${this.activities(t).length} activities for ${t.concepts.length} ${t.concepts.length === 1 ? "topic" : "topics"}, ${this.materials(t).length} materials`,
      `Exercises and reinforcement: ${t.exercises.length ? `${t.exercises.length} ${t.exercises.length === 1 ? "activity" : "activities"}` : "none"}`,
    ] };
    const c = this.changes(p.before, t);
    let changedLines;
    if (!p.before) changedLines = [t.provenance.startsWith("Synced") ? "No changes. This is the Content Studio version." : "No changes yet. This is the first draft."];
    else if (!c.size) changedLines = ["No differences in the teaching content from the previous version."];
    else changedLines = [...c.entries()].flatMap(([i, [a, r]]) => [`${this.titles[i]} tab:`, ...a.map((x) => `Added: ${x}`), ...r.map((x) => `Removed: ${x}`)]).slice(0, 14);
    const suggested = { heading: "Suggested changes", lines: p.suggestions.length ? p.suggestions : ["None. It looks ready to teach."] };
    return [inside, { heading: "What changed", lines: changedLines }, suggested];
  },

  /** Tabs whose content changed since `before`; shown with a marker. */
  changedTabs(before, after) { return new Set(this.changes(before, after).keys()); },

  /** What the agent says when a tab opens. Content in another language is marked for its own voice (FR-110). */
  spokenTab(p, i) {
    const head = `${this.titles[i]} tab, ${i + 1} of ${this.titles.length}.`;
    const body = i === 0
      ? this.summary(p).map((s) => s.heading + ". " + s.lines.map((l) => l.replace(/\.+$/, "")).join(". ") + ".").join(" ")
      : inLang(p.tik.lang, this.lines(p.tik, i).map((l) => l.replace(/[.:]+$/, "") + ".").join(" "));
    return `${head} ${body}`;
  },
};
