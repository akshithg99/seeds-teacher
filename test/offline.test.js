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

test("topic TIK reflects the teacher's words", () => {
  const t = Offline.topicTik(magnets, poles, "12 students, mixed levels, 30 minutes, work in pairs, we have ring magnets", null, null);
  assert.ok(t.activities.every((a) => a.includes("Level 1") && a.includes("Level 2")));
  assert.ok(t.activities[0].includes("Work in pairs"));
  assert.ok(t.reasoning.includes("30-minute"), t.reasoning);
  assert.ok(t.materials.some((m) => m.toLowerCase() === "ring magnets"));
  assert.ok(t.steps.some((s) => /pole/i.test(s)));
  assert.ok(t.steps.every((s) => /\(\d+ min\)/.test(s)));
  assert.ok(t.extension);
});

test("applying suggestions leaves none behind", () => {
  const tiks = [
    ...Curriculum.chapters.filter((c) => c.syncedTik).map((c) => c.syncedTik),
    ...Curriculum.chapters.map((c) => Offline.chapterTik(c)),
    ...Curriculum.chapters.flatMap((c) => c.topics.map((t) => Offline.topicTik(c, t, null, null, null))),
    { ...magnets.syncedTik, steps: ["Look at the picture on the board and see the colours.", ...magnets.syncedTik.steps], extension: null },
  ];
  for (const t of tiks) {
    const ch = Curriculum.chapters.find((c) => c.syncedTik === t) || null;
    const fixed = Offline.applyAll(t, ch);
    assert.deepEqual(Offline.suggestions(fixed, ch).map((s) => s.text), []);
  }
  const sight = { ...magnets.syncedTik, steps: ["Look at the picture on the board and see the colours."] };
  const fixed = Offline.applyAll(sight, magnets).steps[0];
  assert.doesNotMatch(fixed, /\b(look at|picture|see|colours)\b/i);
});

test("revise applies known requests and refuses unknown ones", () => {
  const t = magnets.syncedTik;
  const pairs = Offline.revise(t, "make the activities work in pairs");
  assert.ok(pairs.activities.every((a) => /pair/i.test(a)));
  assert.equal(pairs.provenance, "Edited by you");
  assert.equal(Offline.revise(t, "remove step 2").steps.length, t.steps.length - 1);
  assert.equal(Offline.revise(t, "make it sparkle like a rainbow"), t); // not understood: unchanged, not faked
});

test("quiz has True and False answers from the Course", () => {
  const { checks, questions } = Offline.quiz(magnets, Curriculum.topic("6-magnets-3"));
  assert.ok(checks);
  assert.ok(questions.length && questions.every((q) => q.answer >= 0 && q.answer < q.options.length));
  assert.ok(questions.some((q) => q.answer === 1), "needs at least one False answer");
  assert.ok(questions.some((q) => q.answer === 0));
});

test("question requests offline are applied or refused", () => {
  const sets = Offline.questionSets(magnets, poles);
  assert.ok(sets.every((s) => s.check.length && s.discussion.length));
  assert.ok(Offline.reviseQuestions(sets, "make them easier"));
  assert.equal(Offline.reviseQuestions(sets, "purple monkeys"), null);
});

// ---------------------------------------------------------------- TIK tabs model

test("tabs parse and change summary", () => {
  assert.equal(TikTabs.parse("open the activities tab"), 3);
  assert.equal(TikTabs.parse("materials"), 4);
  assert.equal(TikTabs.parse("summary tab"), 0);
  assert.equal(TikTabs.parse("next step"), null);
  const before = magnets.syncedTik;
  const after = Offline.revise(before, "remove step 2");
  assert.deepEqual([...TikTabs.changedTabs(before, after)], [2]);
  assert.equal(TikTabs.changeText(before, after), "Steps: 1 removed.");
});

// ---------------------------------------------------------------- engine: tabs, suggestions, undo

async function openSyncedTik() {
  await go("plan", "c6", "6-magnets", "6-magnets-2", "yes");
  assert.equal(id(), "plan_tik_source");
  await go("check");
  assert.equal(id(), "tik_view");
}

test("TIK view has tabs and voice moves them", async () => {
  await openSyncedTik();
  assert.ok(e.step.tik);
  assert.equal(e.tikTab, 0);
  assert.ok(e.command("next_tab", Source.VOICE).startsWith("Objective tab, 2 of 9."));
  assert.deepEqual(match("activities tab", e.step, null), { type: "command", name: "tab:3" });
  assert.ok(e.command("tab:3", Source.VOICE).startsWith("Activities tab"));
  assert.equal(e.tikTab, 3);
  assert.ok(e.command("prev_tab", Source.VOICE).startsWith("Steps tab"));
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
  assert.equal(e.lesson().tik, null);
  assert.equal(e.undoPoint, null);
});

test("change request offline is applied or honestly refused", async () => {
  await openSyncedTik();
  await go("change");
  assert.equal(id(), "tik_change");
  const no = await e.submitText("make it sparkle like a rainbow", Source.VOICE);
  assert.ok(no.startsWith("I couldn't apply that change"), no);
  assert.equal(id(), "tik_change");
  const yes = await e.submitText("remove step 2", Source.VOICE);
  assert.ok(yes.includes("Steps: 1 removed."), yes);
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

test("destructive schedule actions ask first", async () => {
  await e.fillDetails("schedule", 6, "Monday", 2, "magnets", null, Source.VOICE);
  await go("done");
  assert.equal(id(), "sched_review");
  await e.choose("restart", Source.BUTTON);
  assert.ok(e.pending, "start over must be confirmed");
  e.cancelPending();
  await go("change");
  await e.choose(e.step.choices[0].id, Source.BUTTON);
  assert.ok(e.pending, "removing an entry must be confirmed");
});

test("Course questions can be used as they are, with no approval (FR-111)", async () => {
  await openSyncedTik();
  await go("use_as_is", "chapter", "prepare");
  assert.equal(id(), "qs_review");
  await go("use_course");
  const sets = e.lesson().questionSets;
  assert.ok(sets.every((s) => s.approved && s.discussion.length === 0 && s.check.length === Math.max(1, s.fromCourse)));
  assert.equal(id(), "audio_offer");
});

test("audio that cannot play falls back to teacher-led in one step (FR-38)", async () => {
  e.audio = { ...noAudio, play: () => false };
  await openSyncedTik();
  await go("use_as_is", "chapter", "skip", "prepare");
  await e.choose("approve", Source.BUTTON, true);
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
  assert.equal(o.day, "tomorrow");
  const r = await e.fillDetails(o.intent, o.classNum, o.day, null, null, null, Source.VOICE);
  assert.ok(r.startsWith("Class 7, science, "), r);
  assert.ok(e.dayName("tomorrow"));
  await e.fillDetails("next", null, null, null, null, null, Source.VOICE);
  assert.equal(id(), "next_class");
});
