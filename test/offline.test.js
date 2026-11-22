// Offline drafting, TIK tabs, undo and offline speech understanding. All without a Claude key.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Engine, Store } from "../js/engine.js";
import { ContentGenerator } from "../js/generator.js";
import { Claude } from "../js/claude.js";
import { Source } from "../js/step.js";
import { match, opening } from "../js/matcher.js";
import { TikTabs } from "../js/tiktabs.js";
import { Curriculum } from "../js/data.js";
import * as Offline from "../js/offline.js";

const magnets = Curriculum.chapter("6-magnets");
const poles = Curriculum.topic("6-magnets-2");
const noAudio = { play: () => true, toggle() {}, replay() {}, stop() {}, isPlaying: () => false, hasMedia: () => false };
let e;
const id = () => e.step.id;
const go = async (...ids) => { for (const c of ids) await e.choose(c, Source.BUTTON); };

beforeEach(async () => {
  e = new Engine(new Store(null), new ContentGenerator(new Claude("")), noAudio);
  e.signIn("9000000001", "seeds123", true);
  await e.choose("no", Source.BUTTON); // voice guide off
  e.setClassLang(6, "English");
});

// ---------------------------------------------------------------- offline drafts

test("topic TIK is in Vision Empower's format and reflects the teacher's words", () => {
  const t = Offline.topicTik(magnets, poles, "12 students, mixed levels, 30 minutes, work in pairs, we have ring magnets", null, null);
  // the format's sections: overview, learn, engage (interest and concept generation), exercises, references, guidelines
  assert.ok(t.header.includes("Chapter number and name: 1. Exploring Magnets") && t.header.includes("Topic: Poles of a magnet"));
  assert.ok(t.objectives.length && t.prerequisites && t.keyPoints.length);
  assert.equal(t.interest.length, 1);
  assert.equal(t.concepts[0].topic, "Poles of a magnet");
  assert.equal(t.concepts[0].activities[0].name, "Pole hunt"); // the chapter TIK's activity for this topic
  for (const a of TikTabs.activities(t)) {
    assert.ok(Array.isArray(a.materials) && a.prerequisites && a.flow.length, a.name);
    assert.equal(a.flow[0], "Ask the students to work in pairs.");
    assert.ok(a.flow.some((s) => s.includes("Level 1") && s.includes("Level 2")));
  }
  assert.ok(t.reasoning.includes("30-minute"), t.reasoning);
  assert.ok(TikTabs.materials(t).some((m) => m.toLowerCase() === "ring magnets"));
  assert.ok(t.exercises.length);
  assert.ok(t.guidelines.some((g) => g.startsWith("Provide homework")));
});

test("applying suggestions leaves none behind", () => {
  const tiks = [
    ...Curriculum.chapters.filter((c) => c.syncedTik).map((c) => c.syncedTik),
    ...Curriculum.chapters.map((c) => Offline.chapterTik(c)),
    ...Curriculum.chapters.flatMap((c) => c.topics.map((t) => Offline.topicTik(c, t, null, null, null))),
    { ...magnets.syncedTik, interest: [{ ...magnets.syncedTik.interest[0], flow: ["Look at the picture on the board and see the colours."] }], exercises: [] },
  ];
  for (const t of tiks) {
    const ch = Curriculum.chapters.find((c) => c.syncedTik === t) || null;
    const fixed = Offline.applyAll(t, ch);
    assert.deepEqual(Offline.suggestions(fixed, ch).map((s) => s.text), []);
  }
  const sight = { ...magnets.syncedTik, interest: [{ ...magnets.syncedTik.interest[0], flow: ["Look at the picture on the board and see the colours."] }] };
  const fixed = Offline.applyAll(sight, magnets).interest[0].flow[0];
  assert.doesNotMatch(fixed, /\b(look at|picture|see|colours)\b/i);
});

test("revise applies known requests and refuses unknown ones", () => {
  const t = magnets.syncedTik;
  const pairs = Offline.revise(t, "make the activities work in pairs");
  assert.ok(TikTabs.activities(pairs).every((a) => /pairs/i.test(a.flow[0])));
  assert.equal(pairs.provenance, "Edited by you");
  assert.equal(TikTabs.activities(Offline.revise(t, "remove activity 2")).length, TikTabs.activities(t).length - 1);
  assert.equal(Offline.revise(t, "make it sparkle like a rainbow"), t); // not understood: unchanged, not faked
});

