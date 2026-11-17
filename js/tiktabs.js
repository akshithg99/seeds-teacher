import { inLang } from "./step.js";

/**
 * The TIK split into tabs, like browser tabs: a Summary tab first, then one tab per section.
 * The same tabs every time, in the same order, so a teacher always knows where a section is.
 * A panel is { tik, before, suggestions: [string], status }.
 */
export const TikTabs = {
  titles: ["Summary", "Objective", "Steps", "Activities", "Materials", "Accessibility", "Extension", "Sources", "Why"],

  names: {
    summary: 0, overview: 0, objective: 1, objectives: 1, goal: 1, steps: 2, "teaching steps": 2,
    activities: 3, activity: 3, materials: 4, material: 4, accessibility: 5, adaptations: 5,
    extension: 6, sources: 7, source: 7, why: 8, reasoning: 8, reasons: 8,
  },

  /** "open the activities tab", "activities tab", "show materials" -> 3, 4. Null if it is not a tab request. */
  parse(text) {
    const t = text.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
    let core = t;
    for (const p of ["open ", "go to ", "show ", "read ", "the "]) if (core.startsWith(p)) core = core.slice(p.length);
    for (const sfx of [" tab", " section"]) if (core.endsWith(sfx)) core = core.slice(0, -sfx.length);
    core = core.trim();
    const named = this.names[core];
    if (named === undefined) return null;
    // a bare word like "steps" only counts when it was said as a tab request or on its own
    const asked = t.includes("tab") || t.includes("section") || t === core || /^(open|go to|show|read)/.test(t);
    return asked ? named : null;
  },

  /** Raw lines of one section tab (1..8), unnumbered, used for comparing versions. */
  raw(t, i) {
    switch (i) {
      case 1: return [t.objective];
      case 2: return t.steps;
      case 3: return t.activities;
      case 4: return t.materials;
      case 5: return t.adaptations;
      case 6: return t.extension ? [t.extension] : [];
      case 7: return t.sources || [];
      case 8: return [t.reasoning].filter((x) => x && x.trim()).concat(t.checks || []);
      default: return [];
    }
  },

  /** Lines as shown and read aloud. Steps are numbered so "remove step 2" is unambiguous. */
  lines(t, i) {
    if (i === 2) return t.steps.map((s, n) => `${n + 1}. ${s}`);
    if (i === 3) return t.activities.map((s, n) => `${n + 1}. ${s}`);
    if (i === 6) return [t.extension || "None yet."];
    const r = this.raw(t, i);
    return r.length ? r : ["None listed."];
  },

  /** Per teaching-content tab (1..6): lines added and removed since `before`. Map of tab -> [added, removed]. */
  changes(before, after) {
    const out = new Map();
    if (!before) return out;
    for (let i = 1; i <= 6; i++) {
      const a = this.raw(before, i), b = this.raw(after, i);
      const added = b.filter((x) => !a.includes(x)), removed = a.filter((x) => !b.includes(x));
      if (added.length || removed.length) out.set(i, [added, removed]);
    }
    return out;
  },

  /** One short sentence for feedback after a change, for example "Steps: 1 added. Activities: 2 changed." */
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
    const levelled = t.activities.filter((a) => a.includes("Level 1")).length;
    const inside = { heading: "In this TIK", lines: [
      `${t.provenance} · ${t.scope} TIK · ${p.status}` + (t.lang && t.lang !== "English" ? ` · ${t.lang}` : ""),
      `${t.steps.length} steps, ${t.activities.length} activities (${levelled} with two levels), ${t.materials.length} materials`,
      `Extension activity: ${t.extension ? "yes" : "none"}`,
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
      : inLang(p.tik.lang, this.lines(p.tik, i).map((l) => l.replace(/\.+$/, "") + ".").join(" "));
    return `${head} ${body}`;
  },
};
