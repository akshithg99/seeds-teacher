import { Curriculum, DemoAccounts, LANGS } from "./data.js";
import { Tier, Source, Flow, makeStep, choice, allChoices, spoken, optionsPhrase, inLang } from "./step.js";
import { TikTabs } from "./tiktabs.js";
import * as Offline from "./offline.js";
import { buildStep } from "./steps.js";

export const emptyState = () => ({
  signedInPhone: null, rememberMe: true, voiceGuide: {}, speechRate: 1, bargeIn: false,
  classLang: {}, lessons: [], sessions: [], records: [], quizzes: [], patterns: [], events: [], committed: [],
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
    this.classNum = null; this.subject = null; this.subjectNext = null; this.chapterId = null; this.topicId = null; this.lessonId = null;
    this.sessionId = null; this.recordId = null; this.quizId = null; this.patternId = null; this.quizTopics = []; this.quizUntil = null;
    this.wsKind = null; this.wsItem = null;
    this.changeCount = 0; this.tries = 0; this.checkpointFor = "tik"; this.lcQueue = []; this.lcIndex = 0;
    this.audioClipId = null; this.justSignedIn = false; this.langFor = null; this.langNext = null;
  }
  clearPlanning() {
    Object.assign(this, { classNum: null, subject: null, chapterId: null, topicId: null, lessonId: null, changeCount: 0, tries: 0, audioClipId: null });
  }
  snapshot() { const d = new Draft(); Object.assign(d, this, { lcQueue: [...this.lcQueue], quizTopics: [...this.quizTopics] }); return d; }
  restore(o) { Object.assign(this, o, { lcQueue: [...o.lcQueue], quizTopics: [...(o.quizTopics || [])], justSignedIn: false }); }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const hash = (v) => { const s = JSON.stringify(v) || ""; let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; };
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const WEAK_PCT = 30; // a topic needs reinforcement when at least this share of its quiz answers were wrong
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
  /** Taught once a class has gone through the whole TIK; a class that stopped partway leaves it ready to continue. */
  taught(l) { return this.st.sessions.some((s) => s.lessonId === l.id && s.endedAt != null && s.coverage === "all"); }
  /** The TIK step the next class of this lesson starts at: where the last class stopped. */
  resumeAt(l) { const s = [...this.st.sessions].reverse().find((x) => x.lessonId === l.id && x.endedAt != null); return (s && s.coverage !== "all" && s.nextStep) || 0; }
  resumeName(l) { return l.tik ? TikTabs.classSteps(l.tik)[this.resumeAt(l)].name : ""; }
  /** A ready lesson's name, with where it continues from if a class stopped partway. */
  readyName(l) { return this.lessonName(l) + (this.resumeAt(l) ? ` (continue from ${this.resumeName(l)})` : ""); }
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
      case "QUIZ": this.go("quiz_home"); break;
      case "FOLLOWUP": this.go("followups"); break;
      case "WORKSPACE": this.go("workspace"); break;
      default: this.goHome();
    }
    this.notify(source);
    return `${flow.label}. ` + spoken(this.step);
  }

  /**
   * Opening request (FR-102): fill each detail caught, read them back in one sentence, and go to the first
   * step still missing a detail. It only fills details and moves; nothing changes or commits here.
   */
  async fillDetails(intent, classNum, chapter, topic, source, subject = null) {
    if (classNum != null && !Curriculum.coveredClasses.includes(classNum)) return `Class ${classNum} is not covered yet. SEEDS covers classes 6, 7 and 9 for now.`;
    this.log("fill_details", intent, source, [classNum, subject, chapter, topic].filter((x) => x != null).join(","));
    const d = this.draft;
    const caught = [], notes = [];
    if (!Curriculum.subjects.includes(subject)) subject = null;
    // with the class but not the subject, ask the subject next, then go on to `next`
    const askSubject = (next) => { d.subjectNext = next; return "pick_subject"; };
    switch ((intent || "").toLowerCase()) {
      case "next":
        // "What should I teach next?" (J21, FR-106)
        d.clearPlanning();
        if (classNum != null) {
          d.classNum = classNum; d.subject = subject; caught.push(`class ${classNum}`, ...(subject ? [subject.toLowerCase()] : []));
          this.goWithLang(classNum, subject ? "next_chapter" : askSubject("next_chapter"));
        } else this.go("next_class");
        break;
      case "teach": {
        const ready = this.st.lessons.filter((l) => this.ready(l) && !this.taught(l) && (classNum == null || l.classNum === classNum));
        if (ready.length) { const l = ready[ready.length - 1]; d.lessonId = l.id; this.go("teach_start"); caught.push(this.lessonName(l)); }
        else { notes.push(`No lesson is ready to teach${classNum != null ? ` for class ${classNum}` : ""}.`); this.go("home"); }
        break;
      }
      case "quiz":
        if (classNum != null) { d.classNum = classNum; d.subject = subject; caught.push(`class ${classNum}`, ...(subject ? [subject.toLowerCase()] : [])); this.go(subject ? "quiz_chapter" : askSubject("quiz_chapter")); }
        else this.go("quiz_home");
        break;
      default: {
        d.lessonId = null;
        // a different class or subject starts over: an earlier request's chapter and topic do not carry across
        if ((classNum != null && classNum !== d.classNum) || (subject && subject !== d.subject)) { d.chapterId = null; d.topicId = null; if (!subject) d.subject = null; }
        if (classNum != null) d.classNum = classNum;
        if (subject) d.subject = subject;
        if (chapter) {
          const ch = Curriculum.findChapter(d.classNum, chapter, d.subject);
          if (ch) { d.chapterId = ch.id; d.classNum = ch.classNum; d.subject = ch.subject; } else notes.push(`I didn't find a chapter called ${chapter}.`);
        }
        if (topic) {
          const tp = Curriculum.findTopic(Curriculum.chapter(d.chapterId), topic);
          if (tp) { const cht = Curriculum.chapterOfTopic(tp.id); d.topicId = tp.id; d.chapterId = cht.id; d.subject = cht.subject; }
          else notes.push(`I didn't find a topic called ${topic}.`);
        }
        if (d.classNum != null) caught.push(`class ${d.classNum}`, ...(d.subject ? [d.subject.toLowerCase()] : []));
        const chx = Curriculum.chapter(d.chapterId);
        if (chx) caught.push(`chapter ${chx.number}, ${chx.name}`);
        if (d.topicId) caught.push(Curriculum.topic(d.topicId).name);
        // the class and subject are known but not the chapter: offer where the class is up to (FR-106), as a yes-or-no question
        if (d.classNum != null && d.subject && !d.chapterId && !chapter) { const nc = this.nextChapter(d.classNum, d.subject); if (nc) d.chapterId = nc.id; }
        if (d.chapterId && !d.topicId) { const nt = this.nextTopic(Curriculum.chapter(d.chapterId)); d.topicId = nt && nt.id; }
        if (d.classNum == null) this.go("plan_class");
        else if (!d.subject) this.go(askSubject("plan_chapter"));
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

  /** Topics whose concept step some class has finished, from any TIK. */
  coveredTopics() { return new Set(this.st.sessions.filter((s) => s.endedAt != null).flatMap((s) => s.covered)); }

  nextTopic(ch) {
    const done = this.coveredTopics();
    return ch.topics.find((t) => !done.has(t.id)) || ch.topics[0] || null;
  }

  /** What to plan next, from the class taught last: the chapter's next topic, or the next chapter once every topic is covered. */
  upNext() {
    const s = [...this.st.sessions].reverse().find((x) => x.endedAt != null && this.lesson(x.lessonId));
    const l = s && this.lesson(s.lessonId);
    const ch = l && this.nextChapter(l.classNum, l.subject);
    return ch ? { chapter: ch, topic: this.nextTopic(ch) } : null;
  }
  upNextText(u) { return `chapter ${u.chapter.number}, ${u.chapter.name}: ${u.topic.name}`; }

  /** FR-106: next chapter is the one after the last taught; otherwise the first in contents order. */
  nextChapter(classNum, subject, after = null) {
    const list = Curriculum.forClass(classNum, subject);
    let ref = after;
    if (!ref) {
      const taughtLessons = this.st.sessions.filter((s) => s.endedAt != null).map((s) => this.lesson(s.lessonId)).filter((l) => l && l.classNum === classNum && l.subject === subject);
      ref = taughtLessons.length ? taughtLessons[taughtLessons.length - 1].chapterId : null;
    }
    if (!ref) return list[0] || null;
    const ch = Curriculum.chapter(ref);
    if (!ch) return list[0] || null;
    // Uncovered topics carry forward (J4): stay on the chapter until all topics are covered
    const done = this.coveredTopics(), allCovered = ch.topics.every((t) => done.has(t.id));
    if (!after && !allCovered) return ch;
    const i = list.findIndex((x) => x.id === ref);
    return list[i + 1] || list[list.length - 1] || null;
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
    else if (s.id === "class_lang") ctx = `${d.langFor}`;
    // a lesson can now be taught over several classes, so End class is once per class, not per lesson
    else if (s.flow === Flow.TEACH) ctx = d.sessionId;
    else { const l = this.lesson(); ctx = `${d.lessonId}:${l ? hash([l.tik, l.questionSets, l.audio]) : 0}`; }
    return `${s.id}:${c.id}:${ctx}`;
  }

  ensureLessonForDraft() {
    const d = this.draft;
    const ch = Curriculum.chapter(d.chapterId), tp = Curriculum.topic(d.topicId);
    const existing = [...this.st.lessons].reverse().find((l) => l.chapterId === ch.id && l.topicId === tp.id && !this.taught(l) && !l.followUpFor);
    if (existing) {
      d.lessonId = existing.id;
      return this.lesson();
    }
    let l = { id: this.newId(), classNum: ch.classNum, subject: ch.subject, chapterId: ch.id, topicId: tp.id,
      tik: null, tikState: "NONE", tikBefore: null, usePreviousContext: false, questionSets: [], questionsSkipped: false,
      audio: [], tikOnly: false, modeChosen: false, followUpFor: null, createdAt: this.now() };
    // Reuse before generate (BR-11): a ready chapter TIK already in the workspace
    const w = this.workspaceChapterTik(ch);
    if (w) l = { ...l, tik: w.tik, tikState: w.tikState };
    this.store.update((s) => ({ ...s, lessons: [...s.lessons, l] }));
    d.lessonId = l.id;
    return l;
  }

  /** After the lesson details are confirmed (and the class language is known): prepare the lesson. */
  async continuePlan() {
    const chx = Curriculum.chapter(this.draft.chapterId), tpx = Curriculum.topic(this.draft.topicId);
    const nl = this.ensureLessonForDraft();
    if (this.previousContext(chx, tpx) && !nl.tik) { this.go("plan_previous"); return ""; }
    return this.prepareAll();
  }

  /**
   * One "yes" prepares the whole lesson: the chapter TIK (Content Studio's as it is, otherwise built from the textbook),
   * the questions and the audio. Nothing is approved here: the teacher reviews them next, one by one or all in a row.
   * What was prepared before a failure is kept, and planning carries on from the first missing piece.
   */
  async prepareAll() {
    const id = this.draft.lessonId, l0 = this.lesson();
    const ch = this.chapterOf(l0), tp = this.topicOf(l0), lang = this.classLang(l0.classNum);
    const ok = await this.working("Preparing your lesson…", async () => {
      if (!this.lesson().tik) {
        const t = ch.syncedTik || await this.gen.chapterTik(ch, lang);
        if (!t) throw new Error("The TIK could not be prepared.");
        this.updateLesson(id, (x) => ({ ...x, tik: t, tikState: ch.syncedTik ? "SYNCED_IN_USE" : "DRAFT", tikBefore: null }));
      }
      this.updateLesson(id, (x) => ({ ...x, modeChosen: true }));
      const l = this.lesson();
      if (!l.questionSets.length && !l.questionsSkipped) {
        const sets = await this.gen.questionSets(ch, tp, l.tik, lang);
        if (!sets) throw new Error("The questions could not be prepared.");
        this.updateLesson(id, (x) => ({ ...x, questionSets: sets }));
      }
      if (!l.audio.length && !l.tikOnly) {
        if (!this.hasSyncedAudio(tp)) this.updateLesson(id, (x) => ({ ...x, tikOnly: true }));
        else { const clip = this.syncedClip(tp); this.updateLesson(id, (x) => ({ ...x, audio: [clip] })); this.draft.audioClipId = clip.id; }
      }
      return true;
    });
    if (!ok) { this.go(this.nextPlanningStep(this.lesson())); return this.failed("prepare everything"); }
    this.go("plan_review");
    const t = this.lesson().tik;
    return this.langNote(l0.classNum, t && t.lang).trim();
  }

  /** Content Studio has audio for this topic: its chapter's recording. */
  hasSyncedAudio(tp) { const ch = tp && Curriculum.chapterOfTopic(tp.id); return !!(ch && ch.audio); }

  /** Content Studio's audio for a topic: its chapter's recording. */
  syncedClip(tp) {
    const ch = Curriculum.chapterOfTopic(tp.id);
    // shortcut: the recording's language is not in its file name, so it is taken as English; set it per chapter when known
    return { id: `cs-${ch.id}`, name: `Chapter ${ch.number} recording: ${ch.name}`, provenance: "Synced from Content Studio", src: ch.audio.src,
      lang: "English", approved: false, reviewed: false, durationSec: ch.audio.minutes * 60 };
  }

  /**
   * The teacher's workspace: every TIK, audio and quiz from Content Studio, then everything made with SEEDS.
   * Read-only here: Content Studio items can't be changed by teachers, and the teacher's own items are changed in their flows.
   */
  workspace() {
    const tiks = [], audio = [], quizzes = [];
    const QUIZ_STATUS = { Draft: "Not approved yet", Approved: "Approved, not shared yet", Live: "Shared to IVR", Closed: "Closed, results ready" };
    for (const ch of Curriculum.chapters) {
      const where = `Class ${ch.classNum} ${ch.subject}, ${ch.name}`;
      if (ch.syncedTik) tiks.push({ key: `cs:${ch.id}`, fromCS: true, title: `${where}: chapter TIK`, tik: ch.syncedTik, status: "Ready to use", lang: ch.syncedTik.lang });
      if (ch.audio) audio.push({ key: `csa:${ch.id}`, fromCS: true, title: `${where}: chapter recording`, clip: this.syncedClip(ch.topics[0]), status: "Ready to use", lang: "English" });    }
    for (const l of this.st.lessons) {
      if (l.tik && !String(l.tik.provenance).startsWith("Synced")) {
        tiks.push({ key: `l:${l.id}`, fromCS: false, title: `${this.lessonName(l)}: ${l.tik.scope === "chapter" ? "chapter" : "topic"} TIK`, tik: l.tik,
          status: this.ready(l) ? "Approved" : "Not approved yet", lang: l.tik.lang });
      }
      for (const a of l.audio) if (!a.provenance.startsWith("Synced")) audio.push({ key: `a:${a.id}`, fromCS: false, title: `${this.lessonName(l)}: ${a.name}`, clip: a, status: a.approved ? "Approved" : "Not approved yet", lang: a.lang });
    }
    for (const ch of Curriculum.chapters) if (ch.syncedQuiz && !this.st.quizzes.some((q) => q.csKey === ch.id)) {
      quizzes.push({ key: `csq:${ch.id}`, fromCS: true, catalog: true, title: `Class ${ch.classNum} ${ch.subject}, ${ch.name}: quiz`, quiz: ch.syncedQuiz, status: "Ready to use", lang: ch.syncedQuiz.lang });
    }
    for (const q of this.st.quizzes) quizzes.push({ key: `q:${q.id}`, fromCS: q.provenance.startsWith("Synced"), title: `${this.quizName(q)}: quiz`, quiz: q, status: QUIZ_STATUS[q.state] || q.state, lang: q.lang });
    return { tiks, audio, quizzes };
  }
  workspaceItem(key) { const w = this.workspace(); return [...w.tiks, ...w.audio, ...w.quizzes].find((x) => x.key === key) || null; }

  proposePatterns(lessonId, sessionId) {
    const l = this.lesson(lessonId), tp = this.topicOf(l);
    if (!tp) return;
    const signals = [];
    const s = this.st.sessions.find((x) => x.id === sessionId);
    const r = s && s.checkResults[tp.id];
    if (r === "few" || r === "none") signals.push(`Learning check: ${r} of the class could answer`);
    const rec = [...this.st.records].reverse().find((x) => x.sessionId === sessionId && x.saved);
    const note = rec && rec.notes.find((n) => /difficult/i.test(n));
    if (note) signals.push(`You noted: "${note.slice(0, 80)}"`);
    if (!signals.length) return;
    this.addPattern(tp, l.classNum, lessonId, signals);
  }

  /** One follow-up per concept, for the class as a whole: new signals join an open one (v5.4 8.8). */
  addPattern(tp, classNum, lessonId, signals) {
    const existing = this.st.patterns.find((p) => (p.topicId === tp.id || (lessonId && p.lessonId === lessonId)) && (p.state === "Proposed" || p.state === "Confirmed"));
    if (existing) this.updatePattern(existing.id, (p) => ({ ...p, signals: [...new Set([...p.signals, ...signals])] }));
    else this.store.update((x) => ({ ...x, patterns: [...x.patterns, { id: this.newId(), lessonId, topicId: tp.id, classNum, concept: tp.name, signals, state: "Proposed", followUp: null }] }));
  }

  /** A closed quiz proposes a follow-up for each topic where many answers were wrong. */
  proposeFromQuiz(q) {
    const s = this.quizStats(q);
    if (!s) return;
    for (const w of s.weak) {
      const tp = Curriculum.topic(w.id);
      const lesson = [...this.st.lessons].reverse().find((l) => l.topicId === w.id && !l.followUpFor);
      this.addPattern(tp, q.classNum, lesson ? lesson.id : null, [`Quiz: ${w.wrongPct}% of the answers on ${tp.name} were wrong`]);
    }
  }

  /** Quiz results for the class as a whole: overall and per topic. Null until the quiz has answers. */
  quizStats(q) {
    if (!q || !q.responses) return null;
    const topics = [...new Set(q.questions.map((x) => x.topicId).filter(Boolean))].map((id) => {
      const idx = q.questions.map((x, i) => (x.topicId === id ? i : -1)).filter((i) => i >= 0);
      const right = idx.reduce((a, i) => a + (q.perQuestionCorrect[i] || 0), 0);
      return { id, name: (Curriculum.topic(id) || {}).name || id, wrongPct: Math.round(100 - (100 * right) / (q.responses * idx.length)) };
    });
    return { responses: q.responses, wrongPct: q.wrongPct, topics, weak: topics.filter((x) => x.wrongPct >= WEAK_PCT) };
  }

  quizName(q) {
    const ch = Curriculum.chapter(q.chapterId);
    if (!ch) return "Quiz";
    const all = q.topicIds.length === ch.topics.length;
    return `Class ${ch.classNum} ${ch.subject}, ${ch.name}` + (all ? "" : `: ${q.topicIds.map((id) => (Curriculum.topic(id) || {}).name).join(", ")}`);
  }

  quizKnown(q) {
    const ch = q && Curriculum.chapter(q.chapterId);
    if (!ch) return [];
    return [["Class", `${ch.classNum}`], ["Chapter", `${ch.number}. ${ch.name}`],
      ["Covers", q.topicIds.length === ch.topics.length ? "The whole chapter" : q.topicIds.map((id) => (Curriculum.topic(id) || {}).name).join(", ")], ["From", q.provenance]];
  }

  async makeQuiz() {
    const ch = Curriculum.chapter(this.draft.chapterId);
    const topics = ch.topics.filter((t) => this.draft.quizTopics.includes(t.id));
    const r = await this.working("Drafting a quiz…", () => this.gen.quiz(ch, topics, this.classLang(ch.classNum)));
    if (!r) return this.failed("draft the quiz");
    const q = this.newQuiz(ch, topics.map((t) => t.id), r, "Generated by SEEDS PROJECT-B");
    this.draft.quizId = q.id;
    this.go("quiz_review");
    return `Here is a draft quiz with ${q.questions.length} multiple-choice questions and an answer key.` + this.langNote(ch.classNum, r.lang);
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
      ended.coverage === "all" ? "Coverage: the whole TIK." : `Coverage: some covered (${this.coveredText(ended)}). Reason: ${ended.reason || "not given"}.`];
    // where the next class starts: the step this one stopped at, or what comes after this TIK
    const u = this.upNext();
    const next = ended.coverage === "all" ? (u ? `Next to plan: ${this.upNextText(u)}.` : "") : `Next class starts at: ${this.resumeName(l)}.`;
    if (next) facts.push(next);
    Object.entries(ended.checkResults).forEach(([k, v]) => facts.push(`Learning check, ${k === "overview" ? "overview" : (Curriculum.topic(k) || {}).name || k}: ${v}.`));
    const rec = { id: this.newId(), sessionId: s.id, lessonId: s.lessonId, createdAt: this.now(), prefilled: facts, notes: [], summary: "", previewed: false, saved: false };
    this.store.update((x) => ({ ...x, records: [...x.records, rec] }));
    this.draft.recordId = rec.id;
    this.go("record_draft");
    return "Class ended. I've drafted your class record from the session." + (next ? ` ${next}` : "");
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
          case "plan": d.clearPlanning(); this.go("plan_class"); break;
          case "resume_plan": { const l = this.unfinishedLesson(); if (l) { d.clearPlanning(); d.lessonId = l.id; this.go(l.tik ? "plan_review" : this.nextPlanningStep(l)); } break; }
          case "next_topic": this.go("next_class"); break;
          case "plan_next": {
            const u = this.upNext(); if (!u) break;
            d.clearPlanning(); d.classNum = u.chapter.classNum; d.subject = u.chapter.subject; d.chapterId = u.chapter.id; d.topicId = u.topic.id;
            this.go("plan_confirm"); break;
          }
          case "teach_pick": this.go("teach_pick"); break;
          case "awaiting": this.go("awaiting"); break;
          case "quiz": this.go("quiz_home"); break;
          case "followups": this.go("followups"); break;
          case "menu": this.go("menu"); break;
          case "workspace": this.go("workspace"); break;
        }
        break;

      case "workspace":
        if (["tiks", "audio", "quizzes"].includes(c)) { d.wsKind = c; this.go("ws_list"); }
        break;
      case "ws_list":
        if (c === "ws_home") this.go("workspace"); else { d.wsItem = c; this.go("ws_item"); }
        break;
      case "ws_item": {
        const x = this.workspaceItem(d.wsItem);
        if (c === "play" && x && x.clip) {
          const ok = this.audio.play(x.clip, () => this.refresh(), () => this.refresh());
          return ok ? "Playing." : "The audio didn't play on this device.";
        }
        if (c === "stop") { this.audio.stop(); return "Stopped."; }
        if (c === "ws_back") { this.audio.stop(); this.go("ws_list"); }
        if (c === "use_quiz" && x && x.catalog) {
          const chx = Curriculum.chapter(d.wsItem.slice(4));
          const q = this.newQuiz(chx, chx.topics.map((t) => t.id), chx.syncedQuiz, chx.syncedQuiz.provenance);
          d.quizId = q.id; this.go("quiz_review");
        }
        if (["review_quiz", "share_quiz", "live_quiz"].includes(c) && x && x.quiz) {
          d.quizId = x.quiz.id;
          this.go({ review_quiz: "quiz_review", share_quiz: "quiz_window", live_quiz: "quiz_live" }[c]);
        }
        break;
      }

      case "awaiting": {
        const [kind, id] = [c.split(":")[0], c.split(":").slice(1).join(":")];
        if (kind === "l") { d.lessonId = id; const lx = this.lesson(); if (lx) this.go(this.nextPlanningStep(lx)); }
        if (kind === "q") { d.quizId = id; this.go("quiz_review"); }
        if (kind === "r") { d.recordId = id; this.go("record_draft"); }
        if (kind === "p") { d.patternId = id; d.lessonId = (this.st.patterns.find((p) => p.id === id) || {}).lessonId; this.go("followup_pattern"); }
        break;
      }
      case "teach_pick":
        if (c.startsWith("l:")) { d.lessonId = c.slice(2); this.go("teach_start"); } else if (c === "plan") { d.clearPlanning(); this.go("plan_class"); }
        break;
      case "next_class": { const n = parseInt(c.slice(1), 10); d.clearPlanning(); d.classNum = n; d.subjectNext = "next_chapter"; this.goWithLang(n, "pick_subject"); break; }
      case "pick_subject": d.subject = c; d.chapterId = null; d.topicId = null; this.go(d.subjectNext || "plan_chapter"); break;
      case "next_chapter":
        if (c === "start") {
          const nc = this.nextChapter(d.classNum, d.subject);
          d.chapterId = nc.id; const nt = this.nextTopic(nc); d.topicId = nt && nt.id;
          this.go("plan_confirm");
          return `Class ${nc.classNum}, ${nc.subject.toLowerCase()}, chapter ${nc.number}, ${nc.name}.`;
        }
        this.go("plan_chapter");
        break;

      case "class_lang": {
        const c2 = d.langFor;
        this.setClassLang(c2, c);
        const next = d.langNext; d.langFor = null; d.langNext = null;
        const said = `Class ${c2} is taught in ${c}.` + (c !== "English" && !this.gen.online ? " There is only English support." : "");
        if (next === "__plan") return [said, await this.continuePlan()].filter(Boolean).join(" ");
        this.go(next || "home");
        return said;
      }

      // ---------------- F3 Plan the lesson
      case "plan_class": d.classNum = parseInt(c.slice(1), 10); d.subject = null; d.chapterId = null; d.topicId = null; d.subjectNext = "plan_chapter"; this.go("pick_subject"); break;
      case "plan_chapter": d.chapterId = c; d.topicId = null; this.go("plan_topic"); break;
      case "plan_topic": d.topicId = c; this.go("plan_confirm"); break;
      case "plan_confirm":
        if (c === "yes") {
          const chx = Curriculum.chapter(d.chapterId);
          const pre = chx.topics.length ? "" : "No Course from Content Studio for this chapter. ";
          if (!this.classLang(chx.classNum)) { d.langFor = chx.classNum; d.langNext = "__plan"; this.go("class_lang"); return pre; }
          return pre + await this.continuePlan();
        }
        // "no" keeps the class and asks for the chapter
        if (c === "change") { d.subject = (Curriculum.chapter(d.chapterId) || {}).subject || d.subject; d.chapterId = null; d.topicId = null; this.go(d.classNum != null ? "plan_chapter" : "plan_class"); }
        break;
      case "plan_previous": {
        this.updateLesson(l.id, (x) => ({ ...x, usePreviousContext: c === "use" }));
        const said = c === "use" ? "I'll use what happened last time." : "Starting fresh.";
        return [said, await this.prepareAll()].filter(Boolean).join(" ");
      }
      case "plan_review":
        if (c === "review") this.go(this.nextPlanningStep(l));
        if (c === "tik") this.go(l.tikState === "SYNCED_IN_USE" ? "tik_view" : "tik_review");
        if (c === "questions") this.go("qs_review");
        if (c === "audio") { d.audioClipId = l.audio.length ? l.audio[0].id : null; this.go("audio_review"); }
        if (c === "topic_tik") this.go("plan_need");
        break;
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
        if (c === "keep") this.go({ tik: "tik_change", qs: "qs_change" }[d.checkpointFor] || "tik_review");
        if (c === "stop") this.go({ qs: "qs_review" }[d.checkpointFor] || "tik_review");
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
        if (c === "use" && this.hasSyncedAudio(tp)) {
          const clip = { ...this.syncedClip(tp), approved: true, reviewed: true };
          this.updateLesson(l.id, (x) => ({ ...x, audio: [clip] }));
          d.audioClipId = clip.id;
          this.go("lesson_saved");
          return "Using the audio from Content Studio." + this.langNote(l.classNum, clip.lang, true);
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
          case "use":
            this.audio.stop();
            this.updateLesson(l.id, (x) => ({ ...x, audio: x.audio.map((a) => (clip && a.id === clip.id ? { ...a, approved: true, reviewed: true } : a)) }));
            this.go("lesson_saved");
            return "Using the audio from Content Studio.";
          case "without":
            this.audio.stop();
            this.updateLesson(l.id, (x) => ({ ...x, audio: [], tikOnly: true }));
            d.audioClipId = null;
            this.go("lesson_saved");
            return "You'll teach from the TIK, without audio.";
          case "done": this.go("lesson_saved"); break;
        }
        break;
      }
      case "lesson_saved":
        if (c === "open") this.go("teach_start");
        break;

      // ---------------- F6 / F7 Teaching
      case "teach_start":
        if (c === "start") {
          const s = { id: this.newId(), lessonId: l.id, startedAt: this.now(), stepIndex: this.resumeAt(l), from: this.resumeAt(l), nextStep: 0, endedAt: null, coverage: null, covered: [], reason: null, checkResults: {}, methods: [] };
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
        if (c === "lc") this.go("lc_read");
        if (c === "end") { this.audio.stop(); this.go("end_coverage"); }
        break;
      }
      case "lc_read":
        if (c === "read") return l.questionSets.filter((q) => q.approved && q.check.length).map((q) => inLang(q.lang, q.check.join(" "))).join(" ");
        if (c === "back") this.go("teach_step");
        if (c === "end") { this.audio.stop(); this.go("end_coverage"); }
        break;
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
        const steps = TikTabs.classSteps(l.tik);
        if (c === "carry_on") {
          this.updateSession(s.id, (x) => ({ ...x, stepIndex: x.stepIndex + 1 }));
          // the class goes on, so End class must work again later in this class
          this.store.update((x) => ({ ...x, committed: x.committed.filter((k) => !k.endsWith(`:end:${s.id}`)) }));
          this.go("teach_step");
          return `Carrying on with ${steps[Math.min(s.stepIndex + 1, steps.length - 1)].name}.`;
        }
        const next =Math.min(s.stepIndex, steps.length - 1) + (c === "done" ? 1 : 0);
        // covered in this class (from where it started): the overview if it did the key points, and each topic whose concept step it finished
        const from = s.from || 0, all = next >= steps.length;
        const ids = steps.map((x) => x.topic && (ch.topics.find((t) => t.name.toLowerCase() === x.topic.toLowerCase()) || {}).id);
        const covered = [...new Set([...(from < 2 && next >= 2 ? ["overview"] : []), ...ids.slice(from, next).filter(Boolean), ...(all && !ids.some(Boolean) ? [l.topicId] : [])])];
        this.updateSession(s.id, (x) => ({ ...x, nextStep: next, coverage: all ? "all" : "some", covered }));
        if (all) return this.startLearningCheck();
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

      // ---------------- F8 Assessment/Quiz (v5.4 8.6)
      case "quiz_home":
        if (c === "plan") { d.clearPlanning(); this.go("quiz_class"); }
        if (c === "mine") { d.wsKind = "quizzes"; this.go("ws_list"); }
        break;
      case "quiz_class": d.classNum = parseInt(c.slice(1), 10); d.subject = null; d.chapterId = null; d.subjectNext = "quiz_chapter"; this.go("pick_subject"); break;
      case "quiz_chapter": {
        d.chapterId = c; d.quizTopics = [];
        this.go(Curriculum.chapter(c).syncedQuiz ? "quiz_source" : "quiz_scope");
        break;
      }
      case "quiz_source": {
        const chx = Curriculum.chapter(d.chapterId);
        if (c === "make") { this.go("quiz_scope"); break; }
        const q = this.newQuiz(chx, chx.topics.map((x) => x.id), chx.syncedQuiz, chx.syncedQuiz.provenance);
        d.quizId = q.id;
        this.go("quiz_review");
        return "Here is the quiz from Content Studio, with its answer key." + this.langNote(chx.classNum, q.lang, true);
      }
      case "quiz_scope":
        if (c === "chapter") { d.quizTopics = Curriculum.chapter(d.chapterId).topics.map((x) => x.id); return this.makeQuiz(); }
        if (c === "topics") { d.quizTopics = []; this.go("quiz_topics"); }
        break;
      case "quiz_topics":
        if (c === "make") return this.makeQuiz();
        d.quizTopics = d.quizTopics.includes(c) ? d.quizTopics.filter((x) => x !== c) : [...d.quizTopics, c];
        this.refresh();
        return `${(Curriculum.topic(c) || {}).name} ${d.quizTopics.includes(c) ? "added" : "taken out"}.`;
      case "quiz_review": {
        const q = this.st.quizzes.find((x) => x.id === d.quizId);
        if (c === "approve") { this.updateQuiz(q.id, (x) => ({ ...x, state: "Approved" })); this.go("quiz_window"); return "Quiz approved."; }
        if (c === "share") { this.go("quiz_window"); break; }
        if (c === "hear") return spoken(this.step, true, false);
        if (c === "regenerate") {
          const chx = Curriculum.chapter(q.chapterId);
          const r = await this.working("Drafting a new quiz…", () => this.gen.quiz(chx, q.topicIds.map((id) => Curriculum.topic(id)), this.classLang(chx.classNum)));
          if (!r) return this.failed("draft the quiz");
          this.updateQuiz(q.id, (x) => ({ ...x, checks: r.checks, questions: r.questions, lang: r.lang, state: "Draft" }));
          return "Here is a new draft.";
        }
        break;
      }
      case "quiz_window":
        d.quizUntil = { tomorrow: "tomorrow evening", friday: "Friday evening" }[c] || "three days from now";
        this.go("quiz_share");
        break;
      case "quiz_share": {
        if (c === "when") { this.go("quiz_window"); break; }
        const until = d.quizUntil || "Friday evening";
        this.updateQuiz(d.quizId, (x) => ({ ...x, state: "Live", openUntil: until, openedAt: this.now() }));
        this.log("quiz_share", d.quizId, source, until);
        this.go("quiz_live");
        return `Shared to IVR until ${until}. Only the questions were sent.`;
      }
      case "quiz_live":
        if (c === "refresh") { this.refresh(); return `Responses so far: ${this.simulatedResponses(this.st.quizzes.find((x) => x.id === d.quizId))}.`; }
        if (c === "close") {
          const q = this.st.quizzes.find((x) => x.id === d.quizId);
          const responses = Math.max(8, this.simulatedResponses(q));
          let seed = hash(q.id);
          const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
          const correct = q.questions.map(() => Math.floor(responses * (0.45 + rnd() * 0.5)));
          const wrongPct = Math.round(100 - (100 * correct.reduce((a, b) => a + b, 0)) / (responses * q.questions.length));
          this.updateQuiz(q.id, (x) => ({ ...x, state: "Closed", responses, perQuestionCorrect: correct, wrongPct }));
          const before = this.st.patterns.length;
          this.proposeFromQuiz(this.st.quizzes.find((x) => x.id === q.id));
          this.go("quiz_results");
          const n = this.st.patterns.length - before;
          return "Quiz closed. No more answers are accepted." + (n ? ` ${n === 1 ? "One follow-up suggestion is" : `${n} follow-up suggestions are`} waiting.` : "");
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
        if (c === "change") this.go("followup_change");
        if (c === "dismiss") { this.updatePattern(p.id, (x) => ({ ...x, state: "Dismissed" })); this.go("followups"); return "Dismissed."; }
        if (c === "type") this.go("followup_type");
        if (c === "resolved") { this.updatePattern(p.id, (x) => ({ ...x, state: "Resolved" })); this.go("followups"); return "Marked resolved."; }
        if (c === "still") { this.go("followup_type"); return "Still needs work. Choose another follow-up."; }
        break;
      }
      case "followup_change": if (c === "back") this.go("followup_pattern"); break;
      case "followup_type": {
        const p = this.st.patterns.find((x) => x.id === d.patternId);
        const base = this.lesson(p.lessonId) || this.topicLesson(p.topicId);
        const lang = this.classLang(base.classNum);
        if (c === "tik") {
          const instr = `A simpler version for a class that has not yet understood ${p.concept}.`;
          const t = await this.working("Preparing a simpler TIK…", () => this.gen.topicTik(this.chapterOf(base), this.topicOf(base), null, instr, null, lang));
          if (!t) return this.failed("prepare the simpler TIK");
          const nl = { ...base, id: this.newId(), tik: t, tikState: "DRAFT", tikBefore: base.tik, usePreviousContext: false, questionSets: [], questionsSkipped: false, audio: [], tikOnly: false, modeChosen: true, followUpFor: p.id, createdAt: this.now() };
          this.store.update((x) => ({ ...x, lessons: [...x.lessons, nl] }));
          this.updatePattern(p.id, (x) => ({ ...x, followUp: "Simpler TIK" }));
          d.lessonId = nl.id;
          this.go("tik_review");
          return "A simpler TIK is ready for your review." + this.langNote(base.classNum, t.lang);
        }
        if (c === "quiz") {
          const r = await this.working("Drafting a follow-up quiz…", () => this.gen.quiz(this.chapterOf(base), [this.topicOf(base)], lang));
          if (!r) return this.failed("draft the quiz");
          const q = this.newQuiz(this.chapterOf(base), [base.topicId], r, "Generated by SEEDS PROJECT-B for a follow-up");
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

  /** The fields a lesson for this topic would have, for a follow-up that started from a quiz. */
  topicLesson(topicId) {
    const ch = Curriculum.chapterOfTopic(topicId);
    return { id: null, classNum: ch.classNum, subject: ch.subject, chapterId: ch.id, topicId, tik: null };
  }

  /** A quiz for a chapter, or some of its topics: multiple choice, with an answer key that is never sent (v5.4 8.6). */
  newQuiz(ch, topicIds, r, provenance) {
    const q = { id: this.newId(), classNum: ch.classNum, chapterId: ch.id, topicIds, csKey: provenance.startsWith("Synced") ? ch.id : null,
      checks: r.checks, questions: r.questions, lang: r.lang || "English", provenance, state: "Draft",
      openUntil: null, openedAt: null, responses: 0, perQuestionCorrect: [], wrongPct: 0, classSize: 12 };
    this.store.update((x) => ({ ...x, quizzes: [...x.quizzes, q] }));
    return q;
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
      case "followup_change":
        this.updatePattern(this.draft.patternId, (x) => ({ ...x, concept: text }));
        this.go("followup_pattern");
        return `Changed to ${text}.`;
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