test("quiz is multiple choice with an answer key, for the chapter or some topics (8.6)", () => {
  for (const ch of Curriculum.chapters) {
    const { checks, questions } = Offline.quiz(ch, ch.topics);
    assert.ok(checks && questions.length, ch.id);
    for (const q of questions) {
      assert.ok(q.options.length >= 2 && q.answer >= 0 && q.answer < q.options.length, q.q);
      assert.equal(new Set(q.options).size, q.options.length, "options are all different");
      assert.ok(ch.topics.some((t) => t.id === q.topicId && t.definitions.includes(q.options[q.answer])), "the key is a Course fact");
    }
  }
  const some = Offline.quiz(magnets, [Curriculum.topic("6-magnets-3")]).questions;
  assert.ok(some.every((q) => q.topicId === "6-magnets-3"));
  assert.ok(new Set(Offline.quiz(magnets, magnets.topics).questions.map((q) => q.answer)).size > 1, "the right answer is not always first");
});

test("question requests offline are applied or refused", () => {
  const sets = Offline.questionSets(magnets, poles);
  assert.ok(sets.every((s) => s.check.length && s.discussion.length));
  assert.ok(Offline.reviseQuestions(sets, "make them easier"));
  assert.equal(Offline.reviseQuestions(sets, "purple monkeys"), null);
});

// ---------------------------------------------------------------- TIK tabs model

test("tabs parse and change summary", () => {
  assert.deepEqual(TikTabs.titles, ["Summary", "Overview", "Learn", "Engage", "Exercises", "References", "Guidelines", "Why"]);
  assert.equal(TikTabs.parse("open the engage tab"), 3);
  assert.equal(TikTabs.parse("key points"), 2);
  assert.equal(TikTabs.parse("summary tab"), 0);
  assert.equal(TikTabs.parse("next step"), null);
  const before = magnets.syncedTik;
  const after = Offline.revise(before, "make it simpler");
  assert.deepEqual([...TikTabs.changedTabs(before, after)], [1, 6]);
  assert.equal(TikTabs.changeText(before, after), "Overview: 3 changed. Guidelines: 1 added.");
  // the Engage tab keeps the format's headings: interest generation, then concept generation by topic, activities numbered
  const engage = TikTabs.lines(before, 3);
  assert.deepEqual(engage.slice(0, 2), ["Interest generation activity", "Activity 1: Feel the pull"]);
  assert.ok(engage.includes("Concept generation activity") && engage.includes("Poles of a magnet") && engage.includes("Activity 3: Pole hunt"));
  assert.ok(engage.includes("Activity flow:") && engage.some((x) => x.startsWith("Materials required: ")));
  assert.equal(TikTabs.lines(before, 4)[0], "Activity 5: Magnet strength test");
});

// ---------------------------------------------------------------- engine: tabs, suggestions, undo

async function openSyncedTik() {
  await go("plan", "c6", "Science", "6-magnets", "6-magnets-2", "yes");
  assert.equal(id(), "plan_review");
  await go("tik");
  assert.equal(id(), "tik_view");
}

test("TIK view has tabs and voice moves them", async () => {
  await openSyncedTik();
  assert.ok(e.step.tik);
  assert.equal(e.tikTab, 0);
  assert.ok(e.command("next_tab", Source.VOICE).startsWith("Overview tab, 2 of 8."));
  assert.deepEqual(match("engage tab", e.step, null), { type: "command", name: "tab:3" });
  assert.ok(e.command("tab:3", Source.VOICE).startsWith("Engage tab, 4 of 8. Interest generation activity. Activity 1: Feel the pull."));
  assert.equal(e.tikTab, 3);
  assert.ok(e.command("prev_tab", Source.VOICE).startsWith("Learn tab"));
  e.command("tab:0", Source.VOICE);
  assert.ok(e.command("prev_tab", Source.VOICE).startsWith("Why tab")); // wraps around
});

