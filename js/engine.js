import { Curriculum, DemoAccounts, LANGS } from "./data.js";
import { Tier, Source, Flow, makeStep, choice, allChoices, spoken, optionsPhrase, inLang } from "./step.js";
import { TikTabs } from "./tiktabs.js";
import { DAYS } from "./matcher.js";
import * as Offline from "./offline.js";
import { buildStep, PLANNED_MINUTES } from "./steps.js";

export const emptyState = () => ({
  signedInPhone: null, rememberMe: true, voiceGuide: {}, speechRate: 1, bargeIn: false,
  classLang: {}, schedule: [], lessons: [], sessions: [], records: [], quizzes: [], patterns: [], events: [], committed: [],
});

/** The teacher's data. Kept in this browser only (localStorage); `storage` null keeps it in memory (tests). */
export class Store {
  constructor(storage = null, key = "seeds_state_v1") {
    this.storage = storage; this.key = key; this.state = emptyState();
    if (storage) {
      try { const raw = storage.getItem(key); if (raw) this.state = { ...emptyState(), ...JSON.parse(raw) }; } catch { /* unreadable: start fresh */ }
    }
  }
  update(f) {
    this.state = f(this.state);
    if (this.storage) { try { this.storage.setItem(this.key, JSON.stringify(this.state)); } catch { /* storage full or blocked: keep in memory */ } }
  }
}

