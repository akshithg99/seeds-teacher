// Walks the teacher journey through the shared actions, offline (no Claude key). Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Engine, Store } from "../js/engine.js";
import { ContentGenerator } from "../js/generator.js";
import { Claude } from "../js/claude.js";
import { Source, Flow, spoken, splitLang, inLang, stripLang } from "../js/step.js";
import { match, opening } from "../js/matcher.js";
import { TikTabs } from "../js/tiktabs.js";
import { Curriculum } from "../js/data.js";
import * as Offline from "../js/offline.js";

class FakeAudio {
  constructor() { this.playing = false; this.media = false; }
  play() { this.playing = true; this.media = true; return true; }
  toggle() { this.playing = !this.playing; }
  replay() { this.playing = true; }
  stop() { this.playing = false; this.media = false; }
  isPlaying() { return this.playing; }
  hasMedia() { return this.media; }
}

const clock = 1_700_000_000_000; // a Tuesday
let e;
// a long list shows a page at a time: press More options until the choice is on screen
const reach = async (c) => { for (let k = 0; k < 5 && e.step && !e.step.choices.some((x) => x.id === c) && e.step.choices.some((x) => x.id === "__more"); k++) await e.choose("__more", Source.BUTTON); };
const id = () => e.step.id;
const choose = async (c, confirm = false) => {
  await reach(c);
  const s = await e.choose(c, Source.BUTTON);
  if (!confirm) return s;
  assert.ok(e.pending, `expected a read-back for ${c}`);
  return e.choose(c, Source.BUTTON, true);
};

beforeEach(() => {
  e = new Engine(new Store(null), new ContentGenerator(new Claude("")), new FakeAudio(), () => clock);
  assert.ok(e.signIn("9000000001", "wrong", true));
  assert.equal(e.signIn("9000000001", "seeds123", true), null);
  assert.equal(id(), "voice_pref");
});

