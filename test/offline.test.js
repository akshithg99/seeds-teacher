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
// a long list shows a page at a time: press More options until the choice is on screen
const go = async (...ids) => { for (const c of ids) { for (let k = 0; k < 5 && !e.step.choices.some((x) => x.id === c) && e.step.choices.some((x) => x.id === "__more"); k++) await e.choose("__more", Source.BUTTON); await e.choose(c, Source.BUTTON); } };

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
  assert.ok(t.header.includes("Chapter number and name: 4. Exploring Magnets") && t.header.includes("Topic: Poles of a magnet"));
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
  await go("plan", "c6", "Science", "6-magnets", "yes");
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
  e.setClassLang(9, "English");
  await e.fillDetails("plan", 9, "motion", null, Source.VOICE, "Science");
  assert.equal(Curriculum.chapter(e.draft.chapterId).audio, undefined); // Motion has no recording
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
  e.setClassLang(7, "English");
  await go("plan", "c7", "Maths", "7m-decimals", "yes", "tik", "use_as_is"); // a chapter with a Content Studio TIK and recording
  await e.choose("approve", Source.BUTTON, true); // questions
  await e.choose("use", Source.BUTTON); // the recording
  await go("open", "start", "audio");
  assert.equal(id(), "audio_player");
  await go("toggle");
  assert.equal(id(), "audio_failed");
  await go("teacher_led");
  assert.equal(id(), "teach_step");
});

test("in class, voice moves around the recording, and the next class carries on where it stopped", async () => {
  // a recording player: pausing or stopping reports where it was, as the real one does
  const rec = { ...noAudio, media: false, playing: false, pos: 0, at: null, clip: null,
    play(clip, _f, _x, at = 0) { this.clip = clip; this.media = this.playing = true; this.pos = this.at = at; return true; },
    toggle() { this.playing = !this.playing; if (!this.playing) e.saveAudioAt(this.clip, this.pos); },
    stop() { if (this.media) e.saveAudioAt(this.clip, this.pos); this.media = this.playing = false; },
    isPlaying() { return this.playing; }, hasMedia() { return this.media; }, position() { return this.pos; }, seekTo(s) { this.pos = s; } };
  e.audio = rec;
  const say = (t) => { const r = match(t, e.step, null); assert.equal(r.type, "command", t); return e.command(r.name, Source.VOICE); };
  e.setClassLang(7, "English");
  await go("plan", "c7", "Maths", "7m-decimals", "yes", "tik", "use_as_is");
  await e.choose("approve", Source.BUTTON, true);
  await e.choose("use", Source.BUTTON);
  await go("open", "start", "audio");
  await go("toggle");
  assert.equal(rec.at, 0);
  rec.pos = 1500;
  assert.equal(say("pause"), "Paused.");
  assert.equal(rec.playing, false);
  assert.equal(say("back 30 seconds"), "");
  assert.ok(rec.playing && rec.pos === 1470);
  say("jump to minute 20");
  assert.equal(rec.pos, 1200);
  const dur = e.audioClip().durationSec;
  // speed by voice: it carries on playing at the new speed, which is kept
  rec.setRate = (r) => { rec.rate = r; };
  say("pause");
  assert.equal(say("faster"), "");
  assert.ok(rec.playing && rec.rate === 1.25 && e.st.audioRate === 1.25);
  say("speed 2");
  assert.equal(say("faster"), "That is already the fastest speed, 2 times.");
  say("normal speed");
  assert.equal(e.st.audioRate, 1);
  assert.equal(say("go to minute 500"), `The recording is only ${Math.round(dur / 60)} minutes long.`);
  assert.equal(rec.pos, 1200);
  await go("back"); // stopping saves the place
  // from the TIK step screen too: it opens the audio and plays from there
  assert.equal(id(), "teach_step");
  assert.equal(say("pause"), "The audio is not playing.");
  say("back 30 seconds");
  assert.equal(id(), "audio_player");
  assert.ok(rec.playing && rec.at === 1170);
  rec.pos = 1200; await go("back");
  // and from the learning check
  await go("lc");
  assert.equal(id(), "lc_read");
  assert.match(e.step.help, /jump to minute 20/);
  say("jump to minute 5");
  assert.equal(id(), "audio_player");
  assert.ok(rec.playing && rec.at === 300);
  rec.pos = 1200; await go("back");
  // the next class: the recording carries on from there
  await go("audio");
  assert.deepEqual(e.step.known.at(-1), ["Carries on from", "20:00, where you stopped"]);
  assert.match(e.step.announce, /carries on from 20 minutes in/);
  await go("toggle");
  assert.equal(rec.at, 1200);
  // it ends: the place is cleared, and "back 30 seconds" plays the last half minute again
  e.saveAudioAt(rec.clip, 0); rec.media = rec.playing = false; e.onAudioFinished();
  assert.equal(id(), "audio_finished");
  assert.equal(e.lesson().audioAt[rec.clip.id], 0); // finished: the next class starts from the beginning
  say("back 30 seconds");
  assert.equal(id(), "audio_player");
  assert.equal(rec.at, dur - 30);
});

