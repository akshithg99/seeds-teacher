import * as Offline from "./offline.js";

/**
 * Drafts approvable items (TIK, question sets, audio scripts, quizzes, record summaries).
 * Nothing it returns is usable until the teacher approves it (BR-1). Uses Claude when a key is set;
 * otherwise the on-device drafts in offline.js, so every flow still runs.
 * Each draft carries `lang`: the class language with Claude, English offline (FR-109).
 */
const arr = { type: "array", items: { type: "string" } };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const TIK_SCHEMA = obj({ objective: { type: "string" }, steps: arr, activities: arr, materials: arr, adaptations: arr, extension: { type: "string" }, sources: arr, reasoning: { type: "string" } });
const QS_SCHEMA = obj({ sets: { type: "array", items: obj({ key: { type: "string" }, discussion: arr, extra_check: arr }) } });
const QUIZ_SCHEMA = obj({ checks: { type: "string" }, questions: { type: "array", items: obj({ q: { type: "string" }, options: arr, answer: { type: "integer" } }) } });

// §19.9 class guardrails (prompt rules, not model training)
const guardrails = (classNum) => classNum <= 7
  ? "Class band 6-7: short sentences, everyday words, one idea per sentence. Explain any syllabus term the first time with a familiar example from home or village life. Teacher instructions use the same simple language. Activities: one idea at a time, few steps, objects students can touch. End audio with a short recap."
  : "Class band 9: scientific terms are allowed, each explained once, with somewhat more complex analogies, activities and examples. Activities can have more steps; students can predict and test. End audio with a recap plus how the ideas connect.";

const COMMON = `You draft teaching material for SEEDS 2.0, used by teachers of students with visual impairment in Indian special schools (classes 6, 7 and 9, STEM).
Rules that always apply:
- Every activity must work without sight: by touch, sound, smell, taste of safe items, or movement. Never rely on pictures, colours or the board.
- Make no visual references. Speak symbols and units in full words (for example "thirty-seven degrees Celsius").
- New concepts come only from this chapter. Analogies, examples and activities rely only on this chapter, earlier chapters and earlier classes.
- Keep syllabus terms, named teaching methods and factual accuracy when simplifying. A simpler explanation must still be correct.
- Activities flag hazards and say who handles what.
- No markdown.`;

const langRule = (lang) => lang && lang !== "English"
  ? `\nWrite every piece of text in ${lang}, simplified in ${lang} itself rather than written in English and translated. Keep JSON keys in English.`
  : "\nWrite in Indian English.";

function courseText(ch, topic) {
  let s = `Chapter ${ch.number}: ${ch.name}. Objective: ${ch.objective}\nKey points: ${ch.keyPoints.join(" ")}\n`;
  (topic ? [topic] : ch.topics).forEach((t) => { s += `Topic ${t.name}: ${t.definitions.join(" ")}\n`; });
  return s;
}
const tikText = (t) => `Objective: ${t.objective}\nSteps:\n${t.steps.map((s) => "- " + s).join("\n")}\nActivities:\n${t.activities.map((s) => "- " + s).join("\n")}\nMaterials: ${t.materials.join("; ")}\nAdaptations: ${t.adaptations.join("; ")}\nExtension: ${t.extension}\n`;

const checks = (lang) => ["Syllabus check: matches the sample TIK format", "Fact check: no issues found",
  lang && lang !== "English" ? `Translation check: written in ${lang}; please re-check it before approving` : "Translation check: not needed (English)"];

const toTik = (d, provenance, scope, instruction, fallbackSources, lang) => ({
  provenance, scope, lang: lang || "English", objective: d.objective, steps: d.steps, activities: d.activities,
  materials: d.materials, adaptations: d.adaptations, extension: d.extension && d.extension.trim() ? d.extension : null,
  sources: d.sources && d.sources.length ? d.sources : fallbackSources, reasoning: d.reasoning, checks: checks(lang), instruction: instruction || null,
});

export class ContentGenerator {
  constructor(claude) { this.claude = claude; }
  get online() { return !!(this.claude && this.claude.available); }

  /** The language a draft will actually be in for a class taught in `lang`. */
  draftLang(lang) { return this.online ? (lang || "English") : "English"; }