test("full journey, offline", async () => {
  await choose("yes");
  assert.equal(id(), "home");
  assert.ok(e.voiceGuideOn);

  // an opening request (FR-102); there is no calendar, only the lesson sequence (8.1)
  const said = await e.fillDetails("plan", 6, "magnets", null, Source.VOICE);
  assert.ok(said.startsWith("Class 6"), said);
  assert.equal(id(), "plan_confirm");
  await choose("yes");
  assert.equal(id(), "class_lang"); // a new class asks its language once (FR-109)
  // one yes prepares the whole lesson; nothing is approved yet
  const prepared = await choose("Hindi", true); // CHANGE tier: read back first
  assert.equal(e.classLang(6), "Hindi");
  assert.equal(id(), "plan_review");
  assert.match(prepared, /There is only English support./); // FR-111: says it falls back to English
  assert.equal(e.step.announce, "Ready. Please review your lesson.");
  assert.equal(e.lesson().tikState, "SYNCED_IN_USE"); // Content Studio's TIK used as it is (BR-11)
  assert.ok(e.lesson().questionSets.length && !e.lesson().questionSets.some((q) => q.approved));
  assert.ok(e.lesson().tikOnly && !e.lesson().audio.length); // Content Studio has no recording for Exploring Magnets
  // the TIK is for the whole chapter; asking for a change makes a draft that needs approval
  assert.equal(e.lesson().topicId, null);
  assert.ok(!e.step.choices.some((c) => c.id === "topic_tik"), "no topic TIK");
  assert.equal(e.step.sections.find((s) => s.heading === "Questions").lines[0], "4 sets, for the overview and each topic · Not approved yet");
  await choose("tik");
  assert.equal(id(), "tik_view");
  await choose("change");
  const r = await e.submitText("work in pairs", Source.BUTTON);
  assert.doesNotMatch(r, /Claude key/);
  assert.equal(id(), "tik_review");
  assert.equal(e.lesson().tikState, "DRAFT");
  assert.ok(e.step.banner);

  // COMMIT by voice needs the action's own word, never just "yes" (FR-98, BR-29)
  await e.choose("approve", Source.VOICE);
  assert.equal(await e.confirmPending(Source.VOICE, "yes"), 'For this one I need you to say "approve". Or say cancel to leave it.');
  await e.confirmPending(Source.VOICE, "approve");
  assert.equal(e.lesson().tikState, "APPROVED");

  assert.equal(id(), "qs_review"); // reviewing carries on to the next piece
  await choose("approve", true);
  assert.equal(id(), "lesson_saved"); // no audio to review: audio is never made in the app (8.3)
  assert.equal(e.step.announce, "Lesson saved and ready to teach. Taught from the TIK, no audio.");

  // J3 teach; the learning check comes before End class, and the agent can read it to the class (8.4)
  await choose("open");
  await choose("start");
  assert.equal(id(), "teach_step");
  assert.ok(e.step.inClass);
  await choose("next");
  await choose("lc");
  assert.equal(id(), "lc_read");
  const read = await choose("read");
  assert.ok(read.includes(e.lesson().questionSets[0].check[0]), read);
  await choose("end", true);
  assert.equal(id(), "end_coverage");
  assert.equal(e.step.question, "Did you finish this step: Key points?");
  await choose("done");
  await choose("time");
  assert.equal(id(), "lc_ask"); // the result is given only for what was covered (AC-56.1)
  assert.deepEqual(e.step.choices.map((c) => c.id), ["few", "some", "many", "none"]);
  await choose("few");
  assert.equal(id(), "record_draft");
  await e.submitText("They found the poles part difficult", Source.BUTTON);
  await choose("review");
  assert.equal(id(), "record_preview");
  await choose("save", true);
  assert.equal(id(), "record_saved");
  assert.equal(e.st.records.length, 1);
  assert.ok(e.st.records[0].saved);
  assert.equal(e.st.patterns.length, 1);

  // F10: follow-up is for the class as a whole; change the concept, confirm, then a simpler TIK through the approval gate
  await choose("followups");
  await choose(e.step.choices[0].id);
  assert.equal(id(), "followup_pattern");
  assert.ok(!JSON.stringify(e.step).match(/students|group/i), "no student counts or groups");
  await choose("change");
  assert.equal(await e.submitText("North and south poles", Source.BUTTON), "Changed to North and south poles.");
  assert.equal(e.step.question, "North and south poles needs follow-up. Confirm, change or dismiss?");
  await choose("confirm", true);
  assert.equal(id(), "followup_type");
  await choose("tik");
  assert.equal(id(), "tik_review");
  assert.equal(e.lesson().tikState, "DRAFT");
  assert.ok(e.lesson().followUpFor);
  // the follow-up TIK is for the whole chapter too, made simpler
  assert.equal(e.lesson().tik.scope, "chapter");
  assert.deepEqual(e.lesson().tik.concepts.map((c) => c.topic), Curriculum.chapter("6-magnets").topics.map((t) => t.name));
  assert.ok(e.lesson().tik.objectives.every((o) => o.startsWith("In simple words")));
  assert.equal(e.lessonName(e.lesson()), "Class 6 Science, Exploring Magnets (follow-up on North and south poles)");
});

test("a repeated commit applies once (FR-103)", async () => {
  await choose("no");
  await e.fillDetails("next", 9, null, null, Source.VOICE);
  assert.equal(id(), "class_lang");
  // the same change arriving twice at once (double tap) applies once
  const [a, b] = await Promise.all([e.choose("English", Source.BUTTON, true), e.choose("English", Source.BUTTON, true)]);
  assert.match(a, /Class 9 is taught in English/);
  assert.doesNotMatch(b, /taught in English/); // the second tap does not apply it again
  assert.equal(e.classLang(9), "English");
});

test("Claude key can be set and removed at runtime", async () => {
  const c = new Claude("");
  const gen = new ContentGenerator(c);
  assert.ok(!c.available && !gen.online);
  c.configure("sk-ant-test-not-a-real-key");
  assert.ok(c.available && gen.online); // drafts switch online without a reload
  assert.equal(gen.draftLang("Tamil"), "Tamil");
  c.configure("");
  assert.ok(!c.available && !gen.online);
  assert.equal(gen.draftLang("Tamil"), "English");
  assert.equal(await c.test(), "No key is set.");
});