test("apply suggestions shows what changed, and undo restores", async () => {
  await openSyncedTik();
  assert.ok(e.step.tik.suggestions.length);
  const said = await e.choose("apply_suggestions", Source.BUTTON);
  assert.ok(said.startsWith("Applied the suggested changes."), said);
  assert.equal(id(), "tik_review");
  const l = e.lesson();
  assert.equal(l.tikState, "DRAFT");
  assert.equal(l.tik.provenance, "Edited by you");
  assert.deepEqual(l.tikBefore, magnets.syncedTik); // the Content Studio version is kept for "What changed"
  assert.deepEqual(e.step.tik.suggestions, []);
  assert.ok(e.undoPoint);
  const u = e.undo(Source.BUTTON);
  assert.ok(u.startsWith("Undone: Apply suggested changes."), u);
  assert.equal(id(), "tik_view");
  assert.deepEqual(e.lesson().tik, magnets.syncedTik); // back to Content Studio's TIK, used as it is
  assert.equal(e.lesson().tikState, "SYNCED_IN_USE");
  assert.equal(e.undoPoint, null);
});

test("change request offline is applied or honestly refused", async () => {
  await openSyncedTik();
  await go("change");
  assert.equal(id(), "tik_change");
  const no = await e.submitText("make it sparkle like a rainbow", Source.VOICE);
  assert.ok(no.startsWith("I couldn't apply that change"), no);
  assert.equal(id(), "tik_change");
  const yes = await e.submitText("remove activity 2", Source.VOICE);
  assert.ok(yes.includes("Engage: "), yes);
  assert.equal(id(), "tik_review");
});

test("approve cannot be undone", async () => {
  await openSyncedTik();
  await go("apply_suggestions");
  await e.choose("approve", Source.BUTTON);
  await e.choose("approve", Source.BUTTON, true);
  assert.equal(e.lesson().tikState, "APPROVED");
  assert.equal(e.undoPoint, null); // FR-98: commits have no undo
});

test("lesson audio comes only from Content Studio; without it the lesson is taught from the TIK (8.3)", async () => {
  e.setClassLang(7, "English");
  await e.fillDetails("plan", 7, "nutrition", "leaves and chlorophyll", Source.VOICE);
  assert.equal(e.topicOf({ topicId: e.draft.topicId }).syncedAudio, false);
  await go("yes");
  assert.equal(id(), "plan_review");
  assert.ok(e.lesson().tikOnly && !e.lesson().audio.length);
  assert.deepEqual(e.step.sections.find((s) => s.heading === "Audio").lines, ["Taught from the TIK, no audio"]);
});

test("Course questions can be used as they are, with no approval (FR-111)", async () => {
  await openSyncedTik();
  await go("use_as_is");
  assert.equal(id(), "qs_review");
  await go("use_course");
  const sets = e.lesson().questionSets;
  assert.ok(sets.every((s) => s.approved && s.discussion.length === 0 && s.check.length === Math.max(1, s.fromCourse)));
  assert.equal(id(), "lesson_saved"); // this topic has no Content Studio audio, so it is taught from the TIK
});

test("audio that cannot play falls back to teacher-led in one step (FR-38)", async () => {
  e.audio = { ...noAudio, play: () => false };
  await go("plan", "c6", "Science", "6-magnets", "6-magnets-1", "yes", "tik", "use_as_is"); // a topic with Content Studio audio
  await e.choose("approve", Source.BUTTON, true); // questions
  await e.choose("use", Source.BUTTON); // audio from Content Studio
  await go("open", "start", "audio");
  assert.equal(id(), "audio_player");
  await go("toggle");
  assert.equal(id(), "audio_failed");
  await go("teacher_led");
  assert.equal(id(), "teach_step");
});

// ---------------------------------------------------------------- offline speech understanding

test("misheard option words still match", async () => {
  await openSyncedTik();
  await go("apply_suggestions");
  assert.deepEqual(match("approved", e.step, null), { type: "choose", choiceId: "approve" });
  assert.deepEqual(match("undo that", e.step, null), { type: "command", name: "undo" });
  assert.deepEqual(match("banana", e.step, null), { type: "none" });
});

test("opening requests offline", async () => {
  assert.equal(opening("What should I teach next?").intent, "next");
  const o = opening("plan seventh class science for tomorrow");
  assert.equal(o.intent, "plan");
  assert.equal(o.classNum, 7);
  const r = await e.fillDetails(o.intent, o.classNum, o.chapter, null, Source.VOICE, o.subject);
  assert.ok(r.startsWith("Class 7, science. "), r);
  await e.fillDetails("next", null, null, null, Source.VOICE);
  assert.equal(id(), "next_class");
});