  /** Flow C (FR-45): build a chapter TIK when nothing is synced. */
  async chapterTik(ch, lang) {
    if (!this.online) return Offline.chapterTik(ch);
    const sources = [`Course: ${ch.name} (Content Studio, sample)`, `Remediated textbook: ${ch.name} (Project A, sample)`];
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang),
      `Build a chapter TIK (Teacher Information Kit) for class ${ch.classNum} ${ch.subject}.\n${courseText(ch)}\nUse the four-section structure in the steps: Overview, Learn, Engage, Exercises and Reinforcement. 5 to 7 steps. Every activity has a "Level 1:" and a "Level 2:" variant. Include an extension activity. "reasoning" is 2 or 3 sentences on why the plan is shaped this way.`,
      { schema: TIK_SCHEMA });
    return toTik(d, "Generated from textbook", "chapter", null, sources, lang);
  }

  /** FR-46: topic TIK from the topic's Course and the chapter objective. */
  async topicTik(ch, topic, need, instruction, previous, lang) {
    if (!this.online) return Offline.topicTik(ch, topic, need, instruction, previous);
    const sources = [`Course: ${topic.name} (Content Studio, sample)`, ...(ch.syncedTik ? ch.syncedTik.sources : [])];
    let u = `Draft a topic TIK for one period of about 40 minutes, class ${ch.classNum} ${ch.subject}.\n${courseText(ch, topic)}`;
    if (ch.syncedTik) u += `\nThe chapter TIK this draws from:\n${tikText(ch.syncedTik)}`;
    if (need) u += `\nThe teacher describes the class: "${need}"`;
    if (previous) u += `\nPrevious context for this class: ${previous}`;
    if (instruction) u += `\nThe teacher asks for this change: "${instruction}"`;
    u += '\n4 to 6 steps, each starting with its minutes, for example "Start (5 min): ...". Activities must suit a science class (no story template unless asked). Every activity has a "Level 1:" and a "Level 2:" variant. Include an extension activity for an early finish. "reasoning" is 2 or 3 sentences on why the plan is shaped this way.';
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang), u, { schema: TIK_SCHEMA });
    return toTik(d, "Generated for this lesson", "topic", instruction || need, sources, lang);
  }

  /** Flow D (FR-51): apply a change request. The synced TIK itself never changes (FR-39). */
  async reviseTik(ch, tik, request, lang) {
    if (!this.online) return Offline.revise(tik, request); // the same object when not understood
    const provenance = tik.provenance.startsWith("Synced") ? "Edited by you" : tik.provenance;
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang),
      `Here is a TIK for class ${ch.classNum} ${ch.subject}, chapter ${ch.name}:\n${tikText(tik)}\nThe teacher asks: "${request}". Apply only that change and keep everything else. Return the full TIK.`,
      { schema: TIK_SCHEMA });
    return toTik(d, provenance, tik.scope, request, tik.sources, lang);
  }

  /** F17: question sets for the topic and the chapter overview. Course questions first (FR-70, FR-111). */
  async questionSets(ch, topic, tik, lang, request = null) {
    if (!this.online) return Offline.questionSets(ch, topic);
    const overviewCourse = (ch.topics[0] && ch.topics[0].checkQuestions.slice(0, 1)) || [];
    const base = [
      { key: "overview", title: `Chapter overview: ${ch.name}`, discussion: [], check: overviewCourse, fromCourse: overviewCourse.length, approved: false },
      { key: topic.id, title: `Topic: ${topic.name}`, discussion: [], check: topic.checkQuestions, fromCourse: topic.checkQuestions.length, approved: false },
    ];
    let u = `Prepare question sets for class ${ch.classNum}.\n${courseText(ch, topic)}`;
    if (tik) u += `\nTIK steps: ${tik.steps.join(" | ")}`;
    u += `\nSets: key "overview" (chapter overview) and key "${topic.id}" (topic ${topic.name}).`;
    u += `\nCourse check questions already present: overview=${JSON.stringify(overviewCourse)}, topic=${JSON.stringify(topic.checkQuestions)}. Do not repeat them.`;
    if (request) u += `\nThe teacher asks for this change: "${request}"`;
    u += "\nFor each set give 2 discussion questions (for after the audio) and 1 extra understanding-check question.";
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang) + "\nEvery question must work when heard once and answered aloud. A show of hands does not work.", u, { schema: QS_SCHEMA, maxTokens: 6000 });
    return base.map((b) => {
      const g = d.sets.find((s) => s.key === b.key);
      return { ...b, lang: lang || "English", discussion: g ? g.discussion : [], check: [...b.check, ...(g ? g.extra_check : [])] };
    });
  }

  /** Offline: null when the request is not understood. */
  async reviseQuestions(ch, topic, tik, current, request, lang) {
    return this.online ? this.questionSets(ch, topic, tik, lang, request) : Offline.reviseQuestions(current, request);
  }

  /** F5: in-class audio script from the Course. Explanation only, no exam content (FR-24, FR-69). */
  async audioScript(ch, topic, variant, lang) {
    if (!this.online) return Offline.audioScript(ch, topic, variant);
    let u = `Write a 60 to 90 second in-class audio explanation for class ${ch.classNum}.\n${courseText(ch, topic)}`;
    u += "\nExplanation only. Do not read the textbook word for word. No exam questions, answers or rapid revision, and no discussion questions (those are read to the teacher). Use a warm, slow, spoken style with short pauses marked by full stops.";
    if (variant) u += `\nThis version should be different in this way: ${variant}`;
    return this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang) + "\nThis is a script for audio played to the class through a speaker during the lesson. Return plain text only.", u, { maxTokens: 4000, effort: "low" });
  }

  /** F8: a graded quiz drafted from the topic's Course content (FR-34). */
  async quiz(ch, topic, lang) {
    if (!this.online) return Offline.quiz(ch, topic);
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang) + "\nQuestions are answered over an ordinary phone call (IVR) by pressing keys, so each question and its options must be short and clear when heard once.",
      `Draft a 4-question graded quiz on "${topic.name}".\n${courseText(ch, topic)}\nEach question has 2 to 3 options; "answer" is the 0-based index of the correct option. "checks" is one plain sentence in English: what this quiz checks.`,
      { schema: QUIZ_SCHEMA, maxTokens: 6000 });
    const questions = d.questions.filter((q) => Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length);
    if (!questions.length) throw new Error("The quiz draft had no usable questions.");
    return { checks: d.checks, questions, lang: lang || "English" };
  }

  /** F9: short session summary the teacher can edit. Facts only; never invents observations. */
  async recordSummary(facts, notes) {
    if (!this.online) return Offline.recordSummary(facts, notes);
    return this.claude.complete("You summarise a teacher's class record in 2 or 3 plain English sentences. Use only the facts and notes given. Do not add observations, judgements or student names.",
      `Facts: ${facts.join(" ")}\nTeacher notes: ${notes.join(" ") || "none"}`, { maxTokens: 2000, effort: "low" });
  }
}