test("class not covered", async () => {
  await choose("no");
  const r = await e.fillDetails("plan", 8, null, null, Source.VOICE);
  assert.match(r, /not covered/);
  assert.equal(id(), "home");
});

test("opening request fills details and asks only what is missing", async () => {
  await choose("no");
  // the class alone: the subject is asked next
  assert.equal(await e.fillDetails("plan", 7, null, null, Source.VOICE), "Class 7. Which subject for class 7? You can say Science or Maths.");
  assert.equal(id(), "pick_subject");
  // with the subject, it offers where the class is up to in that subject's textbook, as one yes-or-no question (8.1)
  const r = await e.fillDetails("plan", 7, null, null, Source.VOICE, "Science");
  assert.equal(id(), "plan_confirm");
  assert.match(r, /^Class 7, science\. Start with chapter 1, The Ever-Evolving World of Science\?$/);
  assert.match(await e.fillDetails("plan", 9, null, null, Source.VOICE, "Maths"), /^Class 9, maths\. Start with chapter 1, Orienting Yourself: The Use of Coordinates\?$/);
});

test("matcher: numbers, commands, opening", async () => {
  await choose("no");
  await choose("plan");
  const s = e.step;
  assert.deepEqual(match("two", s, null), { type: "choose", choiceId: "c7" });
  assert.deepEqual(match("class nine", s, null), { type: "choose", choiceId: "c9" });
  assert.deepEqual(match("Where am I?", s, null), { type: "command", name: "where_am_i" });
  assert.deepEqual(match("I want to talk about my students and their needs today", s, null), { type: "none" });
  const o = opening("plan class 7 science for thursday");
  assert.equal(o.classNum, 7);
  assert.equal(o.subject, "Science");
  assert.equal(opening("plan the class 6 maths lesson").subject, "Maths");
  assert.equal(o.intent, "plan"); // a day is not a detail any more: there is no calendar (8.1)
});

test("back and what did you do", async () => {
  await choose("no");
  await choose("plan");
  await choose("c6");
  assert.equal(id(), "pick_subject");
  await choose("Maths");
  assert.equal(id(), "plan_chapter");
  assert.ok(e.step.choices.every((c) => !c.id.startsWith("6-")), "only maths chapters");
  e.command("back", Source.VOICE);
  assert.equal(id(), "pick_subject");
  e.command("back", Source.VOICE);
  assert.equal(id(), "plan_class");
  assert.match(e.command("what_did_you_do", Source.VOICE), /Maths/);
});

test("content in another language is marked for its own voice (FR-110)", () => {
  const s = `Steps tab. ${inLang("Tamil", "ஒன்று.")} Done.`;
  assert.deepEqual(splitLang(s).map((p) => p.lang), [null, "Tamil", null]);
  assert.equal(stripLang(s), "Steps tab. ஒன்று. Done.");
  assert.equal(inLang("English", "x"), "x");
  const p = { tik: { ...Curriculum.chapter("6-magnets").syncedTik, lang: "Hindi" }, before: null, suggestions: [], status: "" };
  assert.ok(TikTabs.spokenTab(p, 2).includes("⟦Hindi⟧"));
  assert.ok(!TikTabs.spokenTab({ ...p, tik: { ...p.tik, lang: "English" } }, 2).includes("⟦"));
});

test("cancelling an agent turn applies nothing (FR-99)", async () => {
  await choose("no");
  const cp = e.checkpoint();
  await e.fillDetails("next", 6, null, null, Source.VOICE);
  await choose("English", true);
  assert.equal(e.classLang(6), "English");
  e.rollback(cp);
  assert.equal(e.classLang(6), null);
  assert.equal(id(), "home");
  assert.equal(e.st.events[e.st.events.length - 1].action, "turn_cancelled"); // the log keeps what happened
});