test("spoken audio controls", () => {
  const s = { ...e.step, audio: true };
  const m = (t) => { const r = match(t, s, null); return r.type === "command" ? r.name : r.type; };
  assert.equal(m("back 30 seconds"), "seek:-30");
  assert.equal(m("go back thirty seconds"), "seek:-30");
  assert.equal(m("rewind"), "seek:-30");
  assert.equal(m("forward 2 minutes"), "seek:120");
  assert.equal(m("skip ahead one minute"), "seek:60");
  assert.equal(m("skip a minute"), "seek:60");
  assert.equal(m("half a minute back"), "seek:-30");
  assert.equal(m("jump to minute 20"), "seekto:1200");
  assert.equal(m("go to 20 minutes"), "seekto:1200");
  assert.equal(m("minute twenty five"), "seekto:1500");
  assert.equal(m("from the beginning"), "seekto:0");
  assert.equal(m("pause"), "audio_pause");
  assert.equal(m("resume"), "audio_play");
  assert.equal(m("back"), "back"); // still the Back command
  assert.equal(m("back banana seconds"), "none");
  assert.equal(m("speed 1.5"), "rate:1.5");
  assert.equal(m("set the speed to 1.25x"), "rate:1.25");
  assert.equal(m("play at 2x"), "rate:2");
  assert.equal(m("one and a half times"), "rate:1.5");
  assert.equal(m("normal speed"), "rate:1");
  assert.equal(m("half speed"), "rate:0.5");
  assert.equal(m("faster"), "rate:up");
  assert.equal(m("slow down"), "rate:down");
  assert.equal(m("speed 3"), "none");
  assert.notEqual(match("back 30 seconds", e.step, null).name, "seek:-30"); // only on the audio screens
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

test("a chapter recording synced from Content Studio is offered for every topic of the chapter and played as a file", async () => {
  e.setClassLang(7, "English");
  await go("plan", "c7", "Maths", "7m-decimals", "yes", "tik", "use_as_is");
  assert.equal(e.lesson().tikState, "SYNCED_IN_USE"); // the chapter's TIK comes from Content Studio too
  await e.choose("approve", Source.BUTTON, true); // questions
  assert.equal(id(), "audio_review");
  const clip = e.lesson().audio[0];
  assert.deepEqual([clip.src, clip.provenance, clip.name], ["audio/c7-maths-3.mp3", "Synced from Content Studio", "Chapter 3 recording: A Peek Beyond the Point"]);
  assert.deepEqual(e.step.sections[0].lines, ["A recording, about 114 minutes. Set the speaker volume high."]);
  await go("use");
  assert.ok(e.lesson().audio[0].approved);
});

test("every chapter with a Content Studio recording has a Content Studio TIK, one concept step per topic, with no suggestions left", () => {
  for (const ch of Curriculum.chapters.filter((c) => c.audio)) {
    const t = ch.syncedTik;
    assert.ok(t, ch.id);
    assert.equal(t.provenance, "Synced from Content Studio");
    assert.deepEqual(t.concepts.map((c) => c.topic), ch.topics.map((x) => x.name), ch.id);
    assert.ok(t.header.includes(`Chapter number and name: ${ch.number}. ${ch.name}`), ch.id);
    assert.deepEqual(Offline.suggestions(t, ch).map((s) => s.text), [], ch.id);
  }
});
