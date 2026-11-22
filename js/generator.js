import * as Offline from "./offline.js";
import { tikHeader } from "./data.js";
import { TikTabs } from "./tiktabs.js";

/**
 * Drafts approvable items (TIK, question sets, audio scripts, quizzes, record summaries).
 * Nothing it returns is usable until the teacher approves it (BR-1). Uses Claude when a key is set;
 * otherwise the on-device drafts in offline.js, so every flow still runs.
 * Each draft carries `lang`: the class language with Claude, English offline (FR-109).
 */
const arr = { type: "array", items: { type: "string" } };
const obj = (properties) => ({ type: "object", properties, required: Object.keys(properties), additionalProperties: false });
const str = { type: "string" };
const ACT = obj({ name: str, materials: arr, prerequisites: str, objective: str, flow: arr });
const acts = { type: "array", items: ACT };
// Vision Empower's TIK format: overview, learn, engage (interest and concept generation), exercises and reinforcement
const TIK_SCHEMA = obj({ objectives: arr, prerequisites: str, key_points: arr, interest: acts, concepts: { type: "array", items: obj({ topic: str, activities: acts }) },
  exercises: acts, references: arr, guidelines: arr, reasoning: str });
const TIK_FORMAT = `Use Vision Empower's Teacher Instruction Kit format:
- objectives: 2 to 4 short objectives, each starting "To know" or "To understand". prerequisites: one sentence on the prerequisite concept.
- key_points: the Learn section, one numbered key point per idea, each "Name: explanation".
- interest: one interest generation activity that introduces the topic.
- concepts: concept generation activities, one entry per topic with the topic name and its activities.
- exercises: one exercises and reinforcement activity.
- Every activity has a short name, materials required (an empty list if none), prerequisites, an objective (may be empty for the interest activity) and an activity flow of 3 to 7 short steps the teacher follows, for example "Ask the students to form groups of three." End concept activities with the teacher explaining the idea from the students' responses.
- references: where the content comes from. guidelines: important guidelines for the teacher, including reading, textbook activities, homework and accessibility.`;
const QS_SCHEMA = obj({ sets: { type: "array", items: obj({ key: { type: "string" }, discussion: arr, extra_check: arr }) } });
const QUIZ_SCHEMA = obj({ checks: { type: "string" }, questions: { type: "array", items: obj({ q: { type: "string" }, options: arr, answer: { type: "integer" }, topic_id: { type: "string" } }) } });

// §19.9 class guardrails (prompt rules, not model training)
const guardrails = (classNum) => classNum <= 7
  ? "Class band 6-7: short sentences, everyday words, one idea per sentence. Explain any syllabus term the first time with a familiar example from home or village life. Teacher instructions use the same simple language. Activities: one idea at a time, few steps, objects students can touch. End audio with a short recap."
  : "Class band 9: scientific terms are allowed, each explained once, with somewhat more complex analogies, activities and examples. Activities can have more steps; students can predict and test. End audio with a recap plus how the ideas connect.";