test("the agent talks in plain words, never a numbered menu", async () => {
  await choose("no");
  await choose("plan");
  assert.equal(spoken(e.step), "Which class? You can say class 6, class 7 or class 9.");
  // a question that already names its choices is not followed by a list
  await choose("c6"); await choose("Science"); await choose("6-magnets"); await choose("yes");
  await choose("English", true);
  assert.equal(spoken(e.step), "Ready. Please review your lesson. Shall we go through it now?");
  // a suggestion is offered first, and "yes" takes it
  e.fillDetails("next", null, null, null, Source.VOICE);
  await choose("c6"); await choose("Science"); await choose("other");
  assert.equal(spoken(e.step), "Which chapter? How about chapter 1, The Wonderful World of Science? It comes first in the textbook. Or tell me another one.");
  assert.deepEqual(match("yes", e.step, null), { type: "choose", choiceId: "6-world" });
  const help = e.command("help", Source.VOICE);
  assert.match(help, /You can say chapter 1, The Wonderful World of Science, chapter 2, /); // the full list only when asked
  for (const s of [spoken(e.step), help]) assert.doesNotMatch(s, /\b(say|press) \d|; \d, /i);
  // a read-back asks in plain words, and Home sounds like a colleague
  await choose("6-world"); await choose("yes");
  await choose("tik");
  assert.match(await e.choose("use_as_is", Source.BUTTON), /Content Studio TIK/);
  e.goHome();
  assert.match(spoken(e.step), /^You have 2 lessons ready to teach\. /);
  void Offline;
});

test("Home offers to carry on a half-planned lesson", async () => {
  await choose("no");
  // Lines and Angles has no Content Studio TIK, so its TIK is a draft and the lesson is not ready yet
  await choose("plan"); await choose("c6"); await choose("Maths"); await choose("6m-lines"); await choose(e.step.choices[0].id); await choose("yes");
  await choose(e.step.choices.find((c) => /English/.test(c.label)).id, true);
  assert.equal(id(), "plan_review");
  assert.equal(e.lesson().tikState, "DRAFT");
  await e.goHome();
  assert.equal(id(), "home");
  assert.deepEqual(e.step.choices.map((c) => c.id), ["resume_plan", "plan", "awaiting", "menu"]);
  assert.match(e.step.announce, /You were planning Class 6 Maths, Lines and Angles/);
  assert.deepEqual(match("yes", e.step, null), { type: "choose", choiceId: "resume_plan" }); // a teacher can just agree
  await choose("resume_plan");
  assert.equal(id(), "plan_review"); // back to what is left to review
});

test("Workspace lists Content Studio items and the teacher's own, and opens each", async () => {
  await choose("no");
  // voice and menu both reach it
  assert.deepEqual(match("my workspace", e.step, null), { type: "goto", flow: Flow.WORKSPACE });
  await e.goTo(Flow.WORKSPACE, Source.BUTTON);
  assert.equal(id(), "workspace");
  const syncedTiks = Curriculum.chapters.filter((c) => c.syncedTik).length;
  const syncedAudio = Curriculum.chapters.filter((c) => c.audio).length;
  const syncedQuizzes = Curriculum.chapters.filter((c) => c.syncedQuiz).length;
  assert.equal(e.step.sections[0].lines[0], `${syncedTiks} TIKs, ${syncedAudio} audio, ${syncedQuizzes === 1 ? "1 quiz" : `${syncedQuizzes} quizzes`}`);
  assert.equal(e.step.sections[1].lines[0], "0 TIKs, 0 audio, 0 quizzes");

  // a Content Studio TIK opens as tabs, read-only
  await choose("tiks");
  assert.equal(id(), "ws_list");
  await choose(e.step.choices[0].id);
  assert.equal(id(), "ws_item");
  assert.ok(e.step.tik);
  assert.deepEqual(e.step.choices.map((c) => c.id), ["ws_back"]); // no edit from here
  await choose("ws_back");

  // Content Studio audio can be played
  await choose("ws_home"); await choose("audio"); await choose(e.step.choices[0].id);
  assert.equal(e.step.title, "Audio");
  await choose("play");
  assert.ok(e.audio.isPlaying());
  await choose("ws_back");
  assert.equal(e.audio.isPlaying(), false); // leaving stops it

  // a TIK built for a chapter with none from Content Studio shows up as the teacher's, not approved yet
  await choose("home"); await choose("plan"); await choose("c6"); await choose("Maths"); await choose("6m-lines"); await choose("yes");
  await choose(e.step.choices.find((c) => /English/.test(c.label)).id, true);
  await e.goTo(Flow.WORKSPACE, Source.BUTTON);
  assert.equal(e.step.sections[1].lines[0], "1 TIK, 0 audio, 0 quizzes"); // lesson audio is never made in the app (8.3)
  await choose("tiks");
  assert.ok(e.step.sections[1].lines.some((x) => /Lines and Angles: chapter TIK · Not approved yet/.test(x)));
});

