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
const id = () => e.step.id;
const choose = async (c, confirm = false) => {
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
  assert.ok(e.lesson().questionSets.length && e.lesson().audio.length);
  assert.ok(!e.lesson().questionSets.some((q) => q.approved) && !e.lesson().audio.some((a) => a.approved));
  await choose("topic_tik");
  assert.equal(id(), "plan_need");
  assert.match(e.step.announce, /There is only English support./); // FR-109: says the language before generating
  const r = await e.submitText("12 students, mixed levels, we have ring magnets", Source.BUTTON);
  assert.match(r, /There is only English support./);
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
  assert.equal(id(), "audio_review");
  await choose("use"); // Content Studio audio is used as it is, never generated (8.3)
  assert.equal(id(), "lesson_saved");
  assert.equal(e.step.announce, "Lesson saved and ready to teach.");

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
  await choose("some");
  await choose("overview");
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
  const r = await e.fillDetails("plan", 7, null, null, Source.VOICE);
  // it offers where the class is up to in the textbook, as one yes-or-no question (8.1)
  assert.equal(id(), "plan_confirm");
  assert.match(r, /^Class 7, science\. Start with chapter 1, Nutrition in Plants, topic [^?]+\?$/);
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
  assert.equal(o.intent, "plan"); // a day is not a detail any more: there is no calendar (8.1)
});

test("back and what did you do", async () => {
  await choose("no");
  await choose("plan");
  await choose("c6");
  assert.equal(id(), "plan_chapter");
  e.command("back", Source.VOICE);
  assert.equal(id(), "plan_class");
  assert.match(e.command("what_did_you_do", Source.VOICE), /Class 6/);
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
  await choose("c6"); await choose("6-magnets"); await choose("6-magnets-2"); await choose("yes");
  await choose("English", true);
  assert.equal(spoken(e.step), "Ready. Please review your lesson. Shall we go through it now?");
  // a suggestion is offered first, and "yes" takes it
  e.fillDetails("next", null, null, null, Source.VOICE);
  await choose("c6"); await choose("other");
  assert.equal(spoken(e.step), "Which chapter? How about chapter 1, Exploring Magnets? It comes first in the textbook. Or tell me another one.");
  assert.deepEqual(match("yes", e.step, null), { type: "choose", choiceId: "6-magnets" });
  const help = e.command("help", Source.VOICE);
  assert.match(help, /You can say chapter 1, Exploring Magnets, chapter 2, /); // the full list only when asked
  for (const s of [spoken(e.step), help]) assert.doesNotMatch(s, /\b(say|press) \d|; \d, /i);
  // a read-back asks in plain words, and Home sounds like a colleague
  await choose("6-magnets"); await choose("6-magnets-1"); await choose("yes");
  await choose("tik");
  assert.match(await e.choose("use_as_is", Source.BUTTON), /Content Studio TIK/);
  e.goHome();
  assert.match(spoken(e.step), /^You have 2 lessons ready to teach\. /);
  void Offline;
});

test("Home offers to carry on a half-planned lesson", async () => {
  await choose("no");
  // Nutrition in Plants has no Content Studio TIK, so its TIK is a draft and the lesson is not ready yet
  await choose("plan"); await choose("c7"); await choose("7-nutrition"); await choose(e.step.choices[0].id); await choose("yes");
  await choose(e.step.choices.find((c) => /English/.test(c.label)).id, true);
  assert.equal(id(), "plan_review");
  assert.equal(e.lesson().tikState, "DRAFT");
  await e.goHome();
  assert.equal(id(), "home");
  assert.deepEqual(e.step.choices.map((c) => c.id), ["resume_plan", "plan", "awaiting", "menu"]);
  assert.match(e.step.announce, /You were planning Class 7 Science, Nutrition in Plants/);
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
  const syncedAudio = Curriculum.chapters.flatMap((c) => c.topics).filter((t) => t.syncedAudio).length;
  assert.equal(e.step.sections[0].lines[0], `${syncedTiks} TIKs, ${syncedAudio} audio, 0 quizzes`);
  assert.equal(e.step.sections[1].lines[0], "0 TIKs, 0 audio, 0 quizzes");
  assert.equal(e.step.choices.find((c) => c.id === "quizzes").enabled, false); // nothing to open yet

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

  // a TIK the teacher drafts shows up as theirs, not approved yet
  await choose("home"); await choose("plan"); await choose("c6"); await choose("6-magnets"); await choose("6-magnets-2"); await choose("yes");
  await choose(e.step.choices.find((c) => /English/.test(c.label)).id, true);
  await choose("topic_tik");
  await e.submitText("12 students", Source.BUTTON);
  await e.goTo(Flow.WORKSPACE, Source.BUTTON);
  assert.equal(e.step.sections[1].lines[0], "1 TIK, 0 audio, 0 quizzes"); // lesson audio is never made in the app (8.3)
  await choose("tiks");
  assert.ok(e.step.sections[1].lines.some((x) => /Poles of a magnet: topic TIK · Not approved yet/.test(x)));
});