/** Context the teacher has given so far. Shared by buttons and voice, so switching mode loses nothing (FR-94). */
class Draft {
  constructor() {
    this.classNum = null; this.chapterId = null; this.topicId = null; this.day = null; this.period = null;
    this.scheduleId = null; this.lessonId = null; this.editEntryId = null; this.proposed = null; this.pendingEntries = [];
    this.sessionId = null; this.recordId = null; this.quizId = null; this.patternId = null;
    this.changeCount = 0; this.tries = 0; this.checkpointFor = "tik"; this.lcQueue = []; this.lcIndex = 0;
    this.audioClipId = null; this.justSignedIn = false; this.langFor = null; this.langNext = null;
  }
  clearPlanning() {
    Object.assign(this, { classNum: null, chapterId: null, topicId: null, day: null, period: null, scheduleId: null, lessonId: null, changeCount: 0, tries: 0, audioClipId: null });
  }
  snapshot() { const d = new Draft(); Object.assign(d, this, { pendingEntries: [...this.pendingEntries], lcQueue: [...this.lcQueue] }); return d; }
  restore(o) { Object.assign(this, o, { pendingEntries: [...o.pendingEntries], lcQueue: [...o.lcQueue], justSignedIn: false }); }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = (v) => { const s = JSON.stringify(v) || ""; let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Layer 4 (shared, built first): one set of named actions that buttons and the agent both call, plus the
 * step description every screen publishes. Every action goes to one event log (FR-96, FR-97, FR-100).
 * `audio` plays approved lesson audio: { play(clip, onFinished, onFailed) -> bool, toggle, replay, stop, isPlaying, hasMedia }.
 */
export class Engine {
  constructor(store, gen, audio, clock = () => Date.now()) {
    this.store = store; this.gen = gen; this.audio = audio; this.clock = clock;
    this.draft = new Draft();
    this.route = { id: "home", page: 0 };
    this.backStack = [];
    this.step = null; this.pending = null; this.busy = null; this.undoPoint = null; this.tikTab = 0;
    this.lastAction = "Nothing yet.";
    this.lastError = "";
    this.inflight = new Set();
    this.listeners = new Set();
    this.refresh();
  }

  // ------------------------------------------------------------------ helpers
  get st() { return this.store.state; }
  get teacher() { return DemoAccounts.byPhone(this.st.signedInPhone); }
  get voiceGuideOn() { const p = this.st.signedInPhone; return !!(p && this.st.voiceGuide[p]); }
  get canGoBack() { return this.backStack.length > 0; }

  /** fn(source) runs after every change; source is null for a plain refresh. */
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(source = null) { this.listeners.forEach((f) => f(source)); }
  notify(source) { this.emit(source); }

  now() { return this.clock(); }
  newId() { return Math.random().toString(36).slice(2, 10); }
  lesson(id = this.draft.lessonId) { return this.st.lessons.find((l) => l.id === id) || null; }
  chapterOf(l) { return l ? Curriculum.chapter(l.chapterId) : null; }
  topicOf(l) { return l ? Curriculum.topic(l.topicId) : null; }
  session(id = this.draft.sessionId) { return this.st.sessions.find((s) => s.id === id) || null; }
  activeSession() { return [...this.st.sessions].reverse().find((s) => s.endedAt == null) || null; }
  taught(l) { return this.st.sessions.some((s) => s.lessonId === l.id && s.endedAt != null); }
  ready(l) { return !!l && (l.tikState === "SYNCED_IN_USE" || l.tikState === "APPROVED"); }
  approvedAudio(l) { return l ? l.audio.filter((a) => a.approved) : []; }
  lessonName(l) {
    if (!l) return "this lesson";
    const ch = this.chapterOf(l), tp = this.topicOf(l);
    return `Class ${l.classNum} ${l.subject}, ${ch && ch.name}: ${tp && tp.name}` + (l.followUpFor ? " (follow-up)" : "");
  }
  /** The class's language (FR-109); null until the teacher has said it. */
  classLang(c) { return c != null ? this.st.classLang[String(c)] || null : null; }

  updateLesson(id, f) { this.store.update((s) => ({ ...s, lessons: s.lessons.map((l) => (l.id === id ? f(l) : l)) })); }
  updateSession(id, f) { this.store.update((s) => ({ ...s, sessions: s.sessions.map((x) => (x.id === id ? f(x) : x)) })); }
  updateRecord(id, f) { this.store.update((s) => ({ ...s, records: s.records.map((x) => (x.id === id ? f(x) : x)) })); }
  updateQuiz(id, f) { this.store.update((s) => ({ ...s, quizzes: s.quizzes.map((x) => (x.id === id ? f(x) : x)) })); }
  updatePattern(id, f) { this.store.update((s) => ({ ...s, patterns: s.patterns.map((x) => (x.id === id ? f(x) : x)) })); }

  log(action, choiceId, source, detail = null) {
    const e = { ts: this.now(), action, stepId: this.route.id, choice: choiceId, source, detail };
    this.store.update((s) => ({ ...s, events: [...s.events, e].slice(-500) }));
  }

  fmtDate(ts) { const d = new Date(ts); return `${d.getDate()} ${MONTHS[d.getMonth()]}`; }

  go(id, page = 0, push = true) {
    const next = { id, page };
    if (push && !same(next, this.route)) this.backStack.push(this.route);
    while (this.backStack.length > 40) this.backStack.shift();
    if (next.id !== this.route.id) this.tikTab = 0; // a TIK always opens on its Summary tab
    this.route = next;
    this.pending = null;
    this.refresh();
  }

  refresh() {
    try { this.step = buildStep(this); }
    catch (e) { this.step = makeStep("error", Flow.HOME, "Something went wrong", "Go back to Home?", [choice("home", "Back to Home")], { announce: String(e && e.message) }); }
    this.emit(null);
  }

  /** Run a generation with a busy state. Nothing is applied unless it completes (FR-99, AC-5.3). */
  async working(label, fn) {
    this.busy = label; this.emit(null);
    try { return await fn(); }
    catch (e) { this.lastError = String((e && e.message) || e); return null; }
    finally { this.busy = null; this.emit(null); }
  }
  failed(what) { return `I couldn't ${what}. ${this.plainError(this.lastError)} Your inputs are kept. Try again when you're ready.`; }
  plainError(e) {
    if (/fetch|network|connect|timeout|load/i.test(e)) return "The connection is weak or off.";
    if (/401|authentication|not accepted/i.test(e)) return "The Claude key is not accepted.";
    return `Reason: ${e.slice(0, 120)}.`;
  }

  /** What a draft's language means for the teacher: said whenever it differs from the class language (FR-109, FR-111). */
  langNote(classNum, actual, synced = false) {
    const want = this.classLang(classNum);
    if (!want || !actual || want === actual) return "";
    return actual === "English" ? " There is only English support." : ` It is in ${actual}.`;
  }
  /** Said before generating (FR-109): which language the draft will be in. */
  prepLine(classNum) {
    const want = this.classLang(classNum);
    if (!want || want === "English") return null;
    return this.gen.online ? `I'll prepare it in ${want}.` : "There is only English support.";
  }

  // ------------------------------------------------------------------ account (F1)

  signIn(phone, password, remember) {
    const t = DemoAccounts.teachers.find((x) => x.phone === String(phone).replace(/\D/g, "") && x.password === password);
    if (!t) return "That phone number and password do not match. Check them, or ask your school admin to reset your password.";
    this.store.update((s) => ({ ...s, signedInPhone: t.phone, rememberMe: !!remember }));
    this.draft.clearPlanning();
    this.draft.justSignedIn = true;
    this.backStack = [];
    this.undoPoint = null;
    this.route = { id: this.st.voiceGuide[t.phone] == null ? "voice_pref" : "home", page: 0 };
    this.refresh();
    this.notify(Source.BUTTON);
    return null;
  }

  signOut() {
    this.audio.stop();
    this.store.update((s) => ({ ...s, signedInPhone: null }));
    this.draft = new Draft();
    this.backStack = [];
    this.undoPoint = null;
    this.pending = null;
    this.route = { id: "home", page: 0 };
    this.refresh();
  }

  setVoiceGuide(on) {
    const p = this.st.signedInPhone;
    if (!p) return;
    this.store.update((s) => ({ ...s, voiceGuide: { ...s.voiceGuide, [p]: on } }));
    this.refresh();
  }
  setPref(key, value) { this.store.update((s) => ({ ...s, [key]: value })); this.refresh(); }
  setClassLang(c, lang) { this.store.update((s) => ({ ...s, classLang: { ...s.classLang, [String(c)]: lang } })); this.refresh(); }

  // ------------------------------------------------------------------ actions

  /**
   * The single entry point for every option, from a button tap or the agent (FR-96).
   * CHANGE and COMMIT read back first and wait for confirmation (FR-57, FR-98).
   */
  async choose(choiceId, source, confirmed = false) {
    const s = this.step;
    const c = allChoices(s).find((x) => x.id === choiceId);
    if (!c) return `That option is not available here. ${s.question}`;
    if (!c.enabled) return c.whyDisabled || "That is not available right now.";
    const risky = c.tier === Tier.CHANGE || c.tier === Tier.COMMIT;
    if (risky && !confirmed) {
      this.pending = { choice: c, stepId: s.id };
      this.emit(null);
      // FR-98: a commit still needs its own word, asked for in plain words rather than a menu prompt
      return (c.readBack || `${c.label}.`) + (c.tier === Tier.COMMIT ? ` If that's right, just say "${(c.commitWord || c.label).toLowerCase()}".` : " Shall I go ahead?");
    }
    // FR-103: a Change or Commit runs at most once per request
    const key = risky ? this.commitKey(s, c) : null;
    if (key && (this.st.committed.includes(key) || this.inflight.has(key))) { this.pending = null; this.emit(null); return "That is already done."; }
    this.pending = null;
    const before = this.snapshot(c.label);
    this.log("choose", c.id, source, c.label);
    if (key) this.inflight.add(key);
    let said;
    try { said = await this.handle(s.id, c.id, source); } finally { if (key) this.inflight.delete(key); }
    if (key) this.store.update((x) => ({ ...x, committed: [...x.committed, key].slice(-300) }));
    this.offerUndo(before, c.tier);
    this.lastAction = said ? `I chose ${c.label}. ${said.split(". ")[0].replace(/\.$/, "")}.` : `I chose ${c.label}.`;
    this.refresh();
    this.notify(source);
    return said;
  }

  /** Confirm a pending read-back. For voice, a COMMIT only accepts the action's own word (BR-29, FR-98). */
  async confirmPending(source, utterance = null) {
    const p = this.pending;
    if (!p) return "There is nothing waiting for confirmation.";
    if (source === Source.VOICE && p.choice.tier === Tier.COMMIT) {
      const word = (p.choice.commitWord || p.choice.label).toLowerCase();
      const u = (utterance || "").toLowerCase();
      if (!u.includes(word) && !word.split(" ").every((w) => w.length > 2 && u.includes(w))) return `For this one I need you to say "${word}". Or say cancel to leave it.`;
    }
    return this.choose(p.choice.id, source, true);
  }

  cancelPending() {
    const had = !!this.pending;
    this.pending = null;
    this.emit(null);
    return had ? "Okay, I've left it as it was." : "";
  }

  /** Free speech or typed text for steps that allow it (FR-54). */
  async submitText(text, source) {
    const s = this.step;
    if (!s.freeSpeech || !text || !text.trim()) return `I can't take free text here. ${s.question}`;
    const before = this.snapshot("your change");
    this.log("text", null, source, text.slice(0, 200));
    const said = await this.handleText(s.id, text.trim());
    this.offerUndo(before, Tier.CHANGE);
    this.refresh();
    this.notify(source);
    return said;
  }

  /** Commands that work at every step (FR-55). */
  command(name, source) {
    const s = this.step;
    this.log("command", name, source);
    switch (name) {
      case "repeat": return spoken(s, true);
      case "back": return this.back(source);
      case "where_am_i": return `You are in ${s.flow.label}: ${s.title}. ${s.question}`;
      case "what_did_you_do": return this.lastAction;
      case "help": return (s.help ? s.help + " " : "") + optionsPhrase(s, true) +
        " Any time, you can also say repeat, back, where am I, what did you just do, home, or stop." +
        (s.flow === Flow.TEACH ? " For the classroom speaker, connect it before class and set the volume high." : "");
      case "home": this.goHome(); this.notify(source); return "Home. " + spoken(this.step);
      case "voice_off": this.setVoiceGuide(false); return "Voice guide is off. Press the voice button when you need me.";
      case "voice_on": this.setVoiceGuide(true); return "Voice guide is on.";
      case "why": {
        if (!s.suggestion) return "There is no suggestion at this step.";
        const c = allChoices(s).find((x) => x.id === s.suggestion.choiceId);
        return `I suggested ${c ? c.label : s.suggestion.choiceId} ${s.suggestion.reason}.`;
      }
      case "undo": return this.undo(source);
      case "next_tab": return s.tik ? this.selectTab(this.tikTab + 1) : "There are no tabs here.";
      case "prev_tab": return s.tik ? this.selectTab(this.tikTab - 1) : "There are no tabs here.";
      case "sign_out": this.signOut(); this.notify(source); return "Signed out.";
      default:
        if (name.startsWith("tab:") && s.tik) return this.selectTab(parseInt(name.slice(4), 10) || 0);
        return "";
    }
  }

  /** Open a TIK tab; returns what the agent says (the tab's name and content). Wraps around at the ends. */
  selectTab(i) {
    const p = this.step.tik;
    if (!p) return "";
    const n = TikTabs.titles.length;
    this.tikTab = ((i % n) + n) % n;
    this.emit(null);
    return TikTabs.spokenTab(p, this.tikTab);
  }

  snapshot(label) { return { state: this.st, route: this.route, back: [...this.backStack], draft: this.draft.snapshot(), label, inClass: !!(this.step && this.step.inClass) }; }

  /** Keep an undo point when an action changed saved data, except Commits, which have no undo (FR-98). */
  offerUndo(before, tier) {
    const changed = !same({ ...before.state, events: [] }, { ...this.st, events: [] });
    // in class only the teaching record moves on (methods used, step reached): nothing there to undo
    if (tier === Tier.COMMIT || (before.inClass && tier === Tier.MOVE)) this.undoPoint = null;
    else if (tier === Tier.READ) { /* listening to something is not a change to undo */ }
    else this.undoPoint = changed ? before : null;
  }

  /** "Undo that": put back the data, the screen and the context from before the last change. */
  undo(source) {
    const u = this.undoPoint;
    if (!u) return "There is nothing to undo.";
    this.audio.stop();
    this.store.update((now) => ({ ...u.state, events: now.events })); // the event log keeps every action, including this undo
    this.route = u.route;
    this.backStack = [...u.back];
    this.draft.restore(u.draft);
    this.undoPoint = null;
    this.pending = null;
    this.log("undo", null, source, u.label);
    this.lastAction = `I undid ${u.label}.`;
    this.refresh();
    this.notify(source);
    return `Undone: ${u.label}. ` + spoken(this.step);
  }

  /** Everything needed to put the app back exactly, for cancelling an agent turn (FR-99). */
  checkpoint() { return { ...this.snapshot("cancelled turn"), undoPoint: this.undoPoint, tikTab: this.tikTab, lastAction: this.lastAction }; }
  rollback(cp) {
    this.audio.stop();
    this.store.update((now) => ({ ...cp.state, events: now.events }));
    this.route = cp.route; this.backStack = [...cp.back]; this.draft.restore(cp.draft);
    this.undoPoint = cp.undoPoint; this.tikTab = cp.tikTab; this.lastAction = cp.lastAction; this.pending = null;
    this.log("turn_cancelled", null, Source.VOICE);
    this.refresh();
  }

  /** "Thursday", "thu", "today", "tomorrow" -> a school day name. Sunday rolls on to Monday. */
  dayName(d) {
    const t = String(d).trim().toLowerCase();
    const offset = t === "today" ? 0 : t === "tomorrow" ? 1 : null;
    if (offset != null) {
      const idx = (new Date(this.now()).getDay() + 6 + offset) % 7; // Monday = 0 ... Sunday = 6
      return DAYS[idx] || DAYS[0];
    }
    return DAYS.find((x) => x.toLowerCase() === t || (t.length >= 3 && x.slice(0, 3).toLowerCase() === t.slice(0, 3))) || null;
  }

  back(source) {
    const prev = this.backStack.pop();
    if (!prev) return "This is the first step. " + this.step.question;
    this.route = prev;
    this.pending = null;
    this.refresh();
    this.notify(source);
    return "Back. " + spoken(this.step);
  }

  goHome() {
    this.audio.stop();
    this.backStack = [];
    this.route = { id: "home", page: 0 };
    this.pending = null;
    this.refresh();
  }

  /** Saying a feature flow's name goes there and keeps any unfinished draft (AC-48.4). */
  async goTo(flow, source) {
    this.log("go_to", flow.key, source);
    switch (flow.key) {
      case "SCHEDULE": this.go(this.st.schedule.length ? "sched_view" : "sched_class"); break;
      case "PLAN": {
        const l = this.lesson();
        if (l && !this.taught(l) && !this.planningDone(l)) this.go(this.nextPlanningStep(l));
        else { this.draft.clearPlanning(); this.go("plan_class"); }
        break;
      }
      case "TEACH": {
        const a = this.activeSession();
        if (a) { this.draft.sessionId = a.id; this.draft.lessonId = a.lessonId; this.go("teach_step"); } else this.go("teach_pick");
        break;
      }
      case "QUIZ": this.go("quiz_pick"); break;
      case "FOLLOWUP": this.go("followups"); break;
      default: this.goHome();
    }
    this.notify(source);
    return `${flow.label}. ` + spoken(this.step);
  }

  /**
   * Opening request (FR-102): fill each detail caught, read them back in one sentence, and go to the first
   * step still missing a detail. It only fills details and moves; nothing changes or commits here.
   */
  async fillDetails(intent, classNum, day, period, chapter, topic, source) {
    if (classNum != null && !Curriculum.coveredClasses.includes(classNum)) return `Class ${classNum} is not covered yet. SEEDS covers classes 6, 7 and 9 for now.`;
    this.log("fill_details", intent, source, [classNum, day, period, chapter, topic].filter((x) => x != null).join(","));
    const d = this.draft;
    const caught = [], notes = [];
    const dayNorm = day ? this.dayName(day) : null;
    switch ((intent || "").toLowerCase()) {
      case "next":
        // "What should I teach next?" (J21, FR-106)
        d.clearPlanning();
        if (classNum != null) { d.classNum = classNum; caught.push(`class ${classNum}`, "science"); this.goWithLang(classNum, "next_chapter"); }
        else this.go("next_class");
        break;
      case "schedule": {
        d.editEntryId = null;
        if (classNum != null) { d.classNum = classNum; caught.push(`class ${classNum}`, "science"); }
        if (dayNorm) { d.day = dayNorm; caught.push(dayNorm); }
        if (period != null && period >= 1 && period <= 8) { d.period = period; caught.push(`period ${period}`); }
        if (chapter) {
          const ch = Curriculum.findChapter(d.classNum, chapter);
          if (ch && (d.classNum == null || ch.classNum === d.classNum)) { d.chapterId = ch.id; d.classNum = ch.classNum; caught.push(ch.name); }
          else notes.push(`I didn't find a chapter called ${chapter}.`);
        }
        let next;
        if (d.classNum == null) next = "sched_class";
        else if (!d.day) next = "sched_day";
        else if (d.period == null) next = "sched_period";
        else if (!d.chapterId) next = "sched_chapter";
        else { this.addPendingEntry(); next = "sched_more"; }
        if (d.classNum != null || next === "sched_more") this.goWithLang(d.classNum ?? d.pendingEntries[d.pendingEntries.length - 1].classNum, next);
        else this.go(next);
        break;
      }
      case "teach": {
        const ready = this.st.lessons.filter((l) => this.ready(l) && !this.taught(l) && (classNum == null || l.classNum === classNum));
        if (ready.length) { const l = ready[ready.length - 1]; d.lessonId = l.id; this.go("teach_start"); caught.push(this.lessonName(l)); }
        else { notes.push(`No lesson is ready to teach${classNum != null ? ` for class ${classNum}` : ""}.`); this.go("home"); }
        break;
      }
      case "quiz": this.go("quiz_pick"); break;
      default: {
        d.lessonId = null;
        if (classNum != null) { d.classNum = classNum; caught.push(`class ${classNum}`, "science"); }
        if (dayNorm) {
          caught.push(dayNorm);
          const e = this.st.schedule.find((x) => x.day === dayNorm && (d.classNum == null || x.classNum === d.classNum));
          if (e) { d.scheduleId = e.id; d.classNum = e.classNum; d.chapterId = e.chapterId; }
          else notes.push(`There's nothing on your schedule for ${dayNorm}, so I'll ask for the chapter.`);
        }
        if (chapter) {
          const ch = Curriculum.findChapter(d.classNum, chapter);
          if (ch) { d.chapterId = ch.id; d.classNum = ch.classNum; } else notes.push(`I didn't find a chapter called ${chapter}.`);
        }
        const chx = Curriculum.chapter(d.chapterId);
        if (chx && !caught.includes(chx.name)) caught.push(`chapter ${chx.number}, ${chx.name}`);
        if (topic) {
          const tp = Curriculum.findTopic(chx, topic);
          if (tp) { d.topicId = tp.id; d.chapterId = Curriculum.chapterOfTopic(tp.id).id; caught.push(tp.name); }
          else notes.push(`I didn't find a topic called ${topic}.`);
        }
        if (d.chapterId && !d.topicId) { const nt = this.nextTopic(Curriculum.chapter(d.chapterId)); d.topicId = nt && nt.id; }
        if (d.classNum == null) this.go("plan_class");
        else if (!d.chapterId) this.go("plan_chapter");
        else if (!d.topicId) this.go("plan_topic");
        else this.go("plan_confirm");
      }
    }
    this.notify(source);
    const head = caught.length ? cap(caught.join(", ")) + ". " : "";
    return head + notes.join(" ") + (notes.length ? " " : "") + spoken(this.step);
  }

  /** Go to `next`, asking first for the class's language if it is not known yet (FR-109). */
  goWithLang(classNum, next) {
    if (classNum != null && !this.classLang(classNum)) { this.draft.langFor = classNum; this.draft.langNext = next; this.go("class_lang"); }
    else this.go(next);
  }

  /** Called by the player when lesson audio ends or fails. */
  onAudioFinished() { if (this.route.id === "audio_player") { this.go("audio_finished"); this.notify(Source.SYSTEM); } else this.refresh(); }
  onAudioFailed() {
    this.log("audio_playback_failed", null, Source.SYSTEM);
    if (this.route.id === "audio_player") { this.go("audio_failed"); this.notify(Source.SYSTEM); } else this.refresh();
  }

  // ------------------------------------------------------------------ journey logic

  nextTopic(ch) {
    const done = new Set(this.st.sessions.filter((s) => s.endedAt != null && s.coverage === "all").map((s) => { const l = this.lesson(s.lessonId); return l && l.topicId; }));
    return ch.topics.find((t) => !done.has(t.id)) || ch.topics[0] || null;
  }

  /** FR-106: next chapter is the one after the last taught; otherwise the first in contents order. */
  nextChapter(classNum, after = null) {
    const list = Curriculum.forClass(classNum);
    let ref = after;
    if (!ref) {
      const taughtLessons = this.st.sessions.filter((s) => s.endedAt != null).map((s) => this.lesson(s.lessonId)).filter((l) => l && l.classNum === classNum);
      ref = taughtLessons.length ? taughtLessons[taughtLessons.length - 1].chapterId : null;
    }
    if (!ref) return list[0] || null;
    const ch = Curriculum.chapter(ref);
    if (!ch) return list[0] || null;
    // Uncovered topics carry forward (J4): stay on the chapter until all topics are covered
    const allCovered = ch.topics.every((t) => this.st.sessions.some((s) => { const l = this.lesson(s.lessonId); return s.endedAt != null && s.coverage === "all" && l && l.topicId === t.id; }));
    if (!after && !allCovered) return ch;
    const i = list.findIndex((x) => x.id === ref);
    return list[i + 1] || list[list.length - 1] || null;
  }

  sortedSchedule() { return [...this.st.schedule].sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.period - b.period); }

  /** The next scheduled lesson from now (FR-62): [entry, lesson or null]. */
  nextScheduled() {
    if (!this.st.schedule.length) return null;
    const now = new Date(this.now());
    const today = (now.getDay() + 6) % 7; // Monday = 0
    const curPeriod = Math.min(9, Math.max(0, now.getHours() - 8));
    const sorted = this.sortedSchedule();
    const entry = sorted.find((e) => { const d = DAYS.indexOf(e.day); return d > today || (d === today && e.period >= curPeriod); }) || sorted[0];
    return [entry, this.lessonForEntry(entry)];
  }

  lessonForEntry(e) {
    const ls = [...this.st.lessons].reverse();
    return ls.find((l) => l.scheduleId === e.id && !this.taught(l)) ||
      ls.find((l) => l.classNum === e.classNum && l.chapterId === e.chapterId && !this.taught(l) && !l.followUpFor) || null;
  }

  previousContext(ch, tp) {
    const s = [...this.st.sessions].reverse().find((x) => { const l = this.lesson(x.lessonId); return x.endedAt != null && x.coverage === "some" && l && l.chapterId === ch.id && l.topicId === tp.id; });
    if (!s) return null;
    const rec = [...this.st.records].reverse().find((r) => r.sessionId === s.id && r.saved);
    return `Last taught on ${this.fmtDate(s.startedAt)}. Some covered: ${this.coveredText(s)}. Reason: ${s.reason || "not given"}.` + (rec && rec.summary ? ` Class record: ${rec.summary}` : "");
  }

  coveredText(s) {
    const t = s.covered.map((k) => (k === "overview" ? "the overview" : k === "topic-part" ? "part of the topic" : (Curriculum.topic(k) || {}).name || k)).join(", ");
    return t || "nothing from the plan";
  }

  planningDone(l) { return this.nextPlanningStep(l) === "lesson_saved"; }
  /** The latest lesson still being planned (not ready, not taught), so Home can offer to carry on with it. */
  unfinishedLesson() { return [...this.st.lessons].reverse().find((l) => !this.taught(l) && !this.ready(l) && !this.planningDone(l)) || null; }

  nextPlanningStep(l) {
    if (!l.tik) return "plan_tik_source";
    if (l.tikState === "DRAFT") return "tik_review";
    if (!l.modeChosen) return "plan_tik_mode";
    if (!l.questionSets.length && !l.questionsSkipped) return "qs_offer";
    if (l.questionSets.some((q) => !q.approved)) return "qs_review";
    if (!l.audio.length && !l.tikOnly) return "audio_offer";
    if (l.audio.length && !l.audio.some((a) => a.approved)) return "audio_review";
    return "lesson_saved";
  }

  workspaceChapterTik(ch) { return [...this.st.lessons].reverse().find((l) => l.chapterId === ch.id && this.ready(l) && l.tik && l.tik.scope === "chapter") || null; }

  commitKey(s, c) {
    const d = this.draft;
    let ctx;
    if (s.flow === Flow.QUIZ) ctx = d.quizId;
    else if (s.flow === Flow.FOLLOWUP) ctx = d.recordId || d.patternId;
    else if (s.flow === Flow.SCHEDULE) ctx = `${this.st.schedule.length}${d.pendingEntries.length}${hash(d.proposed)}`;
    else if (s.id === "class_lang") ctx = `${d.langFor}`;
    else { const l = this.lesson(); ctx = `${d.lessonId}:${l ? hash([l.tik, l.questionSets, l.audio]) : 0}`; }
    return `${s.id}:${c.id}:${ctx}`;
  }

  addPendingEntry() {
    const d = this.draft;
    if (d.classNum == null || !d.day || d.period == null || !d.chapterId) return;
    d.pendingEntries.push({ id: this.newId(), classNum: d.classNum, subject: Curriculum.SUBJECT, day: d.day, period: d.period, chapterId: d.chapterId });
    d.day = null; d.period = null; d.chapterId = null;
  }

  entryText(e) { return `${e.day} period ${e.period}: Class ${e.classNum} ${e.subject}, ${(Curriculum.chapter(e.chapterId) || {}).name}`; }

  startPlanningFor(e) {
    const d = this.draft;
    d.clearPlanning();
    d.classNum = e.classNum; d.chapterId = e.chapterId; d.scheduleId = e.id;
    const nt = this.nextTopic(Curriculum.chapter(e.chapterId)); d.topicId = nt && nt.id;
    this.go("plan_confirm");
  }

  ensureLessonForDraft() {
    const d = this.draft;
    const ch = Curriculum.chapter(d.chapterId), tp = Curriculum.topic(d.topicId);
    const existing = [...this.st.lessons].reverse().find((l) => l.chapterId === ch.id && l.topicId === tp.id && !this.taught(l) && !l.followUpFor);
    if (existing) {
      if (d.scheduleId && !existing.scheduleId) this.updateLesson(existing.id, (l) => ({ ...l, scheduleId: d.scheduleId }));
      d.lessonId = existing.id;
      return this.lesson();
    }
    let l = { id: this.newId(), classNum: ch.classNum, subject: ch.subject, chapterId: ch.id, topicId: tp.id, scheduleId: d.scheduleId,
      tik: null, tikState: "NONE", tikBefore: null, usePreviousContext: false, questionSets: [], questionsSkipped: false,
      audio: [], tikOnly: false, modeChosen: false, followUpFor: null, createdAt: this.now() };
    // Reuse before generate (BR-11): a ready chapter TIK already in the workspace
    const w = this.workspaceChapterTik(ch);
    if (w) l = { ...l, tik: w.tik, tikState: w.tikState };
    this.store.update((s) => ({ ...s, lessons: [...s.lessons, l] }));
    d.lessonId = l.id;
    return l;
  }

  /** After the lesson details are confirmed (and the class language is known): open planning. */
  continuePlan() {
    const chx = Curriculum.chapter(this.draft.chapterId), tpx = Curriculum.topic(this.draft.topicId);
    const nl = this.ensureLessonForDraft();
    if (this.previousContext(chx, tpx) && !nl.tik) { this.go("plan_previous"); return ""; }
    this.go(this.nextPlanningStep(nl));
    return "";
  }

  async makeClip(l, variant, name, synced) {
    const ch = this.chapterOf(l), tp = this.topicOf(l);
    const lang = this.classLang(l.classNum);
    const script = synced
      ? `Synced audio for ${tp.name}. ` + tp.definitions.join(" ") + " Think of where you have noticed this at home. Then let us talk about it together."
      : await this.gen.audioScript(ch, tp, variant, lang);
    const words = script.split(/\s+/).length;
    return { id: this.newId(), name, provenance: synced ? "Synced from Content Studio" : "Generated for this lesson", script,
      lang: synced ? "English" : this.gen.draftLang(lang), approved: false, reviewed: false, durationSec: Math.round(words / 2.3) };
  }

  proposePatterns(lessonId, sessionId) {
    const l = this.lesson(lessonId), tp = this.topicOf(l);
    if (!tp) return;
    const signals = [];
    let group = 0;
    const s = this.st.sessions.find((x) => x.id === sessionId);
    const r = s && s.checkResults[tp.id];
    if (r === "few" || r === "none") { signals.push(`Learning check: ${r} of the class understood`); group = Math.max(group, 6); }
    const rec = [...this.st.records].reverse().find((x) => x.sessionId === sessionId && x.saved);
    const note = rec && rec.notes.find((n) => /difficult/i.test(n));
    if (note) { signals.push(`You noted: "${note.slice(0, 80)}"`); group = Math.max(group, 4); }
    const q = [...this.st.quizzes].reverse().find((x) => x.lessonId === lessonId && x.state === "Closed" && x.belowThreshold > 0);
    if (q) { signals.push(`${q.belowThreshold} of ${q.responses} students scored below 35% in the quiz`); group = Math.max(group, q.belowThreshold); }
    if (!signals.length) return;
    const existing = this.st.patterns.find((p) => p.lessonId === lessonId && (p.state === "Proposed" || p.state === "Confirmed"));
    if (existing) this.updatePattern(existing.id, (p) => ({ ...p, signals: [...new Set([...p.signals, ...signals])], groupSize: Math.max(p.groupSize, group) }));
    else this.store.update((x) => ({ ...x, patterns: [...x.patterns, { id: this.newId(), lessonId, concept: tp.name, signals, groupSize: group, classSize: 12, state: "Proposed", followUp: null }] }));
  }

  finishSession() {
    const s = this.session();
    if (!s) return "";
    const l = this.lesson(s.lessonId);
    this.updateSession(s.id, (x) => ({ ...x, endedAt: this.now() }));
    const ended = this.session();
    const facts = [`Lesson: ${this.lessonName(l)}.`, `TIK: ${(l && l.tik && l.tik.provenance) || "none"}.`,
      `Audio used: ${ended.methods.includes("audio") ? "yes" : "no"}.`,
      `Method: ${[...new Set(ended.methods.length ? ended.methods : ["teacher-led"])].join(", ")}.`,
      ended.coverage === "all" ? "Coverage: all planned topics covered." : `Coverage: some covered (${this.coveredText(ended)}). Reason: ${ended.reason || "not given"}.`];
    if (ended.extensionUsed) facts.push("Extension activity used.");
    Object.entries(ended.checkResults).forEach(([k, v]) => facts.push(`Learning check, ${k === "overview" ? "overview" : (Curriculum.topic(k) || {}).name || k}: ${v}.`));
    const q = [...this.st.quizzes].reverse().find((x) => x.lessonId === s.lessonId && x.state === "Closed");
    if (q) facts.push(`Quiz: ${q.responses} responses, ${q.belowThreshold} below 35%.`);
    const rec = { id: this.newId(), sessionId: s.id, lessonId: s.lessonId, createdAt: this.now(), prefilled: facts, notes: [], summary: "", previewed: false, saved: false };
    this.store.update((x) => ({ ...x, records: [...x.records, rec] }));
    this.draft.recordId = rec.id;
    this.go("record_draft");
    return "Class ended. I've drafted your class record from the session.";
  }

  startLearningCheck() {
    const s = this.session();
    if (!s) return this.finishSession();
    const l = this.lesson(s.lessonId);
    const keys = s.covered.filter((k) => l && l.questionSets.some((q) => q.key === k && q.approved));
    this.draft.lcQueue = keys; this.draft.lcIndex = 0;
    if (!keys.length) return this.finishSession();
    this.go("lc_ask");
    return "Learning check.";
  }

  focusClip(l) { return l.audio.find((a) => a.id === this.draft.audioClipId) || l.audio.find((a) => !a.approved) || l.audio[l.audio.length - 1] || null; }

  nextChapterForSchedule() {
    const d = this.draft;
    if (d.classNum == null) return null;
    const last = [...d.pendingEntries].reverse().find((e) => e.classNum === d.classNum);
    return last ? this.nextChapter(d.classNum, last.chapterId) : this.nextChapter(d.classNum);
  }

  proposeEdit(f) {
    const e = this.st.schedule.find((x) => x.id === this.draft.editEntryId);
    if (!e) return "That entry is gone.";
    this.draft.proposed = f(e);
    this.go("sched_change_confirm");
    return "";
  }

  simulatedResponses(q) {
    if (!q.openedAt) return 0;
    const mins = Math.floor((this.now() - q.openedAt) / 60000);
    return Math.min(3 + mins * 2, q.classSize - 1);
  }

  // ------------------------------------------------------------------ handlers (one per step)

  async handle(stepId, c, source) {
    const d = this.draft;
    // generic paging
    if (c === "__more") { this.go(this.route.id, this.route.page + 1, false); return ""; }
    if (c === "__first") { this.go(this.route.id, 0, false); return ""; }
    if (c === "home") { this.goHome(); return ""; }
    const l = this.lesson(), ch = this.chapterOf(l), tp = this.topicOf(l);

    switch (stepId) {
      case "voice_pref":
        this.setVoiceGuide(c === "yes");
        this.goHome();
        return c === "yes" ? "Voice guide is on. You can turn it off any time by saying 'turn off voice guide'."
          : "Voice guide is off. Press the voice button when you want me.";

      case "home": case "menu":
        switch (c) {
          case "continue": { const a = this.activeSession(); if (a) { d.sessionId = a.id; d.lessonId = a.lessonId; } this.go("teach_step"); return "Continuing your class."; }
          case "start_next": { const n = this.nextScheduled(); if (n && n[1]) d.lessonId = n[1].id; this.go("teach_start"); break; }
          case "prepare_next": { const n = this.nextScheduled(); if (n) this.startPlanningFor(n[0]); break; }
          case "setup_week": d.pendingEntries = []; this.go("sched_class"); return "Your schedule tells the app which class, chapter and topic comes next, so you don't have to say them each time.";
          case "schedule": this.go(this.st.schedule.length ? "sched_view" : "sched_class"); break;
          case "plan": d.clearPlanning(); this.go("plan_class"); break;
          case "resume_plan": { const l = this.unfinishedLesson(); if (l) { d.clearPlanning(); d.lessonId = l.id; this.go(this.nextPlanningStep(l)); } break; }
          case "next_topic": this.go("next_class"); break;
          case "teach_pick": this.go("teach_pick"); break;
          case "awaiting": this.go("awaiting"); break;
          case "quiz": this.go("quiz_pick"); break;
          case "followups": this.go("followups"); break;
          case "menu": this.go("menu"); break;
        }
        break;

      case "awaiting": {
        const [kind, id] = [c.split(":")[0], c.split(":").slice(1).join(":")];
        if (kind === "l") { d.lessonId = id; const lx = this.lesson(); if (lx) this.go(this.nextPlanningStep(lx)); }
        if (kind === "q") { d.quizId = id; d.lessonId = (this.st.quizzes.find((q) => q.id === id) || {}).lessonId; this.go("quiz_review"); }
        if (kind === "r") { d.recordId = id; this.go("record_draft"); }
        if (kind === "p") { d.patternId = id; d.lessonId = (this.st.patterns.find((p) => p.id === id) || {}).lessonId; this.go("followup_pattern"); }
        break;
      }
      case "teach_pick":
        if (c.startsWith("l:")) { d.lessonId = c.slice(2); this.go("teach_start"); } else if (c === "plan") { d.clearPlanning(); this.go("plan_class"); }
        break;
      case "next_class": { const n = parseInt(c.slice(1), 10); d.clearPlanning(); d.classNum = n; this.goWithLang(n, "next_chapter"); break; }
      case "next_chapter":
        if (c === "start") {
          const nc = this.nextChapter(d.classNum);
          d.chapterId = nc.id; const nt = this.nextTopic(nc); d.topicId = nt && nt.id;
          this.go("plan_confirm");
          return `Class ${nc.classNum}, science, chapter ${nc.number}, ${nc.name}.`;
        }
        this.go("plan_chapter");
        break;

      case "class_lang": {
        const c2 = d.langFor;
        this.setClassLang(c2, c);
        const next = d.langNext; d.langFor = null; d.langNext = null;
        const said = `Class ${c2} is taught in ${c}.` + (c !== "English" && !this.gen.online ? " There is only English support." : "");
        if (next === "__plan") { this.continuePlan(); return said; }
        this.go(next || "home");
        return said;
      }

      // ---------------- F14 Calendar Scheduling
      case "sched_class": { const n = parseInt(c.slice(1), 10); d.classNum = n; this.goWithLang(n, "sched_day"); break; }
      case "sched_day":
        if (d.editEntryId) return this.proposeEdit((e) => ({ ...e, day: c }));
        d.day = c; this.go("sched_period"); break;
      case "sched_period": {
        const p = parseInt(c.slice(1), 10);
        if (d.editEntryId) return this.proposeEdit((e) => ({ ...e, period: p }));
        d.period = p; this.go("sched_chapter"); break;
      }
      case "sched_chapter": {
        const chId = c === "next" ? this.nextChapterForSchedule().id : c;
        if (d.editEntryId) return this.proposeEdit((e) => ({ ...e, chapterId: chId }));
        d.chapterId = chId;
        this.addPendingEntry();
        this.go("sched_more");
        return `Added ${this.entryText(d.pendingEntries[d.pendingEntries.length - 1])}.`;
      }
      case "sched_more":
        if (c === "add") { d.classNum = null; this.go("sched_class"); }
        if (c === "same") { d.pendingEntries = this.st.schedule.map((e) => ({ ...e, id: this.newId() })); this.go("sched_review"); }
        if (c === "done") this.go("sched_review");
        break;
      case "sched_review":
        if (c === "save") {
          const n = d.pendingEntries.length, pe = d.pendingEntries;
          // a new entry in an occupied day and period replaces that one slot only
          this.store.update((s) => ({ ...s, schedule: [...s.schedule.filter((o) => !pe.some((p) => p.day === o.day && p.period === o.period)), ...pe] }));
          d.pendingEntries = [];
          this.goHome();
          return `Schedule saved. ${n} ${n === 1 ? "class" : "classes"} added to your week.`;
        }
        if (c === "change") this.go("sched_pick_pending");
        if (c === "restart") { d.pendingEntries = []; this.go("sched_class"); }
        break;
      case "sched_pick_pending":
        if (c === "__back_review") { this.go("sched_review"); return ""; }
        d.pendingEntries = d.pendingEntries.filter((e) => e.id !== c);
        this.go(d.pendingEntries.length ? "sched_review" : "sched_class");
        return "Removed that entry.";
      case "sched_view":
        if (c === "add") { d.pendingEntries = []; d.classNum = null; this.go("sched_class"); }
        if (c === "change") this.go("sched_pick");
        break;
      case "sched_pick": d.editEntryId = c; this.go("sched_change_field"); break;
      case "sched_change_field":
        if (c === "day") this.go("sched_day");
        if (c === "period") this.go("sched_period");
        if (c === "chapter") { d.classNum = (this.st.schedule.find((e) => e.id === d.editEntryId) || {}).classNum; this.go("sched_chapter"); }
        if (c === "remove") {
          const e = this.st.schedule.find((x) => x.id === d.editEntryId);
          this.store.update((s) => ({ ...s, schedule: s.schedule.filter((x) => x.id !== d.editEntryId) }));
          d.editEntryId = null;
          this.go("sched_view");
          return `Removed ${e ? this.entryText(e) : "that entry"}. Nothing else moved.`;
        }
        break;
      case "sched_change_confirm":
        if (c === "apply") {
          const p = d.proposed;
          this.store.update((s) => ({ ...s, schedule: s.schedule.map((e) => (e.id === p.id ? p : e)) }));
          d.proposed = null; d.editEntryId = null;
          this.go("sched_view");
          return `Changed. ${this.entryText(p)}. Nothing else moved.`;
        }
        if (c === "cancel") { d.proposed = null; d.editEntryId = null; this.go("sched_view"); return "Cancelled. Nothing changed."; }
        break;

      // ---------------- F3 Plan the lesson
      case "plan_class": d.classNum = parseInt(c.slice(1), 10); d.chapterId = null; d.topicId = null; this.go("plan_chapter"); break;
      case "plan_chapter": d.chapterId = c; d.topicId = null; this.go("plan_topic"); break;
      case "plan_topic": d.topicId = c; this.go("plan_confirm"); break;
      case "plan_confirm":
        if (c === "yes") {
          const chx = Curriculum.chapter(d.chapterId);
          const pre = chx.topics.length ? "" : "No Course from Content Studio for this chapter. ";
          if (!this.classLang(chx.classNum)) { d.langFor = chx.classNum; d.langNext = "__plan"; this.go("class_lang"); return pre; }
          this.continuePlan();
          return pre;
        }
        if (c === "change") { d.chapterId = null; d.topicId = null; this.go("plan_class"); }
        break;
      case "plan_previous":
        this.updateLesson(l.id, (x) => ({ ...x, usePreviousContext: c === "use" }));
        this.go(this.nextPlanningStep(this.lesson()));
        return c === "use" ? "I'll use what happened last time." : "Starting fresh.";
      case "plan_tik_source": case "tik_view":
        if (c === "use_as_is") {
          this.updateLesson(l.id, (x) => ({ ...x, tik: ch.syncedTik, tikState: "SYNCED_IN_USE", tikBefore: null }));
          this.go(this.nextPlanningStep(this.lesson()));
          return "Using the Content Studio TIK as it is." + this.langNote(l.classNum, ch.syncedTik.lang, true);
        }
        if (c === "check") { this.go("tik_view"); return ""; }
        if (c === "apply_suggestions") return this.applySuggestions(l, l.tik || ch.syncedTik);
        if (c === "change") { d.checkpointFor = "tik"; this.go("tik_change"); }
        if (c === "build") {
          const t = await this.working("Building the chapter TIK from the textbook…", () => this.gen.chapterTik(ch, this.classLang(l.classNum)));
          if (!t) return this.failed("build the chapter TIK");
          this.updateLesson(l.id, (x) => ({ ...x, tik: t, tikState: "DRAFT", tikBefore: null }));
          d.changeCount = 0; d.tries = 0;
          this.go("tik_review");
          return "The chapter TIK is ready for your review." + this.langNote(l.classNum, t.lang);
        }
        break;
      case "plan_tik_mode":
        if (c === "chapter") { this.updateLesson(l.id, (x) => ({ ...x, modeChosen: true })); this.go(this.nextPlanningStep(this.lesson())); return "Teaching from the chapter TIK."; }
        if (c === "topic") this.go("plan_need");
        break;
      case "plan_need": if (c === "skip") return this.makeTopicTik(null); break;
      case "tik_review":
        if (c === "approve") {
          this.updateLesson(l.id, (x) => ({ ...x, tikState: "APPROVED", modeChosen: x.modeChosen || (x.tik && x.tik.scope === "topic") }));
          d.changeCount = 0; d.tries = 0;
          this.go(this.nextPlanningStep(this.lesson()));
          return `Approved. The TIK is ready for ${tp.name}.`;
        }
        if (c === "change" || c === "edit") { d.checkpointFor = "tik"; this.go("tik_change"); }
        if (c === "apply_suggestions") return this.applySuggestions(l, l.tik);
        if (c === "regenerate") {
          d.tries++;
          const old = l.tik, lang = this.classLang(l.classNum);
          const t = await this.working("Preparing a new version…", () => (old && old.scope === "chapter" ? this.gen.chapterTik(ch, lang) : this.gen.topicTik(ch, tp, old && old.instruction, null, null, lang)));
          if (!t) return this.failed("prepare a new version");
          this.updateLesson(l.id, (x) => ({ ...x, tik: t, tikState: "DRAFT", tikBefore: old }));
          const what = TikTabs.changeText(old, t) || "The content is the same as before.";
          if (d.tries % 3 === 0) { d.checkpointFor = "tik_regen"; this.go("checkpoint"); return `Here is the new version. ${what}`; }
          return `Here is the new version. ${what} It is not yet approved.`;
        }
        if (c === "continue") this.go(this.nextPlanningStep(l));
        break;
      case "tik_change": if (c === "back") this.go(l && l.tik ? "tik_review" : "tik_view"); break;
      case "checkpoint":
        if (c === "keep") this.go({ tik: "tik_change", qs: "qs_change", audio: "audio_review" }[d.checkpointFor] || "tik_review");
        if (c === "stop") this.go({ qs: "qs_review", audio: "audio_review" }[d.checkpointFor] || "tik_review");
        if (c === "use_cs") {
          this.updateLesson(l.id, (x) => ({ ...x, audio: x.audio.filter((a) => a.provenance.startsWith("Synced") || a.approved) }));
          const first = this.lesson().audio[0]; d.audioClipId = first ? first.id : null;
          this.go("audio_review");
          return "Using the Content Studio version.";
        }
        break;

      // ---------------- F17 questions at planning
      case "qs_offer":
        if (c === "prepare") {
          const sets = await this.working("Preparing questions for each topic…", () => this.gen.questionSets(ch, tp, l.tik, this.classLang(l.classNum)));
          if (!sets) return this.failed("prepare the questions");
          this.updateLesson(l.id, (x) => ({ ...x, questionSets: sets }));
          d.changeCount = 0;
          this.go("qs_review");
          return this.langNote(l.classNum, sets[0] && sets[0].lang).trim();
        }
        if (c === "skip") { this.updateLesson(l.id, (x) => ({ ...x, questionsSkipped: true })); this.go(this.nextPlanningStep(this.lesson())); return "Skipped. No questions will be offered in class."; }
        break;
      case "qs_review":
        if (c === "approve") {
          this.updateLesson(l.id, (x) => ({ ...x, questionSets: x.questionSets.map((q) => ({ ...q, approved: true })) }));
          this.go(this.nextPlanningStep(this.lesson()));
          return "Questions approved.";
        }
        if (c === "use_course") {
          // FR-111: the Course's own questions, used as they are, need no approval
          this.updateLesson(l.id, (x) => ({ ...x, questionSets: x.questionSets.map((q) => ({ ...q, check: q.check.slice(0, Math.max(1, q.fromCourse)), discussion: [], approved: true })) }));
          this.go(this.nextPlanningStep(this.lesson()));
          return "Using the Course's questions as they are.";
        }
        if (c === "change") { d.checkpointFor = "qs"; this.go("qs_change"); }
        if (c === "hear") return spoken(this.step, true, false);
        break;
      case "qs_change": if (c === "back") this.go("qs_review"); break;

      // ---------------- F5 Prepare audio
      case "audio_offer":
        if (c === "prepare") {
          const clip = await this.working(`Preparing audio for ${tp.name}…`, () => this.makeClip(l, null, "Audio 1", tp.syncedAudio));
          if (!clip) return this.failed("prepare the audio");
          this.updateLesson(l.id, (x) => ({ ...x, audio: [...x.audio, clip] }));
          d.audioClipId = clip.id; d.tries = 0;
          this.go("audio_review");
          return clip.provenance.startsWith("Synced") ? "Audio from Content Studio is ready." + this.langNote(l.classNum, clip.lang, true)
            : "No audio from Content Studio for this topic, so I prepared one. It is not yet reviewed." + this.langNote(l.classNum, clip.lang);
        }
        if (c === "tik_only") { this.updateLesson(l.id, (x) => ({ ...x, tikOnly: true })); this.go("lesson_saved"); return ""; }
        break;
      case "audio_review": {
        const clip = this.focusClip(l);
        switch (c) {
          case "play": {
            const ok = !!clip && this.audio.play(clip, () => this.refresh(), () => this.refresh());
            this.updateLesson(l.id, (x) => ({ ...x, audio: x.audio.map((a) => (clip && a.id === clip.id ? { ...a, reviewed: true } : a)) }));
            return ok ? "" : "The preview cannot play here. This device may have no voice for this language. You can read the script on screen.";
          }
          case "stop_preview": this.audio.stop(); return "Stopped.";
          case "approve":
            this.audio.stop();
            this.updateLesson(l.id, (x) => ({ ...x, audio: x.audio.map((a) => (clip && a.id === clip.id ? { ...a, approved: true, reviewed: true } : a)) }));
            this.go("lesson_saved");
            return "";
          case "different": case "again": {
            this.audio.stop();
            d.tries++;
            const n = await this.working(`Finding a different version for ${tp.name}…`, () => this.makeClip(l, "a different way of explaining it, with a new everyday example", clip ? clip.name : "Audio 1", false));
            if (!n) return this.failed("prepare a different version");
            // keep the synced original (US-40); replace an earlier unapproved generated try
            this.updateLesson(l.id, (x) => ({ ...x, audio: [...x.audio.filter((a) => !clip || a.id !== clip.id || a.provenance.startsWith("Synced") || a.approved), n] }));
            d.audioClipId = n.id;
            if (d.tries % 3 === 0) { d.checkpointFor = "audio"; this.go("checkpoint"); }
            return "Here is a different version. It is not yet reviewed." + this.langNote(l.classNum, n.lang);
          }
          case "keep_synced": {
            this.updateLesson(l.id, (x) => ({ ...x, audio: x.audio.filter((a) => !clip || a.id !== clip.id) }));
            const s = this.lesson().audio.find((a) => a.provenance.startsWith("Synced"));
            d.audioClipId = s ? s.id : null;
            return "Keeping the Content Studio version.";
          }
          case "discard":
            this.updateLesson(l.id, (x) => ({ ...x, audio: x.audio.filter((a) => !clip || a.id !== clip.id) }));
            d.audioClipId = null;
            this.go(this.lesson().audio.length ? "lesson_saved" : "audio_offer");
            return "Discarded that extra audio.";
          case "add": this.go("audio_add"); break;
          case "done": this.go("lesson_saved"); break;
        }
        break;
      }
      case "audio_add": {
        if (c === "back") { this.go("audio_review"); return ""; }
        const preset = { slower: "Slower pace", shorter: "Shorter summary", reexplain: "Re-explain one step" }[c];
        if (preset) return this.makeExtraAudio(preset);
        break;
      }
      case "lesson_saved":
        if (c === "open") this.go("teach_start");
        if (c === "add") this.go("audio_add");
        break;

      // ---------------- F6 / F7 Teaching
      case "teach_start":
        if (c === "start") {
          const s = { id: this.newId(), lessonId: l.id, startedAt: this.now(), stepIndex: 0, endedAt: null, coverage: null, covered: [], reason: null, checkResults: {}, methods: [], extensionUsed: false };
          this.store.update((x) => ({ ...x, sessions: [...x.sessions, s] }));
          d.sessionId = s.id;
          this.go("teach_step");
          return "Class started.";
        }
        if (c === "prepare") this.go(this.nextPlanningStep(l));
        break;
      case "teach_step": {
        const s = this.session() || this.activeSession();
        if (c === "next") { this.updateSession(s.id, (x) => ({ ...x, stepIndex: x.stepIndex + 1 })); return ""; }
        if (c === "prev") { this.updateSession(s.id, (x) => ({ ...x, stepIndex: Math.max(0, x.stepIndex - 1) })); return ""; }
        if (c === "audio") {
          const a = this.approvedAudio(l)[0]; d.audioClipId = a ? a.id : null;
          this.updateSession(s.id, (x) => ({ ...x, methods: [...x.methods, "audio"] }));
          this.go("audio_player");
        }
        if (c === "end") { this.audio.stop(); this.go("end_coverage"); }
        break;
      }
      case "audio_player": {
        const list = this.approvedAudio(l);
        const clip = list.find((a) => a.id === d.audioClipId) || list[0];
        switch (c) {
          case "toggle":
            if (!this.audio.hasMedia()) {
              const ok = !!clip && this.audio.play(clip, () => this.onAudioFinished(), () => this.onAudioFailed());
              if (!ok) { this.onAudioFailed(); return "Audio is not playing."; }
            } else this.audio.toggle();
            return "";
          case "replay": this.audio.replay(); return "";
          case "version": {
            this.audio.stop();
            const i = list.findIndex((a) => clip && a.id === clip.id);
            const next = list[(i + 1) % list.length];
            d.audioClipId = next.id;
            return `Switched to ${next.name}.`;
          }
          case "not_working": this.audio.stop(); this.log("audio_playback_failed", null, source, "reported by teacher"); this.go("audio_failed"); break;
          case "back": this.audio.stop(); this.go("teach_step"); break;
        }
        break;
      }
      case "audio_failed":
        if (c === "retry") this.go("audio_player");
        if (c === "teacher_led") {
          const s = this.session(); if (s) this.updateSession(s.id, (x) => ({ ...x, methods: [...x.methods, "teacher-led"] }));
          this.go("teach_step");
          return "Continuing teacher-led.";
        }
        break;
      case "audio_finished":
        if (c === "back") this.go("teach_step");
        if (c === "replay") { this.go("audio_player"); this.audio.replay(); }
        break;
      case "end_coverage": {
        const s = this.session();
        if (c === "all") {
          this.updateSession(s.id, (x) => ({ ...x, coverage: "all", covered: ["overview", l.topicId] }));
          const elapsedMin = Math.floor((this.now() - s.startedAt) / 60000);
          if (l.tik && l.tik.extension && elapsedMin < PLANNED_MINUTES) { this.go("early_finish"); return ""; }
          return this.startLearningCheck();
        }
        if (c === "some") this.go("end_partial");
        break;
      }
      case "end_partial": {
        const covered = { overview: ["overview"], part: ["overview", "topic-part"] }[c] || [];
        this.updateSession(this.session().id, (x) => ({ ...x, coverage: "some", covered }));
        this.go("end_reason");
        break;
      }
      case "end_reason": {
        if (c === "other") { this.go("end_reason_other"); return ""; }
        const reason = { time: "Time ran out", more_time: "Students needed more time" }[c] || "Device or connection issue";
        this.updateSession(this.session().id, (x) => ({ ...x, reason }));
        return this.startLearningCheck();
      }
      case "end_reason_other": if (c === "back") this.go("end_reason"); break;
      case "early_finish":
        if (c === "start_ext") { this.updateSession(this.session().id, (x) => ({ ...x, extensionUsed: true })); this.go("extension"); }
        if (c === "skip") return this.startLearningCheck();
        break;
      case "extension": if (c === "done") return this.startLearningCheck(); break;
      case "lc_ask": {
        const key = d.lcQueue[d.lcIndex];
        if (key) this.updateSession(this.session().id, (x) => ({ ...x, checkResults: { ...x.checkResults, [key]: c === "skip" ? "skipped" : c } }));
        d.lcIndex++;
        if (d.lcIndex < d.lcQueue.length) { this.refresh(); return "Noted."; }
        return "Noted. " + this.finishSession();
      }

      // ---------------- F9 Record the class
      case "record_draft":
        if (c === "prompts") this.go("record_prompts");
        if (c === "review") {
          const r = this.st.records.find((x) => x.id === d.recordId);
          const sum = (await this.working("Preparing the summary…", () => this.gen.recordSummary(r.prefilled, r.notes))) || r.prefilled.join(" ");
          this.updateRecord(r.id, (x) => ({ ...x, summary: sum, previewed: true }));
          this.go("record_preview");
        }
        if (c === "later") { this.goHome(); return "Saved as a draft. It is listed on Home."; }
        break;
      case "record_prompts": {
        const note = { well: "Most of the class followed well.", difficult: "The class found this difficult.", mixed: "Mixed response: some followed, some did not." }[c] || "Materials or devices were missing.";
        this.updateRecord(d.recordId, (x) => ({ ...x, notes: [...x.notes, note], previewed: false }));
        this.go("record_draft");
        return `Added: ${note}`;
      }
      case "record_preview":
        if (c === "save") {
          const r = this.st.records.find((x) => x.id === d.recordId);
          this.updateRecord(r.id, (x) => ({ ...x, saved: true }));
          const before = this.st.patterns.length;
          this.proposePatterns(r.lessonId, r.sessionId);
          this.go("record_saved");
          return "Record saved to your teaching history." + (this.st.patterns.length > before ? " One follow-up suggestion is waiting for you." : "");
        }
        if (c === "change") this.go("record_draft");
        if (c === "later") { this.goHome(); return "Saved as a draft. It is listed on Home."; }
        break;
      case "record_saved": if (c === "followups") this.go("followups"); break;

      // ---------------- F8 Assessment/Quiz
      case "quiz_pick": {
        if (c === "plan") { d.clearPlanning(); this.go("plan_class"); return ""; }
        d.lessonId = c.slice(2);
        const lx = this.lesson();
        const existing = [...this.st.quizzes].reverse().find((q) => q.lessonId === lx.id);
        if (existing) {
          d.quizId = existing.id;
          this.go({ Live: "quiz_live", Closed: "quiz_results", Approved: "quiz_window" }[existing.state] || "quiz_review");
          return "";
        }
        const r = await this.working("Drafting a quiz…", () => this.gen.quiz(this.chapterOf(lx), this.topicOf(lx), this.classLang(lx.classNum)));
        if (!r) return this.failed("draft the quiz");
        const q = this.newQuiz(lx.id, r, "Generated for this lesson");
        d.quizId = q.id;
        this.go("quiz_review");
        return "There is no quiz from Content Studio for this topic, so I drafted one." + this.langNote(lx.classNum, r.lang);
      }
      case "quiz_review": {
        const q = this.st.quizzes.find((x) => x.id === d.quizId);
        if (c === "approve") { this.updateQuiz(q.id, (x) => ({ ...x, state: "Approved" })); this.go("quiz_window"); return "Quiz approved."; }
        if (c === "hear") return spoken(this.step, true, false);
        if (c === "regenerate") {
          const lx = this.lesson(q.lessonId);
          const r = await this.working("Drafting a new quiz…", () => this.gen.quiz(this.chapterOf(lx), this.topicOf(lx), this.classLang(lx.classNum)));
          if (!r) return this.failed("draft the quiz");
          this.updateQuiz(q.id, (x) => ({ ...x, checks: r.checks, questions: r.questions, lang: r.lang, state: "Draft" }));
          return "Here is a new draft.";
        }
        break;
      }
      case "quiz_window": {
        const until = { tomorrow: "tomorrow evening", friday: "Friday evening" }[c] || "in three days";
        this.updateQuiz(d.quizId, (x) => ({ ...x, state: "Live", openUntil: until, openedAt: this.now() }));
        this.log("quiz_window", c, source, until);
        this.go("quiz_live");
        return `The quiz is live until ${until}.`;
      }
      case "quiz_live":
        if (c === "refresh") { this.refresh(); return `Responses so far: ${this.simulatedResponses(this.st.quizzes.find((x) => x.id === d.quizId))}.`; }
        if (c === "close") {
          const q = this.st.quizzes.find((x) => x.id === d.quizId);
          const responses = Math.max(8, this.simulatedResponses(q));
          let seed = hash(q.id);
          const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
          const correct = q.questions.map(() => Math.floor(responses * (0.45 + rnd() * 0.5)));
          const below = 1 + Math.floor(rnd() * 4);
          this.updateQuiz(q.id, (x) => ({ ...x, state: "Closed", responses, perQuestionCorrect: correct, belowThreshold: below }));
          const before = this.st.patterns.length;
          const lastSession = [...this.st.sessions].reverse().find((s) => s.lessonId === q.lessonId);
          this.proposePatterns(q.lessonId, lastSession && lastSession.id);
          this.go("quiz_results");
          return "Quiz closed. No more answers are accepted." + (this.st.patterns.length > before ? " One follow-up suggestion is waiting." : "");
        }
        break;
      case "quiz_results": if (c === "followups") this.go("followups"); break;

      // ---------------- F10 Remediation
      case "followups":
        if (c.startsWith("p:")) { d.patternId = c.slice(2); d.lessonId = (this.st.patterns.find((p) => p.id === d.patternId) || {}).lessonId; this.go("followup_pattern"); }
        break;
      case "followup_pattern": {
        const p = this.st.patterns.find((x) => x.id === d.patternId);
        if (c === "confirm") { this.updatePattern(p.id, (x) => ({ ...x, state: "Confirmed" })); this.go("followup_type"); return "Confirmed."; }
        if (c === "dismiss") { this.updatePattern(p.id, (x) => ({ ...x, state: "Dismissed" })); this.go("followups"); return "Dismissed."; }
        if (c === "type") this.go("followup_type");
        if (c === "resolved") { this.updatePattern(p.id, (x) => ({ ...x, state: "Resolved" })); this.go("followups"); return "Marked resolved."; }
        if (c === "still") { this.go("followup_type"); return "Still needs work. Choose another follow-up."; }
        break;
      }
      case "followup_type": {
        const p = this.st.patterns.find((x) => x.id === d.patternId);
        const base = this.lesson(p.lessonId);
        const lang = this.classLang(base.classNum);
        if (c === "tik") {
          const instr = `A simpler version for the ${p.groupSize} students who have not yet understood ${p.concept}.`;
          const t = await this.working("Preparing a simpler TIK…", () => this.gen.topicTik(this.chapterOf(base), this.topicOf(base), null, instr, null, lang));
          if (!t) return this.failed("prepare the simpler TIK");
          const nl = { ...base, id: this.newId(), scheduleId: null, tik: t, tikState: "DRAFT", tikBefore: base.tik, usePreviousContext: false, questionSets: [], questionsSkipped: false, audio: [], tikOnly: false, modeChosen: true, followUpFor: p.id, createdAt: this.now() };
          this.store.update((x) => ({ ...x, lessons: [...x.lessons, nl] }));
          this.updatePattern(p.id, (x) => ({ ...x, followUp: "Simpler TIK" }));
          d.lessonId = nl.id;
          this.go("tik_review");
          return "A simpler TIK is ready for your review." + this.langNote(base.classNum, t.lang);
        }
        if (c === "audio") {
          d.lessonId = base.id;
          this.updatePattern(p.id, (x) => ({ ...x, followUp: "Audio" }));
          return this.makeExtraAudio(`A simpler re-explanation of ${p.concept} for students who have not yet understood it`);
        }
        if (c === "quiz") {
          d.lessonId = base.id;
          const r = await this.working("Drafting a follow-up quiz…", () => this.gen.quiz(this.chapterOf(base), this.topicOf(base), lang));
          if (!r) return this.failed("draft the quiz");
          const q = this.newQuiz(base.id, r, "Generated for this follow-up");
          this.updatePattern(p.id, (x) => ({ ...x, followUp: "Quiz" }));
          d.quizId = q.id;
          this.go("quiz_review");
          return "A follow-up quiz is ready for your review." + this.langNote(base.classNum, r.lang);
        }
        break;
      }
    }
    return "";
  }

  newQuiz(lessonId, r, provenance) {
    const q = { id: this.newId(), lessonId, checks: r.checks, questions: r.questions, lang: r.lang || "English", provenance, state: "Draft",
      openUntil: null, openedAt: null, responses: 0, perQuestionCorrect: [], belowThreshold: 0, classSize: 12 };
    this.store.update((x) => ({ ...x, quizzes: [...x.quizzes, q] }));
    return q;
  }

  async makeExtraAudio(variant) {
    const l = this.lesson();
    const n = l.audio.length + 1;
    if (n > 3) return "There are already three audio clips for this lesson.";
    const clip = await this.working("Preparing the extra audio…", () => this.makeClip(l, variant, `Audio ${n}`, false));
    if (!clip) return this.failed("prepare the extra audio");
    this.updateLesson(l.id, (x) => ({ ...x, audio: [...x.audio, clip] }));
    this.draft.audioClipId = clip.id;
    this.draft.tries = 0;
    this.go("audio_review");
    return `Audio ${n} is ready. It is not yet reviewed.` + this.langNote(l.classNum, clip.lang);
  }

  async makeTopicTik(need) {
    const l = this.lesson(), ch = this.chapterOf(l), tp = this.topicOf(l);
    const prev = l.usePreviousContext ? this.previousContext(ch, tp) : null;
    const t = await this.working("Preparing your lesson plan…", () => this.gen.topicTik(ch, tp, need, null, prev, this.classLang(l.classNum)));
    if (!t) return this.failed("prepare the lesson plan");
    this.updateLesson(l.id, (x) => ({ ...x, tik: t, tikState: "DRAFT", tikBefore: null, modeChosen: true }));
    this.draft.changeCount = 0; this.draft.tries = 0;
    this.go("tik_review");
    return "Your topic TIK draft is ready." + this.langNote(l.classNum, t.lang);
  }

  /** Apply every suggested change on the Summary tab. The synced TIK itself never changes (FR-39). */
  applySuggestions(l, base) {
    const applied = Offline.applyAll(base, this.chapterOf(l));
    if (same(applied, base)) return "There are no suggested changes to apply.";
    const t = { ...applied, provenance: base.provenance.startsWith("Synced") ? "Edited by you" : base.provenance, instruction: "Suggested changes" };
    this.updateLesson(l.id, (x) => ({ ...x, tik: t, tikState: "DRAFT", tikBefore: base, questionSets: x.questionSets.map((q) => ({ ...q, approved: false })) }));
    this.go("tik_review");
    return "Applied the suggested changes. " + TikTabs.changeText(base, t) + " It needs your approval.";
  }

  async handleText(stepId, text) {
    const l = this.lesson();
    switch (stepId) {
      case "plan_need": return this.makeTopicTik(text);
      case "tik_change": {
        const ch = this.chapterOf(l);
        const base = (l && l.tik) || (ch && ch.syncedTik);
        if (!base) return "There is no TIK to change yet.";
        const t = await this.working("Applying your change…", () => this.gen.reviseTik(ch, base, text, this.classLang(l.classNum)));
        if (!t) return this.failed("apply the change");
        // Offline, an unrecognised request comes back unchanged: say so, never pretend (error recovery)
        if (t === base || same(t, base)) return "I couldn't apply that change. " + Offline.REVISE_HINT;
        this.draft.changeCount++;
        // BR-15: editing returns the TIK to unapproved and its question sets to not reviewed
        this.updateLesson(l.id, (x) => ({ ...x, tik: t, tikState: "DRAFT", tikBefore: base, questionSets: x.questionSets.map((q) => ({ ...q, approved: false })) }));
        const what = TikTabs.changeText(base, t);
        if (this.draft.changeCount % 3 === 0) { this.draft.checkpointFor = "tik"; this.go("checkpoint"); return `Change applied. ${what}`; }
        this.go("tik_review");
        return `Change applied. ${what} It needs your approval.`;
      }
      case "qs_change": {
        let out = await this.working("Updating the questions…", async () => (await this.gen.reviseQuestions(this.chapterOf(l), this.topicOf(l), l.tik, l.questionSets, text, this.classLang(l.classNum))) || []);
        if (!out) return this.failed("update the questions");
        if (!out.length) return "I couldn't apply that. Try: easier, harder, fewer or more questions.";
        this.draft.changeCount++;
        this.updateLesson(l.id, (x) => ({ ...x, questionSets: out }));
        if (this.draft.changeCount % 3 === 0) { this.draft.checkpointFor = "qs"; this.go("checkpoint"); return "Questions updated."; }
        this.go("qs_review");
        return "Questions updated. They need your approval.";
      }
      case "audio_add": return this.makeExtraAudio(text);
      case "record_draft":
        this.updateRecord(this.draft.recordId, (x) => ({ ...x, notes: [...x.notes, text], previewed: false }));
        this.refresh();
        return "Added your note.";
      case "end_reason_other":
        this.updateSession(this.session().id, (x) => ({ ...x, reason: text }));
        return this.startLearningCheck();
    }
    return "";
  }
}

export { LANGS, inLang };