test("Plan a quiz: Content Studio's or a new one, for the chapter or some topics; Share to IVR sends only the questions (8.6)", async () => {
  await choose("no");
  await e.goTo(Flow.QUIZ, Source.BUTTON);
  assert.equal(id(), "quiz_home");
  assert.deepEqual(e.step.choices.map((c) => c.id), ["plan", "mine"]);

  // Content Studio has a quiz for Exploring Magnets: it is offered first, with its answer key
  await choose("plan"); await choose("c6"); await choose("Science"); await choose("6-magnets");
  assert.equal(id(), "quiz_source");
  await choose("use_cs");
  assert.equal(id(), "quiz_review");
  let q = e.st.quizzes.at(-1);
  assert.equal(q.provenance, "Synced from Content Studio");
  assert.ok(e.step.sections.some((s) => s.heading === "Answer key"));
  assert.ok(!e.step.choices.some((c) => c.id === "regenerate"), "Content Studio's quiz is used as it is");
  await choose("approve", true);
  assert.equal(id(), "quiz_window");
  await choose("friday");
  assert.equal(id(), "quiz_share");
  // what goes to IVR: the questions and options, never the answer key
  const sent = e.step.sections.filter((s) => s.heading.startsWith("Question")).flatMap((s) => s.lines);
  assert.ok(sent.length && !sent.some((x) => /\(answer\)/.test(x)));
  assert.deepEqual(e.step.sections.at(-1).lines, ["The answer key. It stays with you, in your workspace."]);
  assert.equal(e.step.choices[0].label, "Share to IVR");
  const rb = await e.choose("share", Source.BUTTON);
  assert.match(rb, /The answer key is not sent/);
  assert.match(await e.choose("share", Source.BUTTON, true), /Shared to IVR until Friday evening. Only the questions were sent./);
  assert.equal(id(), "quiz_live");
  await choose("close", true);
  assert.equal(id(), "quiz_results");
  q = e.st.quizzes.find((x) => x.id === q.id);
  const stats = e.quizStats(q);
  assert.deepEqual(stats.topics.map((t) => t.id), ["6-magnets-1", "6-magnets-2", "6-magnets-3"]);
  assert.ok(!JSON.stringify(e.step).match(/student[s]? (?:scored|named)|names/i), "results are for the class as a whole");
  assert.equal(e.st.patterns.length, stats.weak.length); // one follow-up per weak topic

  // the workspace keeps it, with the answer key and how the class did; the Content Studio original is not listed twice
  await e.goTo(Flow.WORKSPACE, Source.BUTTON); await choose("quizzes");
  assert.deepEqual(e.step.choices.filter((c) => c.id.startsWith("q") || c.id.startsWith("csq")).map((c) => c.id), [`q:${q.id}`]);
  await choose(`q:${q.id}`);
  assert.deepEqual(e.step.sections.slice(-3).map((s) => s.heading), ["Answer key", "How the class did", "Needs reinforcement"]);

  // or a new quiz on some topics only
  await e.goTo(Flow.QUIZ, Source.BUTTON);
  await choose("plan"); await choose("c6"); await choose("Science"); await choose("6-magnets"); await choose("make");
  assert.equal(id(), "quiz_scope");
  await choose("topics");
  assert.equal(e.step.choices.find((c) => c.id === "make").enabled, false);
  await choose("6-magnets-2"); await choose("6-magnets-3"); await choose("6-magnets-3"); // choosing again takes it out
  assert.deepEqual(e.draft.quizTopics, ["6-magnets-2"]);
  await choose("make");
  assert.equal(id(), "quiz_review");
  const mine = e.st.quizzes.at(-1);
  assert.deepEqual(mine.topicIds, ["6-magnets-2"]);
  assert.ok(mine.questions.every((x) => x.topicId === "6-magnets-2" && x.options.length >= 2));
  assert.ok(e.step.banner); // a draft waits for approval
  assert.equal(e.quizName(mine), "Class 6 Science, Exploring Magnets: Poles of a magnet");
});