const COMMON = `You draft teaching material for SEEDS PROJECT-B, used by teachers of students with visual impairment in Indian special schools (classes 6, 7 and 9, STEM).
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
const tikText = (t) => [1, 2, 3, 4, 5, 6].map((i) => `${TikTabs.titles[i]}:\n${TikTabs.lines(t, i).join("\n")}`).join("\n") + "\n";

const checks = (lang) => ["Syllabus check: matches the sample TIK format", "Fact check: no issues found",
  lang && lang !== "English" ? `Translation check: written in ${lang}; please re-check it before approving` : "Translation check: not needed (English)"];

const toTik = (d, header, provenance, scope, instruction, fallbackSources, lang) => ({
  provenance, scope, lang: lang || "English", header, objectives: d.objectives, prerequisites: d.prerequisites, keyPoints: d.key_points, learnMore: "",
  interest: d.interest, concepts: d.concepts, exercises: d.exercises,
  references: d.references && d.references.length ? d.references : fallbackSources, guidelines: d.guidelines, reasoning: d.reasoning, checks: checks(lang), instruction: instruction || null,
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
      `Build a chapter TIK (Teacher Instruction Kit) for class ${ch.classNum} ${ch.subject}.\n${courseText(ch)}\n${TIK_FORMAT}\nOne concept entry per topic of the chapter. "reasoning" is 2 or 3 sentences on why the plan is shaped this way.`,
      { schema: TIK_SCHEMA });
    return toTik(d, tikHeader(ch), "Generated from textbook", "chapter", null, sources, lang);
  }

  /** FR-46: topic TIK from the topic's Course and the chapter objective. */
  async topicTik(ch, topic, need, instruction, previous, lang) {
    if (!this.online) return Offline.topicTik(ch, topic, need, instruction, previous);
    const sources = [`Course: ${topic.name} (Content Studio, sample)`, ...(ch.syncedTik ? ch.syncedTik.references : [])];
    let u = `Draft a topic TIK for one period of about 40 minutes, class ${ch.classNum} ${ch.subject}.\n${courseText(ch, topic)}`;
    if (ch.syncedTik) u += `\nThe chapter TIK this draws from:\n${tikText(ch.syncedTik)}`;
    if (need) u += `\nThe teacher describes the class: "${need}"`;
    if (previous) u += `\nPrevious context for this class: ${previous}`;
    if (instruction) u += `\nThe teacher asks for this change: "${instruction}"`;
    u += `\n${TIK_FORMAT}\nOne concept entry, for this topic, with 1 or 2 activities. Everything must fit one period. If the class has mixed levels, say in the activity flow how to run it at two levels. "reasoning" is 2 or 3 sentences on why the plan is shaped this way.`;
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang), u, { schema: TIK_SCHEMA });
    return toTik(d, tikHeader(ch, topic), "Generated for this lesson", "topic", instruction || need, sources, lang);
  }

  /** Flow D (FR-51): apply a change request. The synced TIK itself never changes (FR-39). */
  async reviseTik(ch, tik, request, lang) {
    if (!this.online) return Offline.revise(tik, request); // the same object when not understood
    const provenance = tik.provenance.startsWith("Synced") ? "Edited by you" : tik.provenance;
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang),
      `Here is a TIK for class ${ch.classNum} ${ch.subject}, chapter ${ch.name}:\n${tikText(tik)}\nThe teacher asks: "${request}". Apply only that change and keep everything else. Return the full TIK.\n${TIK_FORMAT}`,
      { schema: TIK_SCHEMA });
    return toTik(d, tik.header, provenance, tik.scope, request, tik.references, lang);
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
    if (tik) u += `\nTIK activities: ${TikTabs.activities(tik).map(TikTabs.actText).join(" | ")}`;
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

  /** F8: a multiple-choice quiz with an answer key, for a whole chapter or some of its topics (v5.4 8.6). */
  async quiz(ch, topics, lang) {
    if (!this.online) return Offline.quiz(ch, topics);
    const ids = topics.map((t) => t.id);
    let u = `Draft a multiple-choice quiz for class ${ch.classNum} on ${topics.length === ch.topics.length ? `the whole chapter ${ch.name}` : `these topics of ${ch.name}: ${topics.map((t) => t.name).join(", ")}`}.\n`;
    topics.forEach((t) => { u += `Topic ${t.name} (topic_id ${t.id}): ${t.definitions.join(" ")}\n`; });
    u += `Write 2 questions per topic, at most 8. Each question has 3 or 4 options and exactly one correct option; "answer" is the 0-based index of the correct option; "topic_id" is one of ${JSON.stringify(ids)}. "checks" is one plain sentence in English: what this quiz checks.`;
    const d = await this.claude.complete(COMMON + "\n" + guardrails(ch.classNum) + langRule(lang) + "\nOnly the questions and options are sent to students, over an ordinary phone call (IVR), and they answer by pressing a number, so each question and its options must be short and clear when heard once.",
      u, { schema: QUIZ_SCHEMA, maxTokens: 6000 });
    const questions = d.questions.filter((q) => Array.isArray(q.options) && q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length)
      .map((q) => ({ q: q.q, options: q.options, answer: q.answer, topicId: ids.includes(q.topic_id) ? q.topic_id : ids[0] }));
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
