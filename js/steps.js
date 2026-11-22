import { Curriculum, LANGS } from "./data.js";
import { Tier, Flow, makeStep, choice, section, inLang } from "./step.js";
import * as Offline from "./offline.js";
import { TikTabs } from "./tiktabs.js";

const NOT_APPROVED = "Created by SEEDS PROJECT-B — not yet approved";
const PLAN_STAGES = ["Lesson", "TIK", "Questions", "Audio", "Ready"];
const PERIOD_MINUTES = 40; // shortcut: a fixed period length, until the teacher's timetable gives the real one
const planProgress = (stage) => ({ labels: PLAN_STAGES, current: stage });
const numberWord = (n) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const orList = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " or " + xs[xs.length - 1]);

/** At most four options per step (FR-54): page longer lists with "More options". */
export function paged(all, page) {
  if (all.length <= 4) return all;
  const per = 3;
  const start = Math.min(page * per, Math.floor((all.length - 1) / per) * per);
  const slice = all.slice(start, start + per);
  return start + per < all.length
    ? [...slice, choice("__more", "More options", { words: ["more", "next options", "other"] })]
    : [...slice, choice("__first", "Back to the first options", { words: ["first options"] })];
}

const classChoices = () => Curriculum.coveredClasses.map((c) => choice(`c${c}`, `Class ${c}`, { words: [`class ${c}`, `${c}`, numberWord(c), `grade ${c}`] }));
const homeBtn = (label = "Back to Home") => choice("home", label);

/** Usage-history suggestion (FR-87, BR-29): offered first, with the reason; never skips a confirmation. */
function historySuggestion(e, stepId, choices) {
  const last = [...e.st.events].reverse().find((ev) => ev.stepId === stepId && ev.action === "choose" && choices.some((c) => c.id === ev.choice));
  if (!last) return [choices, null];
  const c = choices.find((x) => x.id === last.choice);
  const sug = { choiceId: c.id, reason: `because you chose it last time, on ${e.fmtDate(last.ts)}` };
  const first = { ...c, label: `Same as last time: ${c.label}`, suggested: true, words: [...c.words, c.label.toLowerCase()] };
  return [[first, ...choices.filter((x) => x.id !== c.id)], sug];
}

const TIK_HELP = `The TIK has tabs: ${TikTabs.titles.slice(0, -1).join(", ")} and Why. Say next tab, previous tab, or a tab's name.`;
const chapterKnown = (chx) => [["Class", `${chx.classNum}`], ["Subject", chx.subject], ["Chapter", `${chx.number}. ${chx.name}`]];
/** Quiz questions as sent by IVR ("Press 1: ..."); with key, the right answer is marked for the teacher. */
const quizQuestions = (e, q, key) => q.questions.map((y, i) => section(`Question ${i + 1}` + (y.topicId && Curriculum.topic(y.topicId) ? ` · ${Curriculum.topic(y.topicId).name}` : ""),
  [y.q, ...y.options.map((o, k) => `Press ${k + 1}: ${o}` + (key && k === y.answer ? " (answer)" : ""))], { lang: q.lang }));
const answerKey = (q) => section("Answer key", q.questions.map((y, i) => `Question ${i + 1}: ${y.answer + 1}, ${y.options[y.answer]}`), { lang: q.lang });
/** How the class did, for the class as a whole (v5.4 8.6): never per student. */
function quizAnalytics(e, q) {
  const s = e.quizStats(q);
  if (!s) return [section("How the class did", [q.state === "Live" ? `Responses so far: ${e.simulatedResponses(q)} of ${q.classSize}. Results show when you close the quiz.` : "Not shared to IVR yet."])];
  return [section("How the class did", [`${s.responses} of ${q.classSize} students answered. ${s.wrongPct}% of the answers were wrong.`,
      ...q.perQuestionCorrect.map((n, i) => `Question ${i + 1}: ${n} of ${s.responses} correct.`)]),
    section("Needs reinforcement", s.weak.length ? s.weak.map((x) => `${x.name}: ${x.wrongPct}% of the answers were wrong.`) : ["No concept stands out."])];
}

const tikPanel = (e, t, before, status) => ({ tik: t, before, suggestions: Offline.suggestions(t, e.chapterOf(e.lesson())).map((s) => s.text), status });