test("a class that stops partway through the TIK continues from the next topic; a finished TIK offers the next chapter", async () => {
  await choose("no");
  e.setClassLang(6, "English");
  for (const c of ["plan", "c6", "Science", "6-magnets", "yes", "tik", "use_as_is"]) await choose(c);
  await e.choose("approve", Source.BUTTON, true); // questions
  const steps = TikTabs.classSteps(e.lesson().tik);
  assert.deepEqual(steps.map((s) => s.name), ["Objectives and prerequisites", "Key points", "Interest generating activity",
    "Concept generation: Magnetic and non-magnetic materials", "Concept generation: Poles of a magnet", "Concept generation: Attraction and repulsion",
    "Exercise and reinforcement activity"]);
  await choose("open"); await choose("start");
  assert.equal(e.step.title, "Step 1 of 7: Objectives and prerequisites");
  for (let k = 0; k < 4; k++) await choose("next");
  assert.equal(e.step.title, "Step 5 of 7: Concept generation: Poles of a magnet");
  await choose("end", true);
  assert.equal(e.step.question, "Did you finish this step: Concept generation: Poles of a magnet?");
  // time is left in the period, so the agent suggests carrying on; End class still works afterwards
  assert.equal(e.step.announce, "About 40 minutes of the period are left. You could carry on with the next step: Concept generation: Attraction and repulsion.");
  assert.equal(await choose("carry_on"), "Carrying on with Concept generation: Attraction and repulsion.");
  assert.equal(e.step.title, "Step 6 of 7: Concept generation: Attraction and repulsion");
  await choose("prev");
  e.clock = () => clock + 41 * 60000; // the period is over: no suggestion
  await choose("end", true);
  assert.equal(id(), "end_coverage");
  assert.ok(!e.step.choices.some((c) => c.id === "carry_on") && !e.step.announce);
  e.clock = () => clock;
  await choose("partway");
  await choose("time");
  while (id() === "lc_ask") await choose("some");
  assert.equal(id(), "record_draft");
  assert.ok(e.coveredTopics().has("6-magnets-1") && !e.coveredTopics().has("6-magnets-2"));
  assert.ok(e.st.records.at(-1).prefilled.includes("Next class starts at: Concept generation: Poles of a magnet."));

  // the next class starts where this one stopped
  await e.goTo(Flow.HOME, Source.BUTTON);
  assert.deepEqual(e.step.sections.find((s) => s.heading === "Ready to teach").lines, [e.lessonName(e.lesson()) + " (continue from Concept generation: Poles of a magnet)"]);
  await choose("teach_pick"); await choose(e.step.choices[0].id);
  assert.match(e.step.announce, /It continues from Concept generation: Poles of a magnet, where the last class stopped./);
  await choose("start");
  assert.equal(e.step.title, "Step 5 of 7: Concept generation: Poles of a magnet");
  await choose("next"); await choose("next");
  await choose("end", true);
  assert.ok(!e.step.choices.some((c) => c.id === "carry_on")); // the last step has nothing to carry on to
  await choose("done");
  while (id() === "lc_ask") await choose("some");
  assert.ok(e.taught(e.lesson()));
  assert.deepEqual(e.st.sessions.at(-1).covered, ["6-magnets-2", "6-magnets-3"]); // this class's topics only, so the learning check does not repeat the first

  // the whole chapter is covered, so Home offers the next chapter to plan
  await e.goTo(Flow.HOME, Source.BUTTON);
  assert.deepEqual(e.step.sections.find((s) => s.heading === "Up next").lines, ["Class 6 science, chapter 5, Measurement of Length and Motion"]);
  await choose("plan_next");
  assert.equal(id(), "plan_confirm");
  assert.equal(e.draft.chapterId, "6-measure");
});

