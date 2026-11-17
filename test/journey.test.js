// Walks the teacher journey through the shared actions, offline (no Claude key). Run: npm test
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { Engine, Store } from "../js/engine.js";
import { ContentGenerator } from "../js/generator.js";
import { Claude } from "../js/claude.js";
import { Source, spoken, splitLang, inLang, stripLang } from "../js/step.js";
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

  // J13: set up the week by an opening request (FR-102); a new class asks its language once (FR-109)
  const said = await e.fillDetails("schedule", 6, "Monday", 2, "magnets", null, Source.VOICE);
  assert.ok(said.startsWith("Class 6"), said);
  assert.equal(id(), "class_lang");
  await choose("Hindi", true); // CHANGE tier: read back first
  assert.equal(e.classLang(6), "Hindi");
  assert.equal(id(), "sched_more");
  await choose("done");
  assert.equal(id(), "sched_review");
  await choose("save", true);
  assert.equal(e.st.schedule.length, 1);
  assert.equal(id(), "home");

  // J15: Home says the scheduled lesson is not ready and offers Prepare it
  assert.ok(e.step.choices.some((c) => c.id === "prepare_next"));
  await choose("prepare_next");
  assert.equal(id(), "plan_confirm");
  await choose("yes"); // language already known: no second ask
  assert.equal(id(), "plan_tik_source"); // synced chapter TIK offered first (BR-11)
  assert.match(e.step.announce, /English only, not Hindi/); // FR-111: says which language it falls back to
  await choose("use_as_is");
  assert.equal(id(), "plan_tik_mode");
  await choose("topic");
  assert.equal(id(), "plan_need");
  assert.match(e.step.announce, /English only, not Hindi/); // FR-109: says the language before generating
  const r = await e.submitText("12 students, mixed levels, we have ring magnets", Source.BUTTON);
  assert.match(r, /in English, because without a Claude key/);
  assert.equal(id(), "tik_review");
  assert.equal(e.lesson().tikState, "DRAFT");
  assert.ok(e.step.banner);

  // COMMIT by voice needs the action's own word, never just "yes" (FR-98, BR-29)
  await e.choose("approve", Source.VOICE);
  assert.equal(await e.confirmPending(Source.VOICE, "yes"), "To confirm, say 'approve'. Or say 'cancel'.");
  await e.confirmPending(Source.VOICE, "approve");
  assert.equal(e.lesson().tikState, "APPROVED");

  assert.equal(id(), "qs_offer");
  await choose("prepare");
  assert.equal(id(), "qs_review");
  await choose("approve", true);
  assert.equal(id(), "audio_offer");
  await choose("prepare");
  assert.equal(id(), "audio_review");
  await choose("approve", true);
  assert.equal(id(), "lesson_saved");

  // FR-103: the same commit twice applies once
  // J3 teach
  await choose("open");
  await choose("start");
  assert.equal(id(), "teach_step");
  assert.ok(e.step.inClass);
  await choose("next");
  await choose("end", true);
  assert.equal(id(), "end_coverage");
  await choose("some");
  await choose("overview");
  await choose("time");
  assert.equal(id(), "lc_ask"); // learning check only for what was covered (AC-56.1)
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

  // F10: confirm the group, then prepare a simpler TIK through the normal approval gate
  await choose("followups");
  await choose(e.step.choices[0].id);
  assert.equal(id(), "followup_pattern");
  await choose("confirm", true);
  assert.equal(id(), "followup_type");
  await choose("tik");
  assert.equal(id(), "tik_review");
  assert.equal(e.lesson().tikState, "DRAFT");
  assert.ok(e.lesson().followUpFor);
});

test("a repeated commit applies once (FR-103)", async () => {
  await choose("no");
  await e.fillDetails("schedule", 9, "Friday", 1, "sound", null, Source.VOICE);
  await choose("English", true);
  await choose("done");
  // the same save arriving twice at once (double tap) applies once
  const [a, b] = await Promise.all([e.choose("save", Source.BUTTON, true), e.choose("save", Source.BUTTON, true)]);
  assert.match(a, /Schedule saved/);
  assert.doesNotMatch(b, /Schedule saved/);
  assert.equal(e.st.schedule.length, 1);
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
  const r = await e.fillDetails("plan", 8, null, null, null, null, Source.VOICE);
  assert.match(r, /not covered/);
  assert.equal(id(), "home");
});

test("opening request fills details and asks only what is missing", async () => {
  await choose("no");
  const r = await e.fillDetails("plan", 7, "Thursday", null, null, null, Source.VOICE);
  assert.ok(r.startsWith("Class 7, science, Thursday"), r);
  assert.equal(id(), "plan_chapter"); // nothing scheduled on Thursday, so it asks for the chapter
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
  assert.equal(o.day, "Thursday");
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
  await e.fillDetails("schedule", 6, "Monday", 2, "magnets", null, Source.VOICE);
  await choose("English", true);
  assert.equal(e.classLang(6), "English");
  e.rollback(cp);
  assert.equal(e.classLang(6), null);
  assert.equal(id(), "home");
  assert.equal(e.st.events[e.st.events.length - 1].action, "turn_cancelled"); // the log keeps what happened
});

test("spoken step reads options in a fixed order", async () => {
  await choose("no");
  await choose("plan");
  assert.match(spoken(e.step), /Say 1, Class 6; 2, Class 7; 3, Class 9\.$/);
  void Offline;
});