export function buildStep(e) {
  const r = e.route, d = e.draft, st = e.st;
  const l = e.lesson(), ch = e.chapterOf(l), tp = e.topicOf(l);
  const lang = l ? e.classLang(l.classNum) : null;
  // a lesson is for the whole chapter; only a follow-up names its topic
  const learn = ch ? ch.topics.map((t) => `${t.name}: ${t.definitions[0]}`) : [];
  const lessonKnown = l ? [["Class", `${l.classNum}`], ["Subject", l.subject], ["Chapter", `${ch && ch.number}. ${ch && ch.name}`], ...(l.followUpFor ? [["Follow-up on", ((e.st.patterns.find((x) => x.id === l.followUpFor) || {}).concept) || (tp && tp.name) || ""]] : []), ...(lang ? [["Language", lang]] : [])] : [];

  switch (r.id) {
    // ======================================================== platform
    case "voice_pref":
      return makeStep("voice_pref", Flow.SETUP, "Voice guide", "Do you want me to guide you by voice?",
        [choice("yes", "Yes, guide me by voice", { words: ["yes", "guide me"] }), choice("no", "No, I'll use buttons", { words: ["no", "buttons"] })],
        { announce: d.justSignedIn ? `Signed in as ${e.teacher && e.teacher.name}.` : null,
          sections: [section("About the voice guide", ["When you press the voice button, I listen and talk with you in English. With the guide on, I keep the conversation going until you say stop.", "Using the buttons never starts me. You can change this any time in Settings, or by saying 'turn off voice guide'."])] });

    case "home": return homeStep(e);

    case "menu":
      return makeStep("menu", Flow.HOME, "All features", "Which would you like?", paged([
        choice("plan", "Plan a lesson", { words: ["plan"] }),
        choice("teach_pick", "Teach a lesson", { words: ["teach"] }),
        choice("quiz", "Assessment or quiz", { words: ["quiz", "assessment"] }),
        choice("followups", "Follow-ups", { words: ["follow up", "remediation"] }),
        choice("workspace", "Workspace", { words: ["workspace", "my content", "library"] }),
      ], r.page), { secondary: [homeBtn()] });

    // ---------------- Workspace: everything from Content Studio and everything made by the teacher, to look at
    case "workspace": {
      const w = e.workspace();
      const count = (fromCS) => [plural(w.tiks.filter((x) => x.fromCS === fromCS).length, "TIK", "TIKs"),
        `${w.audio.filter((x) => x.fromCS === fromCS).length} audio`, plural(w.quizzes.filter((x) => x.fromCS === fromCS).length, "quiz", "quizzes")].join(", ");
      const kind = (id, label, xs, words) => choice(id, label, { words, enabled: xs.length > 0, whyDisabled: xs.length ? null : `No ${label.toLowerCase()} yet.` });
      return makeStep("workspace", Flow.WORKSPACE, "Workspace", "What would you like to look at?", [
        kind("tiks", "TIKs", w.tiks, ["tik", "tiks", "teaching guides"]),
        kind("audio", "Audio", w.audio, ["audio", "audios", "recordings"]),
        kind("quizzes", "Quizzes", w.quizzes, ["quiz", "quizzes", "tests"]),
      ], { announce: "Everything from Content Studio, and everything you made with SEEDS.",
        sections: [section("From Content Studio", [count(true)]), section("Made by you", [count(false)])], secondary: [homeBtn()] });
    }
    case "ws_list": {
      const kind = d.wsKind || "tiks", items = e.workspace()[kind] || [];
      const name = { tiks: "TIKs", audio: "Audio", quizzes: "Quizzes" }[kind], noun = { tiks: "TIKs", audio: "audio", quizzes: "quizzes" }[kind];
      const cs = items.filter((x) => x.fromCS), you = items.filter((x) => !x.fromCS);
      const opts = items.map((x) => choice(x.key, `${x.title} · ${x.fromCS ? "Content Studio" : `made by you, ${x.status.toLowerCase()}`}`, { words: [x.title.toLowerCase()] }));
      return makeStep("ws_list", Flow.WORKSPACE, name, items.length ? "Which one would you like to open?" : "There's nothing here yet.",
        items.length ? paged(opts, r.page) : [choice("ws_home", "Back to Workspace")], {
          sections: [
            section("From Content Studio", cs.length ? cs.map((x) => x.title) : [`Content Studio has no ${noun} yet.`]),
            section("Made by you", you.length ? you.map((x) => `${x.title} · ${x.status}`) : [`You haven't made any ${noun} yet.`]),
          ],
          secondary: items.length ? [choice("ws_home", "Back to Workspace"), homeBtn()] : [homeBtn()] });
    }
    case "ws_item": {
      const x = e.workspaceItem(d.wsItem);
      if (!x) return makeStep("ws_item", Flow.WORKSPACE, "Not found", "It's no longer in your workspace.", [choice("ws_back", "Back to the list")]);
      const known = [["From", x.fromCS ? "Content Studio" : "Made by you"], ["Status", x.status], ["Language", x.lang || "English"]];
      const back = choice("ws_back", "Back to the list", { words: ["back to the list", "the list"] });
      if (x.tik) return makeStep("ws_item", Flow.WORKSPACE, "TIK", "Anything else?", [back], {
        announce: `${x.title}. Say next tab, or a tab's name, to move through it.`, known, contentLang: x.tik.lang, secondary: [homeBtn()],
        tik: { tik: x.tik, before: null, suggestions: [], status: x.status },
        help: TIK_HELP });
      if (x.clip) {
        const playing = e.audio.isPlaying();
        return makeStep("ws_item", Flow.WORKSPACE, "Audio", playing ? "Playing. Stop it?" : "Play it?", [
          playing ? choice("stop", "Stop", { tier: Tier.READ, words: ["stop", "pause"] }) : choice("play", "Play", { tier: Tier.READ, words: ["play", "yes", "play it"] }), back,
        ], { announce: `${x.title}. About ${Math.max(1, Math.round(x.clip.durationSec / 60))} min.`, known: [...known, ["Length", `About ${Math.max(1, Math.round(x.clip.durationSec / 60))} minutes`]], contentLang: x.clip.lang,
          sections: x.clip.script ? [section("What it says", [x.clip.script], { lang: x.clip.lang })] : [], secondary: [homeBtn()] });
      }
      const q = x.quiz;
      const next = x.catalog ? choice("use_quiz", "Use this quiz", { words: ["use", "use this quiz", "yes"] })
        : { Draft: choice("review_quiz", "Review and approve", { words: ["review", "approve"] }), Approved: choice("share_quiz", "Share to IVR", { words: ["share", "share to ivr"] }),
          Live: choice("live_quiz", "See responses", { words: ["responses", "see responses"] }) }[q.state];
      return makeStep("ws_item", Flow.WORKSPACE, "Quiz", next ? `${next.label}?` : "Anything else?", [...(next ? [next] : []), back], {
        announce: `${x.title}. What it checks: ${q.checks}`, known: [...known, ["Questions", `${q.questions.length}`]], contentLang: q.lang, secondary: [homeBtn()],
        sections: [...quizQuestions(e, q, true), answerKey(q), ...(x.catalog ? [] : quizAnalytics(e, q))] });
    }

    case "awaiting": {
      const items = [];
      st.lessons.filter((x) => x.tikState === "DRAFT").forEach((x) => items.push(choice(`l:${x.id}`, `TIK: ${e.lessonName(x)}`)));
      st.lessons.filter((x) => x.questionSets.length && x.questionSets.some((q) => !q.approved) && x.tikState !== "DRAFT").forEach((x) => items.push(choice(`l:${x.id}`, `Questions: ${e.lessonName(x)}`)));
      st.lessons.filter((x) => x.audio.some((a) => !a.approved) && e.ready(x)).forEach((x) => items.push(choice(`l:${x.id}`, `Audio: ${e.lessonName(x)}`)));
      st.quizzes.filter((q) => q.state === "Draft").forEach((q) => items.push(choice(`q:${q.id}`, `Quiz: ${e.quizName(q)}`)));
      st.records.filter((x) => !x.saved).forEach((x) => items.push(choice(`r:${x.id}`, `Class record: ${e.lessonName(e.lesson(x.lessonId))}, ${e.fmtDate(x.createdAt)}`)));
      st.patterns.filter((p) => p.state === "Proposed").forEach((p) => items.push(choice(`p:${p.id}`, `Follow-up: ${p.concept}`)));
      const uniq = items.filter((c, i) => items.findIndex((x) => x.id === c.id) === i);
      return makeStep("awaiting", Flow.HOME, "Waiting for you", uniq.length ? "Which one would you like to open?" : "Nothing is waiting. Go back to Home?",
        uniq.length ? paged(uniq, r.page) : [homeBtn()], { secondary: uniq.length ? [homeBtn()] : [] });
    }

    case "teach_pick": {
      const ready = st.lessons.filter((x) => e.ready(x) && !e.taught(x)).reverse();
      if (!ready.length) return makeStep("teach_pick", Flow.TEACH, "Teach a lesson", "No lesson is ready to teach yet. Plan one now?", [choice("plan", "Plan a lesson"), homeBtn()]);
      return makeStep("teach_pick", Flow.TEACH, "Teach a lesson", "Which lesson?", paged(ready.map((x) => choice(`l:${x.id}`, e.readyName(x))), r.page), { secondary: [homeBtn()] });
    }

    case "next_class":
      return makeStep("next_class", Flow.PLAN, "What to teach next", "You don't have a plan yet. Which class?", classChoices(), { secondary: [homeBtn()] });

    // asked right after the class, wherever a class is chosen (plan, what to teach next, quiz)
    case "pick_subject": {
      const quiz = d.subjectNext === "quiz_chapter";
      return makeStep("pick_subject", quiz ? Flow.QUIZ : Flow.PLAN, quiz ? "Plan a quiz" : "Subject", `Which subject for class ${d.classNum}?`,
        Curriculum.subjects.map((s) => choice(s, s, { words: [s.toLowerCase(), ...(s === "Maths" ? ["math", "mathematics"] : [])] })),
        { known: [["Class", `${d.classNum}`]], secondary: [homeBtn()], ...(quiz ? {} : { progress: planProgress(0) }) });
    }

    case "next_chapter": {
      const n = e.nextChapter(d.classNum, d.subject);
      return makeStep("next_chapter", Flow.PLAN, "What to teach next", `Start with chapter ${n.number}, ${n.name}, or tell me the chapter you're on.`,
        [choice("start", `Start with chapter ${n.number}`, { words: ["start", "yes", n.name.toLowerCase()] }), choice("other", "Choose another chapter", { words: ["another", "other", "choose"] })],
        { known: [["Class", `${d.classNum}`], ["Subject", d.subject]], sections: [section("From the textbook contents", Curriculum.forClass(d.classNum, d.subject).map((c) => `Chapter ${c.number}: ${c.name}`))] });
    }

    case "class_lang": {
      const c = d.langFor;
      return makeStep("class_lang", Flow.SETUP, `Class ${c} language`, `What language do you teach class ${c} in?`,
        LANGS.map((g) => choice(g, g, { tier: Tier.CHANGE, words: [g.toLowerCase(), `in ${g.toLowerCase()}`],
          readBack: `I'll set class ${c} to ${g}. TIKs, lesson audio, questions and quizzes for class ${c} will be in ${g}.` + (g === "English" ? "" : " I will still speak to you in English.") })),
        { announce: "I ask this once for each class.", help: "This sets the language of what I prepare for this class. You can change it later in Settings." });
    }

    // ======================================================== F3 Plan the lesson
    case "plan_class":
      return makeStep("plan_class", Flow.PLAN, "Plan a lesson", "Which class?", classChoices(), {
        help: "With the voice guide you can also say the whole lesson at once, for example: plan the next class 7 science lesson.",
        sections: [section("Covered", ["SEEDS covers science and maths for classes 6, 7 and 9."])], secondary: [homeBtn()], progress: planProgress(0) });

    case "plan_chapter": {
      const c = d.classNum != null ? d.classNum : 6;
      const next = e.nextChapter(c, d.subject);
      const list = Curriculum.forClass(c, d.subject).sort((a, b) => (a.id === (next && next.id) ? -1 : a.number) - (b.id === (next && next.id) ? -1 : b.number))
        .map((x) => choice(x.id, `Chapter ${x.number}: ${x.name}` + (next && x.id === next.id ? " (next)" : ""), { words: [x.name.toLowerCase(), `chapter ${x.number}`], suggested: !!next && x.id === next.id }));
      return makeStep("plan_chapter", Flow.PLAN, "Chapter", "Which chapter?", paged(list, r.page), { known: [["Class", `${c}`], ["Subject", d.subject]], progress: planProgress(0),
        suggestion: next ? { choiceId: next.id, reason: e.st.sessions.some((x) => x.endedAt != null && (e.lesson(x.lessonId) || {}).classNum === c && (e.lesson(x.lessonId) || {}).subject === d.subject) ? "because it's where your class is up to" : "because it comes first in the textbook" } : null });
    }

    case "plan_confirm": {
      const chx = Curriculum.chapter(d.chapterId);
      const where = `chapter ${chx && chx.number}, ${chx && chx.name}`;
      const taught = !!chx && st.sessions.some((x) => x.endedAt != null && (e.lesson(x.lessonId) || {}).classNum === chx.classNum && (e.lesson(x.lessonId) || {}).subject === chx.subject);
      return makeStep("plan_confirm", Flow.PLAN, "Your lesson", taught ? `Next is ${where}. Continue from here?` : `Start with ${where}?`,
        [choice("yes", "Yes, continue", { words: ["yes", "right", "correct", "continue"] }), choice("change", "Change something", { words: ["no", "change"] })],
        { known: [["Class", `${chx && chx.classNum}`], ["Subject", chx && chx.subject], ["Chapter", `${chx && chx.number}. ${chx && chx.name}`],
          ...(chx && e.classLang(chx.classNum) ? [["Language", e.classLang(chx.classNum)]] : [])],
          progress: planProgress(0) });
    }

    // everything prepared in one go: the teacher reviews it all in a row, or opens one piece
    case "plan_review": {
      const sets = (l && l.questionSets) || [], clips = (l && l.audio) || [];
      const tikStatus = !l || !l.tik ? "Not prepared" : { APPROVED: "Approved", SYNCED_IN_USE: "From Content Studio, used as it is" }[l.tikState] || "Not approved yet";
      const todo = !!l && !e.planningDone(l);
      return makeStep("plan_review", Flow.PLAN, "Review your lesson", todo ? "Shall we go through it now?" : "Everything is approved. Finish?", [
        choice("review", todo ? "Review everything" : "Finish", { words: ["yes", "review", "review everything", "go through it", "finish"] }),
        choice("tik", "Open the TIK", { words: ["tik", "the tik", "open the tik"], enabled: !!(l && l.tik), whyDisabled: "No TIK yet." }),
        choice("questions", "Open the questions", { words: ["questions", "the questions", "open the questions"], enabled: sets.length > 0, whyDisabled: "No questions yet." }),
        choice("audio", "Open the audio", { words: ["audio", "the audio", "open the audio"], enabled: clips.length > 0, whyDisabled: "No audio yet." }),
      ], { announce: todo ? "Ready. Please review your lesson." : "Your lesson is ready.", known: lessonKnown, progress: planProgress(1), secondary: [homeBtn("Later")],
        sections: [
          section("TIK", [l && l.tik ? `${l.tik.scope === "topic" ? "Topic" : "Chapter"} TIK · ${tikStatus}` : tikStatus]),
          section("Questions", [sets.length ? `${plural(sets.length, "set", "sets")}, for the overview and each topic · ${sets.every((s) => s.approved) ? "Approved" : "Not approved yet"}` : l && l.questionsSkipped ? "Skipped" : "Not prepared"]),
          section("Audio", clips.length ? clips.map((a) => `${a.name} · ${a.approved ? "In use" : "Not used yet"}`) : [l && l.tikOnly ? "Taught from the TIK, no audio" : "Not prepared"]),
        ] });
    }

    case "plan_tik_source":
      if (ch && ch.syncedTik) return makeStep("plan_tik_source", Flow.PLAN, "Chapter TIK", "A TIK is ready for this chapter. Use it as it is, or open it and check it?",
        [choice("use_as_is", "Use as it is", { words: ["use", "as it is", "use it"] }), choice("check", "Open and check it", { words: ["check", "check it", "open", "open it", "hear", "read", "change it"] })],
        { announce: "Synced from Content Studio." + e.langNote(l.classNum, ch.syncedTik.lang, true), known: lessonKnown, progress: planProgress(1) });
      return makeStep("plan_tik_source", Flow.PLAN, "Chapter TIK", "Shall I build a chapter TIK from the textbook?",
        [choice("build", "Build chapter TIK", { words: ["build", "yes"] }), homeBtn("Not now")],
        { announce: "No TIK from Content Studio for this chapter." + (e.prepLine(l && l.classNum) ? " " + e.prepLine(l.classNum) : ""), known: lessonKnown, progress: planProgress(1),
          sections: [section("Sources I will use", [`Course for ${ch && ch.name} (Content Studio, sample)`, "Project A remediated textbook where available, otherwise existing Vision Empower content"])] });

    case "tik_view": {
      const t = (l && l.tik) || (ch && ch.syncedTik);
      const panel = t ? tikPanel(e, t, null, l && l.tikState === "SYNCED_IN_USE" ? "In use as it is" : "Not used yet") : null;
      const has = panel && panel.suggestions.length;
      return makeStep("tik_view", Flow.PLAN, "Chapter TIK", has ? "Use it as it is, apply the suggested changes, or ask for a change?" : "Use it as it is, or ask for a change?", [
        choice("use_as_is", "Use as it is", { words: ["use", "as it is", "use it"] }),
        ...(has ? [choice("apply_suggestions", "Apply suggested changes", { words: ["apply", "apply suggestions", "suggested changes", "accept"] })] : []),
        choice("change", "Ask for a change", { words: ["change", "ask for a change", "edit"] }),
      ], { announce: "Synced from Content Studio. Say next tab, or a tab's name, to move through it.", known: lessonKnown, tik: panel, progress: planProgress(1), contentLang: t && t.lang,
        help: TIK_HELP });
    }

    case "tik_review": {
      const isDraft = l && l.tikState === "DRAFT";
      const panel = l && l.tik ? tikPanel(e, l.tik, l.tikBefore, { APPROVED: "Approved", SYNCED_IN_USE: "In use as it is" }[l.tikState] || "Not yet approved") : null;
      const has = panel && panel.suggestions.length;
      const choices = isDraft ? [
        choice("approve", "Approve", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve this ${l.tik.scope} TIK for ${ch.name}, so it can be used in class.` }),
        ...(has ? [choice("apply_suggestions", "Apply suggested changes", { words: ["apply", "apply suggestions", "suggested changes", "accept"] })] : []),
        choice("change", "Ask for a change", { words: ["change", "ask for a change", "edit"] }),
        choice("regenerate", "Try again", { words: ["try again", "regenerate", "again", "new version"] }),
      ] : [choice("continue", "Continue", { words: ["continue", "next"] }), choice("edit", "Change it", { words: ["change", "edit"] })];
      return makeStep("tik_review", Flow.PLAN, "Review the TIK", isDraft ? "Approve this TIK, or change it first?" : "This TIK is approved. Continue?", choices, {
        banner: isDraft ? NOT_APPROVED : null,
        announce: `${l && l.tik && l.tik.provenance}.` + (l && l.tik && l.tik.instruction ? ` Your request: ${l.tik.instruction}.` : "") +
          (has ? ` There ${panel.suggestions.length === 1 ? "is 1 suggested change" : `are ${panel.suggestions.length} suggested changes`} on the Summary tab.` : ""),
        known: lessonKnown, tik: panel, progress: planProgress(1), contentLang: l && l.tik && l.tik.lang,
        help: TIK_HELP + " Say undo to go back to the previous version." });
    }

    case "tik_change": {
      const t = (l && l.tik) || (ch && ch.syncedTik);
      return makeStep("tik_change", Flow.PLAN, "Change the TIK", "What should I change? You can name one activity or the whole TIK.",
        [choice("back", "Back to the TIK", { words: ["back"] })],
        { known: lessonKnown, progress: planProgress(1), contentLang: t && t.lang,
          tik: t ? tikPanel(e, t, l && l.tikBefore, l && l.tikState === "APPROVED" ? "Approved" : "Not yet approved") : null,
          freeSpeech: { prompt: "For example: make the activities work in pairs, or remove activity 2", longWindow: true },
          help: e.gen.online ? null : Offline.REVISE_HINT });
    }

    case "checkpoint":
      if (d.checkpointFor === "tik_regen") return makeStep("checkpoint", Flow.PLAN, "Checkpoint", `You've tried ${d.tries} times. Keep going, or stop and review what you have?`,
        [choice("stop", "Stop and review", { words: ["stop", "review"] }), choice("keep", "Keep trying", { words: ["keep"] })], { progress: planProgress(1) });
      return makeStep("checkpoint", Flow.PLAN, "Checkpoint", `You've asked for ${d.changeCount} changes. Keep refining, or stop and review what you have?`,
        [choice("keep", "Keep refining", { words: ["keep", "refine"] }), choice("stop", "Stop and review", { words: ["stop", "review"] })], { progress: planProgress(d.checkpointFor === "qs" ? 2 : 1) });

    // ======================================================== F17 at planning
    case "qs_offer":
      return makeStep("qs_offer", Flow.PLAN, "Questions", "Shall I prepare questions for each topic? These are also your discussion questions after the audio.",
        [choice("prepare", "Prepare questions", { words: ["prepare", "yes"] }), choice("skip", "Skip", { words: ["skip", "no"] })],
        { known: lessonKnown, progress: planProgress(2), announce: e.prepLine(l && l.classNum) });

    case "qs_review": {
      const sets = (l && l.questionSets) || [];
      const qlang = sets[0] && sets[0].lang;
      return makeStep("qs_review", Flow.PLAN, "Review the questions", "Approve these questions, use only the Course's questions, ask for a change, or hear them?", [
        choice("approve", "Approve questions", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve ${sets.length} question sets, for the overview and each topic.` }),
        choice("use_course", "Use only the Course's questions", { words: ["course", "use the course", "course questions", "as they are"] }),
        choice("change", "Ask for a change", { words: ["change"] }),
        choice("hear", "Hear them", { tier: Tier.READ, words: ["hear", "read"] }),
      ], { banner: sets.some((s) => !s.approved) ? NOT_APPROVED : null, known: lessonKnown, progress: planProgress(2), contentLang: qlang,
        sections: sets.map((s) => section(s.title, [...s.check.map((q, i) => `Check: ${q}` + (i < s.fromCourse ? " (from the Course)" : "")), ...s.discussion.map((q) => `Discussion: ${q}`)], { lang: s.lang })) });
    }

    case "qs_change":
      return makeStep("qs_change", Flow.PLAN, "Change the questions", "What should I change in the questions?", [choice("back", "Back to the questions")], {
        known: lessonKnown, progress: planProgress(2), freeSpeech: { prompt: "For example: make the questions easier, or fewer questions", longWindow: true },
        help: e.gen.online ? null : "I understand: easier, harder, fewer questions, more questions." });

    // ======================================================== F5 Prepare audio
    case "audio_offer":
      if (!(ch && ch.audio)) return makeStep("audio_offer", Flow.PLAN, "Audio", "Content Studio has no audio for this chapter, so you'll teach from the TIK. Continue?",
        [choice("tik_only", "Continue with the TIK", { words: ["continue", "yes", "okay", "tik only"] })], { known: lessonKnown, progress: planProgress(3) });
      return makeStep("audio_offer", Flow.PLAN, "Audio", "Audio from Content Studio is ready. Use it?",
        [choice("use", "Use it", { words: ["use", "use it", "yes"] }), choice("tik_only", "Teach without it", { words: ["without", "teach without it", "no", "tik only"] })],
        { known: lessonKnown, progress: planProgress(3), announce: ch && ch.audio ? `It is a recording of the whole chapter, about ${ch.audio.minutes} minutes.` : null });

    case "audio_review": {
      const clip = l ? e.focusClip(l) : null;
      const clips = (l && l.audio) || [];
      const choices = clip && !clip.approved ? [
        choice("play", "Play preview", { tier: Tier.READ, words: ["play", "preview", "listen"] }),
        choice("use", "Use it", { words: ["use", "use it", "yes"] }),
        choice("without", "Teach without it", { words: ["without", "teach without it", "no"] }),
      ] : [choice("play", "Play preview", { tier: Tier.READ, words: ["play"] }), choice("done", "Done", { words: ["done", "yes"] })];
      return makeStep("audio_review", Flow.PLAN, "Lesson audio",
        clip && !clip.approved ? "Audio from Content Studio is ready. Play it, use it, or teach without it?" : "This audio is in use. Done?", choices, {
          announce: clip ? `${clip.name}. ${clip.provenance}` + (clip.approved ? ", in use." : ", not used yet.") : null,
          known: lessonKnown, progress: planProgress(3), contentLang: clip && clip.lang,
          secondary: e.audio.isPlaying() ? [choice("stop_preview", "Stop preview", { words: ["stop preview", "pause"] })] : [],
          sections: clips.map((a) => section(`${a.name} · ${a.provenance}` + (a.approved ? " · in use" : " · not used yet") + (a.lang && a.lang !== "English" ? ` · ${a.lang}` : ""),
            a.src ? [`A recording, about ${Math.round(a.durationSec / 60)} minutes. Set the speaker volume high.`]
              : [`About ${a.durationSec} seconds. Loudness: played by this device's voice, so it cannot be measured here. Set the speaker volume high.`, `Script: ${a.script}`], { lang: a.lang })) });
    }

    case "lesson_saved": {
      const n = e.approvedAudio(l).length;
      return makeStep("lesson_saved", Flow.PLAN, "Saved", "Where would you like to go?", [
        choice("home", "Back to Home", { words: ["home"] }),
        choice("open", "Open lesson", { words: ["open", "open lesson", "teach"] }),
      ], { announce: "Lesson saved and ready to teach." + (n === 0 ? " Taught from the TIK, no audio." : ""), known: lessonKnown, progress: planProgress(4) });
    }

    // ======================================================== F6 / F7 Teaching
    case "teach_start": {
      const ok = e.ready(l);
      return makeStep("teach_start", Flow.TEACH, "Start class", "Start class?", [
        choice("start", "Start class", { words: ["start", "start class", "yes"], enabled: ok, whyDisabled: "This lesson has no ready TIK yet, so it cannot be taught. Say 'prepare it'." }),
        ...(!ok ? [choice("prepare", "Prepare it", { words: ["prepare"] })] : []),
        homeBtn(),
      ], { announce: `${e.lessonName(l)}. ` + (ok ? (e.approvedAudio(l).length ? "Ready to teach." : "Ready to teach, no audio yet.") + (e.resumeAt(l) ? ` It continues from ${e.resumeName(l)}, where the last class stopped.` : "") : "Not ready."),
        known: lessonKnown, contentLang: l && l.tik && l.tik.lang,
        sections: [...(learn.length ? [section("What students learn (Course)", learn)] : []), ...(l && l.tik ? [section("Objectives", l.tik.objectives, { lang: l.tik.lang }), section("Materials required", TikTabs.materials(l.tik), { lang: l.tik.lang })] : [])] });
    }

    case "teach_step": {
      const s = e.session() || e.activeSession();
      const steps = l && l.tik ? TikTabs.classSteps(l.tik) : [];
      const i = Math.min(Math.max(0, (s && s.stepIndex) || 0), Math.max(0, steps.length - 1));
      const cur = steps[i];
      const hasAudio = e.approvedAudio(l).length > 0;
      const tl = l && l.tik && l.tik.lang;
      // questions are offered only if they were prepared before class (8.4)
      const hasQs = !!l && l.questionSets.some((q) => q.approved && q.check.length);
      const what = ["play audio", ...(hasQs ? ["learning check"] : [])].join(", ");
      return makeStep("teach_step", Flow.TEACH, `Step ${i + 1} of ${steps.length}: ${cur ? cur.name : ""}`,
        i < steps.length - 1 ? `Next step, ${what}, or end class?` : `This is the last step. ${cap(what)}, or end class?`, [
          ...(i < steps.length - 1 ? [choice("next", "Next step", { words: ["next", "next step", "next activity"] })] : []),
          choice("audio", "Play audio", { words: ["play audio", "audio", "play"], enabled: hasAudio, whyDisabled: "No audio for this lesson. Teacher-led works as usual." }),
          ...(hasQs ? [choice("lc", "Learning check", { words: ["learning check", "questions", "the questions"] })] : []),
          choice("end", "End class", { tier: Tier.COMMIT, words: ["end class", "end"], commitWord: "end class", readBack: "I'll end the class and ask what was covered." }),
        ], { announce: cur ? `${cur.name}. ` + inLang(tl, [...cur.lines, ...cur.acts.map(TikTabs.actText)].join(" ")) : null, inClass: true, contentLang: tl,
          known: [["Lesson", e.lessonName(l)], ["Method", "Your choice: activity, teacher-led, audio, discussion or tactile materials"]],
          sections: [...(i === 0 && learn.length ? [section("What students learn (Course)", learn)] : []),
            ...(cur && cur.lines.length ? [section(cur.name, cur.lines, { lang: tl })] : []),
            ...(cur ? cur.acts.map((a) => section(a.name, [`Materials required: ${a.materials.join(", ") || "None"}`, ...a.flow.map((x, k) => `${k + 1}. ${x}`)], { lang: tl })) : [])],
          secondary: i > 0 ? [choice("prev", "Previous step", { words: ["previous", "previous step", "previous activity"] })] : [],
          progress: { labels: steps.map((x) => x.short), current: i } });
    }

    case "audio_player": {
      const list = e.approvedAudio(l);
      const clip = list.find((a) => a.id === d.audioClipId) || list[0];
      const playing = e.audio.isPlaying();
      return makeStep("audio_player", Flow.TEACH, "Play audio", playing ? "Playing. Pause, or back to the lesson?" : "Play the audio?", [
        choice("toggle", playing ? "Pause" : "Play", { words: ["play", "pause", "resume"] }),
        choice("not_working", "Audio not working?", { words: ["not working", "audio not working", "no sound"] }),
        list.length > 1 ? choice("version", "Play a different version", { words: ["different version", "other version"] }) : choice("replay", "Replay", { words: ["replay", "again", "from the start"] }),
        choice("back", "Back to lesson", { words: ["back", "back to lesson"] }),
      ], { inClass: true, known: clip ? [["Audio", `${clip.name} · ${clip.provenance}`]] : [],
        sections: [section("Speaker", ["Audio plays from this device through the classroom speaker. Connect the speaker before class and set the volume high."])] });
    }

    case "audio_failed":
      return makeStep("audio_failed", Flow.TEACH, "Audio problem", "Retry, or continue teacher-led?",
        [choice("retry", "Retry", { words: ["retry", "try again"] }), choice("teacher_led", "Continue teacher-led", { words: ["teacher led", "continue"] })],
        { announce: "Audio is not playing.", inClass: true, help: "Check the speaker is switched on and connected, and the volume is up. If this device has no voice for the class language, teach this part yourself." });

    case "audio_finished": {
      const sets = l ? l.questionSets.filter((q) => q.approved && q.discussion.length) : [];
      return makeStep("audio_finished", Flow.TEACH, "Audio finished", "Back to the lesson, or replay?",
        [choice("back", "Back to lesson", { words: ["back", "lesson"] }), choice("replay", "Replay", { words: ["replay"] })],
        { announce: "Audio finished." + (sets.length ? " Discussion questions are on screen." : ""), inClass: true,
          sections: sets.map((q) => section(`Discussion: ${q.title}`, q.discussion, { lang: q.lang })) });
    }

    case "end_coverage": {
      // where the class stopped in the TIK, so the next class starts from there
      const steps = TikTabs.classSteps(l.tik), s = e.session();
      const i = Math.min((s && s.stepIndex) || 0, steps.length - 1);
      // time left in the period and a step still to go: suggest carrying on instead of ending early
      const left = s ? PERIOD_MINUTES - Math.floor((e.now() - s.startedAt) / 60000) : 0;
      const nudge = left >= 5 && i < steps.length - 1;
      return makeStep("end_coverage", Flow.TEACH, "End class", `Did you finish this step: ${steps[i].name}?`,
        [choice("done", "Yes, finished it", { words: ["yes", "finished", "done", "all covered"] }), choice("partway", "No, stopped partway", { words: ["no", "partway", "stopped", "some covered"] }),
          ...(nudge ? [choice("carry_on", "Carry on to the next step", { words: ["carry on", "continue", "keep going", "next step"] })] : [])],
        { inClass: true, known: [["Lesson", e.lessonName(l)], ["Step", `${i + 1} of ${steps.length}`]],
          announce: nudge ? `About ${left} minutes of the period are left. You could carry on with the next step: ${steps[i + 1].name}.` : null });
    }

    case "end_reason":
      return makeStep("end_reason", Flow.TEACH, "Reason", "Why was the rest not covered?", [
        choice("time", "Time ran out", { words: ["time", "time ran out"] }),
        choice("more_time", "Students needed more time", { words: ["more time", "students needed"] }),
        choice("device", "Device or connection issue", { words: ["device", "connection", "network"] }),
        choice("other", "Other", { words: ["other"] }),
      ], { inClass: true });

    case "end_reason_other":
      return makeStep("end_reason_other", Flow.TEACH, "Reason", "Say or type the reason.", [choice("back", "Back")],
        { inClass: true, freeSpeech: { prompt: "For example: teacher absent for half the period", longWindow: true } });

    case "lc_read": {
      const sets = l ? l.questionSets.filter((q) => q.approved && q.check.length) : [];
      return makeStep("lc_read", Flow.TEACH, "Learning check", "Shall I read the questions to the class?", [
        choice("read", "Read them aloud", { tier: Tier.READ, words: ["read", "yes", "read them", "read the questions"] }),
        choice("back", "Back to lesson", { words: ["back", "back to lesson"] }),
        choice("end", "End class", { tier: Tier.COMMIT, words: ["end class", "end"], commitWord: "end class", readBack: "I'll end the class and ask what was covered." }),
      ], { inClass: true, announce: "Ask the class these questions, or I can read them aloud. Students answer aloud.", contentLang: sets[0] && sets[0].lang,
        sections: sets.map((q) => section(q.title, q.check, { lang: q.lang })),
        help: "This is ungraded and for the whole class. Nothing about individual students is stored." });
    }

    case "lc_ask": {
      const key = d.lcQueue[d.lcIndex];
      const set = l && l.questionSets.find((q) => q.key === key);
      return makeStep("lc_ask", Flow.FOLLOWUP, `Learning check: ${set && set.title}`, "How many could answer: few, some, many or none?", [
        choice("few", "Few", { words: ["few"] }), choice("some", "Some", { words: ["some"] }),
        choice("many", "Many", { words: ["many", "most"] }), choice("none", "None", { words: ["none", "nobody"] }),
      ], { contentLang: set && set.lang,
        sections: [section("The questions", (set && set.check) || [], { lang: set && set.lang })],
        secondary: [choice("skip", "Skip", { words: ["skip"] })], help: "This is ungraded and for the whole class. Nothing about individual students is stored." });
    }

    // ======================================================== F9 Record the class
    case "record_draft": {
      const rec = st.records.find((x) => x.id === d.recordId);
      return makeStep("record_draft", Flow.FOLLOWUP, "Class record", "Anything to add on how the class responded?", [
        choice("prompts", "Quick prompts", { words: ["quick prompts", "prompts"] }),
        choice("review", "Review before saving", { words: ["review", "hear what will be saved", "preview"] }),
      ], { banner: rec && rec.saved ? null : NOT_APPROVED, announce: "I've filled in what the app already knows.",
        sections: [section("Pre-filled from the session", (rec && rec.prefilled) || []), section("Your notes", rec && rec.notes.length ? rec.notes : ["None yet. You can leave this blank."])],
        secondary: [choice("later", "Save as draft", { words: ["later", "draft", "save as draft"] })],
        freeSpeech: { prompt: "Say or type a note, for example: they found the poles part hard", longWindow: true } });
    }

    case "record_prompts":
      return makeStep("record_prompts", Flow.FOLLOWUP, "Quick prompts", "How did the class respond?", [
        choice("well", "Most followed well", { words: ["well", "followed"] }), choice("difficult", "Found it difficult", { words: ["difficult", "hard"] }),
        choice("mixed", "Mixed response", { words: ["mixed"] }), choice("materials", "Materials were missing", { words: ["materials", "missing", "devices"] }),
      ]);

    case "record_preview": {
      const rec = st.records.find((x) => x.id === d.recordId);
      return makeStep("record_preview", Flow.FOLLOWUP, "Before you save", "Save this record?", [
        choice("save", "Save", { tier: Tier.COMMIT, words: ["save"], commitWord: "save", enabled: !!(rec && rec.previewed), whyDisabled: "Please hear what will be stored first.", readBack: "I'll save this class record to your teaching history. Only you can see it." }),
        choice("change", "Change something", { words: ["change"] }),
        choice("later", "Save as draft", { words: ["later", "draft"] }),
      ], { announce: "Here is what will be stored, why, and who can see it.",
        sections: [
          section("What will be stored", [...((rec && rec.prefilled) || []), ...((rec && rec.notes) || []).map((n) => `Your note: ${n}`), ...(rec && rec.summary ? [`Summary: ${rec.summary}`] : [])]),
          section("Why", ["So your next lesson starts from what actually happened, and so SEEDS can suggest follow-up."]),
          section("Who can see it", ["Only you. Nothing is sent outside SEEDS. The class was not recorded. In this prototype it is stored only in this browser."]),
        ] });
    }

    case "record_saved": {
      const open = st.patterns.filter((p) => p.state === "Proposed").length;
      return makeStep("record_saved", Flow.FOLLOWUP, "Record saved", "Where would you like to go?",
        [...(open ? [choice("followups", "See follow-up suggestion", { words: ["follow up", "suggestion"] })] : []), homeBtn()], { announce: "Saved to your teaching history." });
    }

    // ======================================================== F8 Assessment/Quiz (v5.4 8.6)
    case "quiz_home": {
      const n = (state) => st.quizzes.filter((q) => q.state === state).length;
      return makeStep("quiz_home", Flow.QUIZ, "Assessment/Quiz", "Plan a quiz, or open your quizzes?", [
        choice("plan", "Plan a quiz", { words: ["plan", "plan a quiz", "new quiz", "make a quiz", "yes"] }),
        choice("mine", "Your quizzes", { words: ["my quizzes", "your quizzes", "quizzes", "results", "answers"] }),
      ], { sections: [
        section("Plan a quiz", ["Use a quiz from Content Studio, or make one for a whole chapter or some of its topics. Every question is multiple choice, with an answer key.",
          "Share to IVR sends only the questions. The answer key stays with you."]),
        section("Your quizzes", [`${n("Draft")} to approve, ${n("Approved")} ready to share, ${n("Live")} shared to IVR, ${n("Closed")} with results.`,
          "Every quiz is in your workspace with its answer key and how the class did."]),
      ], secondary: [homeBtn()] });
    }

    case "quiz_class":
      return makeStep("quiz_class", Flow.QUIZ, "Plan a quiz", "Which class is the quiz for?", classChoices(), { secondary: [homeBtn()] });

    case "quiz_chapter": {
      const c = d.classNum != null ? d.classNum : 6;
      return makeStep("quiz_chapter", Flow.QUIZ, "Plan a quiz", "Which chapter?",
        paged(Curriculum.forClass(c, d.subject).map((x) => choice(x.id, `Chapter ${x.number}: ${x.name}`, { words: [x.name.toLowerCase(), `chapter ${x.number}`] })), r.page),
        { known: [["Class", `${c}`], ["Subject", d.subject]] });
    }

    case "quiz_source": {
      const chx = Curriculum.chapter(d.chapterId);
      return makeStep("quiz_source", Flow.QUIZ, "Plan a quiz", "Content Studio has a quiz for this chapter. Use it, or make a new one?", [
        choice("use_cs", "Use the Content Studio quiz", { words: ["use", "use it", "content studio", "yes"] }),
        choice("make", "Make a new quiz", { words: ["make", "new", "make a new quiz", "generate"] }),
      ], { known: chapterKnown(chx), sections: [section("From Content Studio", [chx.syncedQuiz.checks])] });
    }

    case "quiz_scope": {
      const chx = Curriculum.chapter(d.chapterId);
      return makeStep("quiz_scope", Flow.QUIZ, "Plan a quiz", "A quiz on the whole chapter, or on some topics?", [
        choice("chapter", "The whole chapter", { words: ["whole chapter", "chapter", "all", "everything"] }),
        choice("topics", "Some topics", { words: ["some topics", "topics", "specific topics"] }),
      ], { known: chapterKnown(chx), sections: [section("Topics in this chapter", chx.topics.map((x) => x.name))] });
    }

    case "quiz_topics": {
      const chx = Curriculum.chapter(d.chapterId), picked = d.quizTopics;
      return makeStep("quiz_topics", Flow.QUIZ, "Choose topics", picked.length ? `${plural(picked.length, "topic", "topics")} chosen. Add another, or make the quiz?` : "Which topics? Choose one or more.", [
        ...chx.topics.map((x) => choice(x.id, (picked.includes(x.id) ? "Chosen: " : "") + x.name, { words: [x.name.toLowerCase()] })),
        choice("make", "Make the quiz", { words: ["make", "make the quiz", "done"], enabled: picked.length > 0, whyDisabled: "Choose at least one topic first." }),
      ], { known: chapterKnown(chx), help: "Choose a topic again to take it out." });
    }

    case "quiz_review": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      if (!q) return makeStep("quiz_review", Flow.QUIZ, "Quiz", "This quiz is no longer here. Go to Home?", [homeBtn()]);
      const approved = q.state !== "Draft", synced = q.provenance.startsWith("Synced");
      return makeStep("quiz_review", Flow.QUIZ, "Review the quiz",
        approved ? (q.state === "Approved" ? "This quiz is approved. Share it to IVR?" : "This quiz is already shared.") : synced ? "Hear the questions, or approve the quiz?" : "Hear the questions, approve, or make a new version?",
        approved ? [...(q.state === "Approved" ? [choice("share", "Share to IVR", { words: ["share", "share to ivr", "yes"] })] : []), homeBtn()] : [
          choice("hear", "Hear the questions", { tier: Tier.READ, words: ["hear", "read"] }),
          choice("approve", "Approve", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve this quiz with ${q.questions.length} questions and its answer key.` }),
          ...(synced ? [] : [choice("regenerate", "Make a new version", { words: ["regenerate", "try again", "new version", "new quiz"] })]),
        ], { banner: approved || synced ? null : NOT_APPROVED, announce: `${q.provenance}. What this quiz checks: ${q.checks}`, known: e.quizKnown(q), contentLang: q.lang,
          sections: [...quizQuestions(e, q, true), answerKey(q)] });
    }

    case "quiz_window": {
      const opt = (id, label) => choice(id, label, { words: [label.toLowerCase(), id] });
      const [choices, sug] = historySuggestion(e, "quiz_window", [opt("tomorrow", "Until tomorrow"), opt("friday", "Until Friday"), opt("three_days", "For three days")]);
      return makeStep("quiz_window", Flow.QUIZ, "Share to IVR", "How long should the quiz stay open?", choices, { suggestion: sug,
        known: e.quizKnown(st.quizzes.find((x) => x.id === d.quizId)), secondary: [homeBtn("Not now")] });
    }

    case "quiz_share": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      const until = d.quizUntil || "Friday evening";
      return makeStep("quiz_share", Flow.QUIZ, "Share to IVR", "Share to IVR?", [
        choice("share", "Share to IVR", { tier: Tier.COMMIT, words: ["share", "share to ivr", "send"], commitWord: "share",
          readBack: `I'll send the ${q.questions.length} questions by IVR call to each student's registered phone, open until ${until}. The answer key is not sent.` }),
        choice("when", "Change how long it stays open", { words: ["change", "how long", "until"] }),
      ], { announce: "Only the questions and their options go out. Students answer at home by an ordinary phone call, with a parent or another responsible adult present.",
        known: [...e.quizKnown(q), ["Open until", until]], contentLang: q.lang, secondary: [homeBtn("Not now")],
        sections: [...quizQuestions(e, q, false), section("Not sent", ["The answer key. It stays with you, in your workspace."])] });
    }

    case "quiz_live": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      return makeStep("quiz_live", Flow.QUIZ, "Shared to IVR", "Hear the number of responses, or close the quiz?", [
        choice("refresh", "How many responses?", { tier: Tier.READ, words: ["how many", "responses"] }),
        choice("close", "Close quiz now", { tier: Tier.COMMIT, words: ["close"], commitWord: "close", readBack: "I'll close the quiz now. No more answers will be accepted." }),
        homeBtn(),
      ], { announce: `Open until ${q && q.openUntil}.`, known: e.quizKnown(q),
        sections: [section("Status", [`Responses so far: ${q ? e.simulatedResponses(q) : 0} of ${q && q.classSize}.`, "Phone calls are simulated in this prototype."])] });
    }

    case "quiz_results": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      const open = st.patterns.filter((p) => p.state === "Proposed").length;
      const s = q && e.quizStats(q);
      return makeStep("quiz_results", Flow.QUIZ, "Quiz results", "Where would you like to go?",
        [...(open ? [choice("followups", "See follow-up suggestion", { words: ["follow up"] })] : []), homeBtn()], {
          announce: s ? `${s.responses} students answered. ${s.wrongPct}% of the answers were wrong.` : null, known: e.quizKnown(q),
          sections: q ? quizAnalytics(e, q) : [] });
    }

    // ======================================================== History
    case "history": {
      const h = e.history();
      const count = (xs, test) => xs.filter(test).length;
      const talk = [
        h.tiks.length ? `${plural(h.tiks.length, "approved TIK", "approved TIKs")}: ${count(h.tiks, (x) => x.done)} taught completely, ${count(h.tiks, (x) => x.started && !x.done)} taught partly, ${count(h.tiks, (x) => !x.started)} not taught yet.` : "No approved TIKs yet.",
        h.quizzes.length ? `${plural(h.quizzes.length, "approved quiz", "approved quizzes")}: ${count(h.quizzes, (x) => x.taken)} taken, ${count(h.quizzes, (x) => !x.taken)} not taken yet.` : "No approved quizzes yet.",
      ];
      return makeStep("history", Flow.HISTORY, "History", "Open follow-ups and class records, or go back to Home?", [
        choice("followups", "Follow-ups and class records", { words: ["follow ups", "follow-ups", "class records", "records"] }), homeBtn(),
      ], { announce: talk.join(" "),
        sections: [
          section("TIKs", h.tiks.length ? h.tiks.map((x) => `${x.title} · ${x.status}`) : ["None approved yet. A TIK shows here once it is approved, or used as it is from Content Studio."]),
          section("Quizzes", h.quizzes.length ? h.quizzes.map((x) => `${x.title} · ${x.status}`) : ["None approved yet."]),
        ] });
    }

    // ======================================================== F10 Remediation
    case "followups": {
      const open = st.patterns.filter((p) => p.state === "Proposed" || p.state === "Confirmed");
      const saved = st.records.filter((x) => x.saved).slice(-3).reverse();
      return makeStep("followups", Flow.FOLLOWUP, "Follow-ups", open.length ? "Which follow-up would you like to open?" : "No follow-ups are waiting. Back to Home?",
        open.length ? paged(open.map((p) => choice(`p:${p.id}`, `Follow up: ${p.concept} (${p.state.toLowerCase()})`, { words: [p.concept.toLowerCase()] })), r.page) : [homeBtn()], {
          sections: [section("Recent class records", saved.length ? saved.map((x) => `${e.fmtDate(x.createdAt)}: ${e.lessonName(e.lesson(x.lessonId))}. ${x.summary.slice(0, 160)}`) : ["None saved yet."])],
          secondary: open.length ? [homeBtn()] : [] });
    }

    case "followup_pattern": {
      const p = st.patterns.find((x) => x.id === d.patternId);
      const text = `${p && p.concept}: ${p ? p.signals.join("; ") : ""}.`;
      if (p && p.state === "Proposed") return makeStep("followup_pattern", Flow.FOLLOWUP, "Follow-up suggestion", `${p.concept} needs follow-up. Confirm, change or dismiss?`, [
        choice("confirm", "Confirm", { tier: Tier.CHANGE, words: ["confirm", "yes"], readBack: `I'll mark ${p.concept} as needing follow-up with the class.` }),
        choice("change", "Change it", { words: ["change", "change it"] }),
        choice("dismiss", "Dismiss", { tier: Tier.CHANGE, words: ["dismiss", "no"], readBack: "I'll dismiss this suggestion. Nothing else changes." }),
      ], { announce: text, banner: NOT_APPROVED, sections: [section("Results behind it", p.signals)] });
      if (p && p.followUp) return makeStep("followup_pattern", Flow.FOLLOWUP, "Re-check", "After teaching the follow-up: resolved, or still needs work?", [
        choice("resolved", "Resolved", { tier: Tier.CHANGE, words: ["resolved"], readBack: `I'll mark ${p.concept} as resolved.` }), choice("still", "Still needs work", { words: ["still", "needs work"] }),
      ], { announce: `${text} Follow-up prepared: ${p.followUp}.` });
      return makeStep("followup_pattern", Flow.FOLLOWUP, "Follow-up", "Prepare a follow-up now?", [choice("type", "Prepare follow-up", { words: ["prepare", "yes"] }), homeBtn()], { announce: text });
    }

    case "followup_change":
      return makeStep("followup_change", Flow.FOLLOWUP, "Change the follow-up", "Which concept needs follow-up?", [choice("back", "Back", { words: ["back"] })],
        { freeSpeech: { prompt: "For example: the north and south poles", longWindow: true } });

    case "followup_type": {
      const p = st.patterns.find((x) => x.id === d.patternId);
      const cls = p && (p.classNum != null ? p.classNum : (e.lesson(p.lessonId) || {}).classNum);
      return makeStep("followup_type", Flow.FOLLOWUP, "Follow-up content", "A simpler activity in a TIK, or a new quiz?",
        [choice("tik", "A simpler TIK", { words: ["tik", "simpler", "activity"] }), choice("quiz", "A new quiz", { words: ["quiz", "new quiz"] })],
        { announce: cls != null ? e.prepLine(cls) : null, sections: [section("What happens", ["It goes through the normal approval step before it is used."])] });
    }

    default:
      return makeStep(r.id, Flow.HOME, "SEEDS", "Go to Home?", [homeBtn()]);
  }
}

function homeStep(e) {
  const st = e.st, sections = [], choices = [];
  const active = e.activeSession();
  if (active) {
    sections.push(section("Class in progress", [e.lessonName(e.lesson(active.lessonId))], { emphasis: true }));
    choices.push(choice("continue", "Continue teaching", { words: ["continue", "continue teaching"] }));
  }
  {
    const ready = st.lessons.filter((x) => e.ready(x) && !e.taught(x));
    if (ready.length) {
      sections.push(section("Ready to teach", ready.map((x) => e.readyName(x)), { emphasis: !active }));
      choices.push(choice("teach_pick", "Teach a ready lesson", { words: ["teach"] }));
    }
    const todo = e.unfinishedLesson();
    if (todo) {
      sections.push(section("Being planned", [e.lessonName(todo)], { emphasis: !active && !ready.length }));
      choices.push(choice("resume_plan", "Carry on planning", { words: ["carry on", "carry on planning", "continue planning", "finish planning", "finish it"] }));
    }
    if (!st.lessons.length && !st.sessions.length) sections.push(section("No lessons yet", ["Ask what to teach next, or plan a lesson."]));
    // Home always offers a way forward, whatever state the lessons are in
    // after a TIK is taught, Home offers what comes next: the chapter's next topic, or the next chapter
    const up = !active && !todo && !ready.length ? e.upNext() : null;
    if (up) { sections.push(section("Up next", [`Class ${up.chapter.classNum} ${up.chapter.subject.toLowerCase()}, ${e.upNextText(up)}`], { emphasis: true })); choices.push(choice("plan_next", "Plan the next lesson", { words: ["plan the next lesson", "plan next", "next lesson", "yes", "okay", "sure"] })); }
    if (!todo && !ready.length && !up) choices.push(choice("next_topic", "What should I teach next?", { words: ["what should i teach", "teach next", "lesson plan", "what is my lesson plan"] }));
    choices.push(choice("plan", "Plan a lesson", { words: ["plan"] }));
  }
  const waiting = [];
  const n1 = st.lessons.filter((x) => x.tikState === "DRAFT").length; if (n1) waiting.push(`${n1} ${n1 === 1 ? "TIK" : "TIKs"} waiting for approval`);
  const n2 = st.lessons.filter((x) => e.ready(x) && x.audio.some((a) => !a.approved)).length; if (n2) waiting.push(`${n2} audio waiting for approval`);
  const n3 = st.quizzes.filter((q) => q.state === "Draft").length; if (n3) waiting.push(`${n3} ${n3 === 1 ? "quiz" : "quizzes"} waiting for approval`);
  const n4 = st.records.filter((x) => !x.saved).length; if (n4) waiting.push(`${n4} class record ${n4 === 1 ? "draft" : "drafts"}`);
  const n5 = st.patterns.filter((p) => p.state === "Proposed").length; if (n5) waiting.push(`${n5} follow-up ${n5 === 1 ? "suggestion" : "suggestions"}`);
  if (waiting.length) { sections.push(section("Waiting for you", waiting)); choices.push(choice("awaiting", "Review waiting items", { words: ["waiting", "review", "approval"] })); }
  // the first action answers "yes" to the question Home asks, so a teacher can just agree (FR-62, FR-87)
  if (choices[0] && ["continue", "resume_plan"].includes(choices[0].id)) choices[0] = { ...choices[0], words: [...choices[0].words, "yes", "okay", "sure", "let's do it"] };
  const primary = [...choices.filter((c, i) => choices.findIndex((x) => x.id === c.id) === i).slice(0, 3), choice("menu", "More options", { words: ["more", "more options", "menu"] })];
  // spoken like a colleague catching you up, not a list of headings
  const talk = [];
  if (e.draft.justSignedIn) { talk.push(`Hello, ${e.teacher && e.teacher.name}.`); e.draft.justSignedIn = false; }
  let question = "What would you like to do?";
  if (active) { talk.push(`You have a class going on: ${e.lessonName(e.lesson(active.lessonId))}.`); question = "Shall we carry on with it?"; }
  if (!active) {
    const ready = st.lessons.filter((x) => e.ready(x) && !e.taught(x)).length;
    if (ready) talk.push(`You have ${plural(ready, "lesson", "lessons")} ready to teach.`);
    else if (!st.lessons.length) talk.push("You don't have any lessons yet. I can tell you what to teach next, or help you plan a lesson.");
    const todo = e.unfinishedLesson();
    if (todo && !ready) { talk.push(`You were planning ${e.lessonName(todo)}.`); question = "Shall we carry on with it?"; }
    const up = !todo && !ready ? e.upNext() : null;
    if (up) { talk.push(`Next for class ${up.chapter.classNum} is ${e.upNextText(up)}.`); question = "Shall we plan it?"; }
  }
  if (waiting.length) talk.push(`You ${talk.some((x) => !x.startsWith("Hello")) ? "also " : ""}have ${orList(waiting.map((w) => w.replace(/ waiting for approval$/, " to approve"))).replace(/ or ([^,]*)$/, " and $1")}.`);
  return makeStep("home", Flow.HOME, "Home", question, primary, { announce: talk.join(" ") || null, sections,
    help: "With the voice guide you can say what you want in one sentence, for example: plan the next class 7 science lesson." });
}