test("History lists approved TIKs with how much is taught, and approved quizzes with whether they were taken", async () => {
  await choose("no");
  assert.deepEqual(match("history", e.step, null), { type: "goto", flow: Flow.HISTORY });
  e.setClassLang(6, "English");
  for (const c of ["plan", "c6", "Science", "6-magnets", "yes", "tik", "use_as_is"]) await choose(c);
  await e.choose("approve", Source.BUTTON, true); // questions
  // each item is a button that opens it, with its status in its name
  const lines = (h) => e.step.choices.filter((c) => c.label.startsWith(h === "TIKs" ? "TIK: " : "Quiz: ")).map((c) => c.label.replace(/^(TIK|Quiz): /, ""));
  await e.goTo(Flow.HISTORY, Source.BUTTON);
  assert.equal(id(), "history");
  assert.deepEqual(lines("TIKs"), ["Class 6 Science, Exploring Magnets · Not taught yet"]);
  // taught partly, then completely
  await e.goTo(Flow.TEACH, Source.BUTTON); await choose(e.step.choices[0].id); await choose("start");
  for (let k = 0; k < 3; k++) await choose("next");
  await choose("end", true); await choose("done"); await choose("time");
  while (id() === "lc_ask") await choose("some");
  await e.goTo(Flow.HISTORY, Source.BUTTON);
  assert.deepEqual(lines("TIKs"), ["Class 6 Science, Exploring Magnets · Taught partly: the next class starts at Concept generation: Poles of a magnet"]);
  // a TIK opens with its tabs, and a partly taught one can be continued from there
  await choose(e.step.choices.find((c) => c.label.startsWith("TIK: ")).id);
  assert.equal(id(), "history_tik");
  assert.ok(e.step.tik && e.step.known.some(([k, v]) => k === "Taught" && v.startsWith("Taught partly")));
  assert.deepEqual(e.step.choices.map((c) => c.id), ["teach", "history_back"]);
  assert.equal(e.step.choices[0].label, "Continue teaching");
  await choose("history_back");
  assert.equal(id(), "history");
  // quizzes: only approved ones are listed, and taken once closed
  await e.goTo(Flow.QUIZ, Source.BUTTON);
  for (const c of ["plan", "c6", "Science", "6-magnets", "use_cs"]) await choose(c);
  assert.deepEqual(e.history().quizzes, []); // a draft is not listed
  await choose("approve", true); await choose("friday"); await choose("share", true);
  await e.goTo(Flow.HISTORY, Source.BUTTON);
  assert.deepEqual(lines("Quizzes"), ["Class 6 Science, Exploring Magnets · Being taken: open on IVR until Friday evening"]);
  assert.match(e.step.announce, /1 approved quiz: 0 taken, 1 not taken yet./);
  // a quiz opens with its questions, answer key and how the class did
  await choose(e.step.choices.find((c) => c.label.startsWith("Quiz: ")).id);
  assert.equal(id(), "history_quiz");
  assert.ok(e.step.sections.some((x) => x.heading === "Answer key"));
  assert.deepEqual(e.step.choices.map((c) => c.id), ["live_quiz", "history_back"]);
  await choose("history_back");
  // filter by class and subject; the filter stays while items are opened
  await choose("filter"); await choose("c7"); await choose("all");
  assert.equal(e.step.question, "Open follow-ups and class records, or go back to Home?");
  assert.deepEqual(e.step.sections.at(-1).lines, ["Nothing approved for class 7 yet."]);
  assert.deepEqual(e.step.known, [["Showing", "Class 7"]]);
  await choose("filter"); await choose("c6"); await choose("Maths");
  assert.deepEqual(lines("TIKs").concat(lines("Quizzes")), []);
  await choose("filter"); await choose("c6"); await choose("Science");
  assert.equal(lines("TIKs").length + lines("Quizzes").length, 2);
  assert.match(e.step.announce, /^Showing class 6 science\. /);
  await choose(e.step.choices.find((c) => c.label.startsWith("Quiz: ")).id); await choose("history_back");
  assert.deepEqual(e.step.known, [["Showing", "Class 6 science"]]);
  assert.equal(await choose("clear_filter"), "Showing everything.");
  assert.deepEqual(e.step.known, []);
  await choose("followups");
  assert.equal(id(), "followups");
});
