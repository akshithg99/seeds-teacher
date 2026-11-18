import { Curriculum, LANGS } from "./data.js";
import { Tier, Flow, makeStep, choice, section, inLang } from "./step.js";
import { DAYS } from "./matcher.js";
import * as Offline from "./offline.js";

export const PLANNED_MINUTES = 40;
const NOT_APPROVED = "Created by SEEDS 2.0 — not yet approved";
const PLAN_STAGES = ["Lesson", "TIK", "Questions", "Audio", "Ready"];
const planProgress = (stage) => ({ labels: PLAN_STAGES, current: stage });
const numberWord = (n) => ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"][n] || String(n);
const ordinal = (n) => ["", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth"][n] || `${n}th`;
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

const tikPanel = (e, t, before, status) => ({ tik: t, before, suggestions: Offline.suggestions(t, e.chapterOf(e.lesson())).map((s) => s.text), status });

export function buildStep(e) {
  const r = e.route, d = e.draft, st = e.st;
  const l = e.lesson(), ch = e.chapterOf(l), tp = e.topicOf(l);
  const lang = l ? e.classLang(l.classNum) : null;
  const lessonKnown = l ? [["Class", `${l.classNum}`], ["Subject", l.subject], ["Chapter", `${ch && ch.number}. ${ch && ch.name}`], ["Topic", (tp && tp.name) || ""], ...(lang ? [["Language", lang]] : [])] : [];

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
        choice("schedule", "My schedule", { words: ["schedule", "calendar", "week"] }),
        choice("plan", "Plan a lesson", { words: ["plan"] }),
        choice("teach_pick", "Teach a lesson", { words: ["teach"] }),
        choice("quiz", "Assessment or quiz", { words: ["quiz", "assessment"] }),
        choice("followups", "Follow-ups", { words: ["follow up", "remediation"] }),
      ], r.page), { secondary: [homeBtn()] });

    case "awaiting": {
      const items = [];
      st.lessons.filter((x) => x.tikState === "DRAFT").forEach((x) => items.push(choice(`l:${x.id}`, `TIK: ${e.lessonName(x)}`)));
      st.lessons.filter((x) => x.questionSets.length && x.questionSets.some((q) => !q.approved) && x.tikState !== "DRAFT").forEach((x) => items.push(choice(`l:${x.id}`, `Questions: ${e.lessonName(x)}`)));
      st.lessons.filter((x) => x.audio.some((a) => !a.approved) && e.ready(x)).forEach((x) => items.push(choice(`l:${x.id}`, `Audio: ${e.lessonName(x)}`)));
      st.quizzes.filter((q) => q.state === "Draft").forEach((q) => items.push(choice(`q:${q.id}`, `Quiz: ${e.lessonName(e.lesson(q.lessonId))}`)));
      st.records.filter((x) => !x.saved).forEach((x) => items.push(choice(`r:${x.id}`, `Class record: ${e.lessonName(e.lesson(x.lessonId))}, ${e.fmtDate(x.createdAt)}`)));
      st.patterns.filter((p) => p.state === "Proposed").forEach((p) => items.push(choice(`p:${p.id}`, `Follow-up: ${p.concept}`)));
      const uniq = items.filter((c, i) => items.findIndex((x) => x.id === c.id) === i);
      return makeStep("awaiting", Flow.HOME, "Waiting for you", uniq.length ? "Which one would you like to open?" : "Nothing is waiting. Go back to Home?",
        uniq.length ? paged(uniq, r.page) : [homeBtn()], { secondary: uniq.length ? [homeBtn()] : [] });
    }

    case "teach_pick": {
      const ready = st.lessons.filter((x) => e.ready(x) && !e.taught(x)).reverse();
      if (!ready.length) return makeStep("teach_pick", Flow.TEACH, "Teach a lesson", "No lesson is ready to teach yet. Plan one now?", [choice("plan", "Plan a lesson"), homeBtn()]);
      return makeStep("teach_pick", Flow.TEACH, "Teach a lesson", "Which lesson?", paged(ready.map((x) => choice(`l:${x.id}`, e.lessonName(x))), r.page), { secondary: [homeBtn()] });
    }

    case "next_class":
      return makeStep("next_class", Flow.PLAN, "What to teach next", "You don't have a plan yet. Which class and subject?",
        Curriculum.coveredClasses.map((c) => choice(`c${c}`, `Class ${c} science`, { words: [`class ${c}`, `${c}`, numberWord(c), `grade ${c}`] })), { secondary: [homeBtn()] });

    case "next_chapter": {
      const n = e.nextChapter(d.classNum);
      return makeStep("next_chapter", Flow.PLAN, "What to teach next", `Start with chapter ${n.number}, ${n.name}, or tell me the chapter you're on.`,
        [choice("start", `Start with chapter ${n.number}`, { words: ["start", "yes", n.name.toLowerCase()] }), choice("other", "Choose another chapter", { words: ["another", "other", "choose"] })],
        { known: [["Class", `${d.classNum}`], ["Subject", "Science"]], sections: [section("From the textbook contents", Curriculum.forClass(d.classNum).map((c) => `Chapter ${c.number}: ${c.name}`))] });
    }

    case "class_lang": {
      const c = d.langFor;
      return makeStep("class_lang", Flow.SETUP, `Class ${c} language`, `What language do you teach class ${c} in?`,
        LANGS.map((g) => choice(g, g, { tier: Tier.CHANGE, words: [g.toLowerCase(), `in ${g.toLowerCase()}`],
          readBack: `I'll set class ${c} to ${g}. TIKs, lesson audio, questions and quizzes for class ${c} will be in ${g}.` + (g === "English" ? "" : " I will still speak to you in English.") })),
        { announce: "I ask this once for each class.", help: "This sets the language of what I prepare for this class. You can change it later in Settings." });
    }

    // ======================================================== F14 Calendar Scheduling
    case "sched_class":
      return makeStep("sched_class", Flow.SCHEDULE, "Set up your week", d.pendingEntries.length ? "Which class?" : "Which class do you teach first?", classChoices(), {
        announce: !st.schedule.length && !d.pendingEntries.length ? "Your schedule tells the app which class, chapter and topic comes next." : null,
        sections: d.pendingEntries.length ? [section("This week so far", d.pendingEntries.map((x) => e.entryText(x)))] : [],
        help: "With the voice guide you can say several things at once, for example: class 6 science, Monday second period, Exploring Magnets.",
        secondary: [homeBtn()] });

    case "sched_day":
      return makeStep("sched_day", Flow.SCHEDULE, "Day", "Which day?", paged(DAYS.map((x) => choice(x, x, { words: [x.toLowerCase(), x.slice(0, 3).toLowerCase()] })), r.page),
        { known: [...(d.classNum != null ? [["Class", `${d.classNum}`]] : []), ["Subject", "Science"]] });

    case "sched_period":
      return makeStep("sched_period", Flow.SCHEDULE, "Period", "Which period?",
        paged([1, 2, 3, 4, 5, 6, 7, 8].map((p) => choice(`p${p}`, `Period ${p}`, { words: [`period ${p}`, `${p}`, numberWord(p), ordinal(p), `${ordinal(p)} period`] })), r.page),
        { known: [...(d.classNum != null ? [["Class", `${d.classNum}`]] : []), ...(d.day ? [["Day", d.day]] : [])] });

    case "sched_chapter": {
      const c = d.classNum != null ? d.classNum : 6;
      const next = e.nextChapterForSchedule();
      const chapters = Curriculum.forClass(c).map((x) => choice(x.id, `Chapter ${x.number}: ${x.name}`, { words: [x.name.toLowerCase(), `chapter ${x.number}`] }));
      const choices = [...(next ? [choice("next", `The next chapter: ${next.name}`, { words: ["next chapter", "the next chapter", "next"], suggested: true })] : []), ...chapters.filter((x) => !next || x.id !== next.id)];
      return makeStep("sched_chapter", Flow.SCHEDULE, "Chapter", "Which chapter? You can say 'the next chapter'.", paged(choices, r.page),
        { suggestion: next ? { choiceId: "next", reason: "because it follows on in the textbook" } : null, known: [["Class", `${c}`], ...(d.day ? [["Day", d.day]] : []), ...(d.period != null ? [["Period", `${d.period}`]] : [])] });
    }

    case "sched_more": {
      const hasLastWeek = st.schedule.length && d.pendingEntries.length <= 1;
      return makeStep("sched_more", Flow.SCHEDULE, "Your week", "Add another class to your week?", [
        choice("add", "Add another class", { words: ["add", "another", "yes"] }),
        choice("done", "That's all, read it back", { words: ["done", "that's all", "no", "read it back"] }),
        ...(hasLastWeek ? [choice("same", "Same as last week", { words: ["same as last week", "same"] })] : []),
      ], { sections: [section("This week so far", d.pendingEntries.map((x) => e.entryText(x)))] });
    }

    case "sched_review": {
      const n = d.pendingEntries.length;
      const list = d.pendingEntries.map((x) => e.entryText(x));
      return makeStep("sched_review", Flow.SCHEDULE, "Check your week", "Shall I save this schedule?", [
        choice("save", "Save schedule", { tier: Tier.CHANGE, words: ["save", "yes"], readBack: `I'll save ${plural(n, "class", "classes")}: ${list.join("; ")}.` }),
        choice("change", "Remove an entry", { words: ["change", "remove"] }),
        choice("restart", "Start over", { tier: Tier.CHANGE, words: ["start over", "restart"], readBack: `I'll clear the ${plural(n, "class", "classes")} you've added here. Your saved schedule does not change.` }),
      ], { announce: `Here is your week. ${list.join(". ")}.`, sections: [section("Your week", list)] });
    }

    case "sched_pick_pending":
      return makeStep("sched_pick_pending", Flow.SCHEDULE, "Remove an entry", "Which entry should I remove?",
        paged(d.pendingEntries.map((x) => choice(x.id, e.entryText(x), { tier: Tier.CHANGE, readBack: `I'll remove ${e.entryText(x)} from this week. Nothing else changes.` })), r.page),
        { secondary: [choice("__back_review", "Keep all entries", { words: ["keep", "keep all", "none"] })] });

    case "sched_view": {
      const sorted = e.sortedSchedule();
      return makeStep("sched_view", Flow.SCHEDULE, "My schedule", "Add a class, or change an entry?",
        [choice("add", "Add a class", { words: ["add"] }), choice("change", "Change an entry", { words: ["change", "move"] }), homeBtn()],
        { announce: `You have ${plural(sorted.length, "class", "classes")} this week.`,
          sections: [section("This week", sorted.map((x) => { const lx = e.lessonForEntry(x); return `${e.entryText(x)} — ${lx && e.ready(lx) ? "ready to teach" : lx ? "being prepared" : "not prepared"}`; }))] });
    }

    case "sched_pick":
      return makeStep("sched_pick", Flow.SCHEDULE, "Change an entry", "Which entry?", paged(e.sortedSchedule().map((x) => choice(x.id, e.entryText(x))), r.page), { secondary: [homeBtn()] });

    case "sched_change_field": {
      const x = st.schedule.find((y) => y.id === d.editEntryId);
      return makeStep("sched_change_field", Flow.SCHEDULE, "Change an entry", "What changes: the day, the period or the chapter? Or remove it?", [
        choice("day", "Day"), choice("period", "Period"), choice("chapter", "Chapter"),
        choice("remove", "Remove it", { tier: Tier.CHANGE, words: ["remove", "delete"], readBack: `I'll remove ${x ? e.entryText(x) : "this entry"} from your week. Nothing else moves.` }),
      ], { known: x ? [["Entry", e.entryText(x)]] : [] });
    }

    case "sched_change_confirm": {
      const old = st.schedule.find((y) => y.id === d.editEntryId), p = d.proposed;
      const from = old ? e.entryText(old) : "", to = p ? e.entryText(p) : "";
      return makeStep("sched_change_confirm", Flow.SCHEDULE, "Confirm the change", "Apply this change?", [
        choice("apply", "Apply change", { tier: Tier.CHANGE, words: ["apply", "yes"], readBack: `I'll change ${from} to ${to}. Nothing else moves.` }),
        choice("cancel", "Cancel", { words: ["cancel", "no"] }),
      ], { sections: [section("Change", [`From: ${from}`, `To: ${to}`])] });
    }

    // ======================================================== F3 Plan the lesson
    case "plan_class":
      return makeStep("plan_class", Flow.PLAN, "Plan a lesson", "Which class?", classChoices(), {
        help: "With the voice guide you can also say the whole lesson at once, for example: plan class 7 science for Thursday.",
        sections: [section("Covered", ["SEEDS covers science for classes 6, 7 and 9."])], secondary: [homeBtn()], progress: planProgress(0) });

    case "plan_chapter": {
      const c = d.classNum != null ? d.classNum : 6;
      const next = e.nextChapter(c);
      const list = Curriculum.forClass(c).sort((a, b) => (a.id === (next && next.id) ? -1 : a.number) - (b.id === (next && next.id) ? -1 : b.number))
        .map((x) => choice(x.id, `Chapter ${x.number}: ${x.name}` + (next && x.id === next.id ? " (next)" : ""), { words: [x.name.toLowerCase(), `chapter ${x.number}`], suggested: !!next && x.id === next.id }));
      return makeStep("plan_chapter", Flow.PLAN, "Chapter", "Which chapter?", paged(list, r.page), { known: [["Class", `${c}`], ["Subject", "Science"]], progress: planProgress(0),
        suggestion: next ? { choiceId: next.id, reason: e.st.sessions.some((x) => x.endedAt != null && (e.lesson(x.lessonId) || {}).classNum === c) ? "because it's where your class is up to" : "because it comes first in the textbook" } : null });
    }

    case "plan_topic": {
      const chx = Curriculum.chapter(d.chapterId);
      const next = e.nextTopic(chx);
      return makeStep("plan_topic", Flow.PLAN, "Topic", "Which topic is this lesson on?",
        paged(chx.topics.map((x) => choice(x.id, x.name + (next && x.id === next.id ? " (next)" : ""), { words: [x.name.toLowerCase()], suggested: !!next && x.id === next.id })), r.page),
        { known: [["Class", `${chx.classNum}`], ["Chapter", `${chx.number}. ${chx.name}`]], progress: planProgress(0),
          suggestion: next ? { choiceId: next.id, reason: "because it's the next topic your class hasn't finished" } : null });
    }

    case "plan_confirm": {
      const chx = Curriculum.chapter(d.chapterId), tpx = Curriculum.topic(d.topicId);
      const sched = st.schedule.find((x) => x.id === d.scheduleId);
      return makeStep("plan_confirm", Flow.PLAN, "Your lesson",
        `Class ${chx && chx.classNum} science, chapter ${chx && chx.number}, ${chx && chx.name}, topic ${tpx && tpx.name}. Is that right?`,
        [choice("yes", "Yes, continue", { words: ["yes", "right", "correct", "continue"] }), choice("change", "Change something", { words: ["no", "change"] })],
        { known: [["Class", `${chx && chx.classNum}`], ["Subject", "Science"], ["Chapter", `${chx && chx.number}. ${chx && chx.name}`], ["Topic", `${tpx && tpx.name}`],
          ...(sched ? [["From your schedule", `${sched.day}, period ${sched.period}`]] : []), ...(chx && e.classLang(chx.classNum) ? [["Language", e.classLang(chx.classNum)]] : [])],
          progress: planProgress(0) });
    }

    case "plan_previous":
      return makeStep("plan_previous", Flow.PLAN, "Last time", "Use previous context, or start fresh?",
        [choice("use", "Use previous context", { words: ["use", "previous"] }), choice("fresh", "Start fresh", { words: ["fresh", "new"] })],
        { known: lessonKnown, sections: [section("Teaching history", [e.previousContext(ch, tp) || ""])], progress: planProgress(0) });

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
        help: "The TIK has tabs: Summary, Objective, Steps, Activities, Materials, Accessibility, Extension, Sources and Why. Say next tab, previous tab, or a tab's name." });
    }

    case "plan_tik_mode": {
      const [choices, sug] = historySuggestion(e, "plan_tik_mode", [
        choice("chapter", "Teach from the chapter TIK", { words: ["chapter", "chapter tik"] }),
        choice("topic", "Create a topic TIK", { words: ["topic", "topic tik", "create"] }),
      ]);
      return makeStep("plan_tik_mode", Flow.PLAN, "This lesson", "Teach from the chapter TIK, or create a topic TIK?", choices,
        { suggestion: sug, known: lessonKnown, progress: planProgress(1), announce: `The chapter TIK is ${l && l.tikState === "SYNCED_IN_USE" ? "in use from Content Studio" : "approved"}.` });
    }

    case "plan_need":
      return makeStep("plan_need", Flow.PLAN, "Your class", `Tell me about your class and what they need for ${tp && tp.name}. Or say skip.`,
        [choice("skip", "Skip, use the defaults", { words: ["skip"] })],
        { known: lessonKnown, progress: planProgress(1), announce: e.prepLine(l && l.classNum),
          freeSpeech: { prompt: "For example: 12 students, mixed levels, 40 minutes, work in pairs, we have ring magnets", longWindow: true },
          help: "Say how long the lesson is, how many students, whether levels are mixed, pairs or groups, and what materials you have." });

    case "tik_review": {
      const isDraft = l && l.tikState === "DRAFT";
      const panel = l && l.tik ? tikPanel(e, l.tik, l.tikBefore, { APPROVED: "Approved", SYNCED_IN_USE: "In use as it is" }[l.tikState] || "Not yet approved") : null;
      const has = panel && panel.suggestions.length;
      const choices = isDraft ? [
        choice("approve", "Approve", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve this ${l.tik.scope} TIK for ${tp && tp.name}, so it can be used in class.` }),
        ...(has ? [choice("apply_suggestions", "Apply suggested changes", { words: ["apply", "apply suggestions", "suggested changes", "accept"] })] : []),
        choice("change", "Ask for a change", { words: ["change", "ask for a change", "edit"] }),
        choice("regenerate", "Try again", { words: ["try again", "regenerate", "again", "new version"] }),
      ] : [choice("continue", "Continue", { words: ["continue", "next"] }), choice("edit", "Change it", { words: ["change", "edit"] })];
      return makeStep("tik_review", Flow.PLAN, "Review the TIK", isDraft ? "Approve this TIK, or change it first?" : "This TIK is approved. Continue?", choices, {
        banner: isDraft ? NOT_APPROVED : null,
        announce: `${l && l.tik && l.tik.provenance}.` + (l && l.tik && l.tik.instruction ? ` Your request: ${l.tik.instruction}.` : "") +
          (has ? ` There ${panel.suggestions.length === 1 ? "is 1 suggested change" : `are ${panel.suggestions.length} suggested changes`} on the Summary tab.` : ""),
        known: lessonKnown, tik: panel, progress: planProgress(1), contentLang: l && l.tik && l.tik.lang,
        help: "The TIK has tabs: Summary, Objective, Steps, Activities, Materials, Accessibility, Extension, Sources and Why. Say next tab, previous tab, or a tab's name. Say undo to go back to the previous version." });
    }

    case "tik_change": {
      const t = (l && l.tik) || (ch && ch.syncedTik);
      return makeStep("tik_change", Flow.PLAN, "Change the TIK", "What should I change? You can name one step, one activity or the whole TIK.",
        [choice("back", "Back to the TIK", { words: ["back"] })],
        { known: lessonKnown, progress: planProgress(1), contentLang: t && t.lang,
          tik: t ? tikPanel(e, t, l && l.tikBefore, l && l.tikState === "APPROVED" ? "Approved" : "Not yet approved") : null,
          freeSpeech: { prompt: "For example: make the activities work in pairs, or remove step 2", longWindow: true },
          help: e.gen.online ? null : Offline.REVISE_HINT });
    }

    case "checkpoint":
      if (d.checkpointFor === "audio") return makeStep("checkpoint", Flow.PLAN, "Checkpoint", `You've tried ${d.tries} times. Keep going, or use the Content Studio version?`, [
        choice("keep", "Keep trying", { words: ["keep", "keep trying"] }),
        l && l.audio.some((a) => a.provenance.startsWith("Synced")) ? choice("use_cs", "Use Content Studio version", { words: ["content studio", "use"] }) : choice("stop", "Stop and review", { words: ["stop", "review"] }),
      ], { progress: planProgress(3) });
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
        choice("approve", "Approve questions", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve ${sets.length} question sets, for the overview and ${tp && tp.name}.` }),
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
      return makeStep("audio_offer", Flow.PLAN, "Audio", "Prepare audio for this lesson?",
        [choice("prepare", "Prepare audio", { words: ["prepare", "yes", "audio"] }), choice("tik_only", "Continue with TIK only", { words: ["tik only", "continue", "no"] })],
        { known: lessonKnown, progress: planProgress(3), announce: [tp && tp.syncedAudio ? "Content Studio has audio for this topic." : null, tp && !tp.syncedAudio ? e.prepLine(l.classNum) : null].filter(Boolean).join(" ") || null });

    case "audio_review": {
      const clip = l ? e.focusClip(l) : null;
      const clips = (l && l.audio) || [];
      const hasSynced = clips.some((a) => a.provenance.startsWith("Synced"));
      const isExtra = !!clip && clips.indexOf(clip) > 0 && !(clip.provenance.startsWith("Generated") && hasSynced && clips.length === 2 && !clips.some((a) => a.approved && a.id !== clip.id));
      const choices = clip && !clip.approved ? [
        choice("play", "Play preview", { tier: Tier.READ, words: ["play", "preview", "listen"] }),
        choice("approve", "Approve", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve ${clip.name} for ${tp && tp.name} so you can play it in class.` }),
        isExtra ? choice("discard", "Discard this extra", { tier: Tier.CHANGE, words: ["discard"], readBack: `I'll delete ${clip.name}. The other audio stays.` })
          : clip.provenance.startsWith("Synced") ? choice("different", "Try a different version", { words: ["different", "different version"] })
            : choice("again", "Try again", { words: ["try again", "again"] }),
        ...(!clip.provenance.startsWith("Synced") && hasSynced && !isExtra ? [choice("keep_synced", "Keep synced instead", { words: ["keep synced", "synced"] })] : []),
      ] : [
        choice("play", "Play preview", { tier: Tier.READ, words: ["play"] }),
        ...(clips.length < 3 ? [choice("add", "+ Add another audio", { words: ["add", "another"] })] : []),
        choice("done", "Done", { words: ["done"] }),
      ];
      return makeStep("audio_review", Flow.PLAN, "Review the audio",
        clip && !clip.approved ? "Audio is ready. Play it, approve it, or try a different version?" : "Audio approved. Add another, or done?", choices, {
          announce: clip ? `${clip.name}. ${clip.provenance}` + (clip.approved ? ", approved." : ", not yet reviewed.") : null,
          known: lessonKnown, progress: planProgress(3), contentLang: clip && clip.lang,
          secondary: e.audio.isPlaying() ? [choice("stop_preview", "Stop preview", { words: ["stop preview", "pause"] })] : [],
          sections: clips.map((a) => section(`${a.name} · ${a.provenance}` + (a.approved ? " · approved" : " · not yet reviewed") + (a.lang && a.lang !== "English" ? ` · ${a.lang}` : ""),
            [`About ${a.durationSec} seconds. Loudness: played by this device's voice, so it cannot be measured here. Set the speaker volume high.`, `Script: ${a.script}`], { lang: a.lang })) });
    }

    case "audio_add":
      return makeStep("audio_add", Flow.PLAN, "Another audio", "What should this extra audio do differently?", [
        choice("slower", "Slower pace", { words: ["slower", "slow"] }), choice("shorter", "Shorter summary", { words: ["shorter", "short"] }),
        choice("reexplain", "Re-explain one step", { words: ["re-explain", "reexplain", "explain again"] }), choice("back", "Back", { words: ["back"] }),
      ], { known: lessonKnown, progress: planProgress(3), freeSpeech: { prompt: "Or say what should be different", longWindow: true } });

    case "lesson_saved": {
      const n = e.approvedAudio(l).length;
      return makeStep("lesson_saved", Flow.PLAN, "Saved", "Where would you like to go?", [
        choice("home", "Back to Home", { words: ["home"] }),
        choice("open", "Open lesson", { words: ["open", "open lesson", "teach"] }),
        ...(n >= 1 && n <= 2 ? [choice("add", "+ Add another audio", { words: ["add", "another audio"] })] : []),
      ], { announce: `Saved to ${e.lessonName(l)}. Ready to teach.` + (n > 1 ? ` Audio · ${n} versions.` : n === 0 ? " TIK only, no audio." : ""), known: lessonKnown, progress: planProgress(4) });
    }

    // ======================================================== F6 / F7 Teaching
    case "teach_start": {
      const ok = e.ready(l);
      return makeStep("teach_start", Flow.TEACH, "Start class", "Start class?", [
        choice("start", "Start class", { words: ["start", "start class", "yes"], enabled: ok, whyDisabled: "This lesson has no ready TIK yet, so it cannot be taught. Say 'prepare it'." }),
        ...(!ok ? [choice("prepare", "Prepare it", { words: ["prepare"] })] : []),
        homeBtn(),
      ], { announce: `${e.lessonName(l)}. ` + (ok ? (e.approvedAudio(l).length ? "Ready to teach." : "Ready to teach, no audio yet.") : "Not ready."),
        known: lessonKnown, contentLang: l && l.tik && l.tik.lang,
        sections: [...(tp ? [section("What students learn (Course)", tp.definitions)] : []), ...(l && l.tik ? [section("Objective", [l.tik.objective], { lang: l.tik.lang }), section("Materials", l.tik.materials, { lang: l.tik.lang })] : [])] });
    }

    case "teach_step": {
      const s = e.session() || e.activeSession();
      const steps = (l && l.tik && l.tik.steps) || [];
      const i = Math.min(Math.max(0, (s && s.stepIndex) || 0), Math.max(0, steps.length - 1));
      const hasAudio = e.approvedAudio(l).length > 0;
      const tl = l && l.tik && l.tik.lang;
      return makeStep("teach_step", Flow.TEACH, `Step ${i + 1} of ${steps.length}`,
        i < steps.length - 1 ? "Next step, play audio, or end class?" : "This is the last step. Play audio, or end class?", [
          ...(i < steps.length - 1 ? [choice("next", "Next step", { words: ["next", "next step"] })] : []),
          choice("audio", "Play audio", { words: ["play audio", "audio", "play"], enabled: hasAudio, whyDisabled: "No approved audio for this lesson. Teacher-led works as usual." }),
          choice("end", "End class", { tier: Tier.COMMIT, words: ["end class", "end"], commitWord: "end class", readBack: "I'll end the class and ask what was covered." }),
        ], { announce: inLang(tl, steps[i] || ""), inClass: true, contentLang: tl,
          known: [["Lesson", e.lessonName(l)], ["Method", "Your choice: activity, teacher-led, audio, discussion or tactile materials"]],
          sections: [...(i === 0 && tp ? [section("What students learn (Course)", tp.definitions)] : []), section(`Step ${i + 1}`, [steps[i] || ""], { lang: tl })],
          secondary: i > 0 ? [choice("prev", "Previous step", { words: ["previous", "previous step"] })] : [],
          progress: { labels: steps.map((_, k) => `Step ${k + 1}`), current: i } });
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

    case "end_coverage":
      return makeStep("end_coverage", Flow.TEACH, "End class", "All covered, or some covered?",
        [choice("all", "All covered", { words: ["all", "all covered", "everything"] }), choice("some", "Some covered", { words: ["some", "some covered", "partly"] })],
        { inClass: true, known: [["Lesson", e.lessonName(l)]] });

    case "end_partial":
      return makeStep("end_partial", Flow.TEACH, "What was covered", "What did you cover?", [
        choice("overview", "The overview only", { words: ["overview", "overview only"] }),
        choice("part", "Overview and part of the topic", { words: ["part", "part of the topic"] }),
        choice("none", "Nothing from the plan", { words: ["nothing", "none"] }),
      ], { inClass: true });

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

    case "early_finish": {
      const s = e.session();
      const left = s ? PLANNED_MINUTES - Math.floor((e.now() - s.startedAt) / 60000) : 10;
      return makeStep("early_finish", Flow.TEACH, "Time left", "Start the extension activity, or skip?",
        [choice("start_ext", "Start extension activity", { words: ["start", "extension"] }), choice("skip", "Skip", { words: ["skip"] })],
        { announce: `You've covered today's plan with about ${left} minutes left.`, inClass: true,
          sections: [section("Extension activity", [(l && l.tik && l.tik.extension) || "", "Estimated time: about 10 minutes."], { lang: l && l.tik && l.tik.lang })] });
    }

    case "extension":
      return makeStep("extension", Flow.TEACH, "Extension activity", "Say done when the activity is over.", [choice("done", "Done", { words: ["done", "finished"] })],
        { inClass: true, announce: inLang(l && l.tik && l.tik.lang, (l && l.tik && l.tik.extension) || ""), sections: [section("Extension activity", [(l && l.tik && l.tik.extension) || ""], { lang: l && l.tik && l.tik.lang })] });

    case "lc_ask": {
      const key = d.lcQueue[d.lcIndex];
      const set = l && l.questionSets.find((q) => q.key === key);
      return makeStep("lc_ask", Flow.FOLLOWUP, `Learning check: ${set && set.title}`, "How did the class do: most, some, few or none?", [
        choice("most", "Most", { words: ["most"] }), choice("some", "Some", { words: ["some"] }),
        choice("few", "Few", { words: ["few"] }), choice("none", "None", { words: ["none", "nobody"] }),
      ], { announce: "Ask the class: " + inLang(set && set.lang, ((set && set.check) || []).join(" ")), contentLang: set && set.lang,
        sections: [section("Ask the class aloud", (set && set.check) || [], { lang: set && set.lang })],
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

    // ======================================================== F8 Assessment/Quiz
    case "quiz_pick": {
      const ready = st.lessons.filter((x) => e.ready(x)).reverse();
      if (!ready.length) return makeStep("quiz_pick", Flow.QUIZ, "Graded quiz", "No lesson is ready yet. Plan a lesson first?", [choice("plan", "Plan a lesson"), homeBtn()]);
      return makeStep("quiz_pick", Flow.QUIZ, "Graded quiz", "Which lesson is the quiz for?", paged(ready.map((x) => choice(`l:${x.id}`, e.lessonName(x))), r.page), { secondary: [homeBtn()] });
    }

    case "quiz_review": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      const approved = q && q.state !== "Draft";
      return makeStep("quiz_review", Flow.QUIZ, "Graded quiz", approved ? "This quiz is approved." : "Hear the questions, approve, or regenerate?",
        approved ? [homeBtn()] : [
          choice("hear", "Hear the questions", { tier: Tier.READ, words: ["hear", "read"] }),
          choice("approve", "Approve", { tier: Tier.COMMIT, words: ["approve"], commitWord: "approve", readBack: `I'll approve this graded quiz with ${q && q.questions.length} questions. Students will hear it on the phone call.` }),
          choice("regenerate", "Regenerate", { words: ["regenerate", "try again", "new quiz"] }),
        ], { banner: approved ? null : NOT_APPROVED, announce: `Graded quiz. ${q && q.provenance}. What this quiz checks: ${q && q.checks}`, known: lessonKnown, contentLang: q && q.lang,
          sections: q ? q.questions.map((qq, i) => section(`Question ${i + 1}`, [qq.q, ...qq.options.map((o, j) => `Press ${j + 1}: ${o}` + (j === qq.answer ? " (answer)" : ""))], { lang: q.lang })) : [] });
    }

    case "quiz_window": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      const topic = (e.topicOf(e.lesson(q && q.lessonId)) || {}).name;
      const opt = (id, label, until) => choice(id, label, { tier: Tier.COMMIT, words: [label.toLowerCase(), id], commitWord: "open",
        readBack: `I'll open the graded quiz on ${topic} until ${until}. Students answer by phone call at home, with a parent or another responsible adult present.` });
      const [choices, sug] = historySuggestion(e, "quiz_window", [opt("tomorrow", "Until tomorrow", "tomorrow evening"), opt("friday", "Until Friday", "Friday evening"), opt("three_days", "For three days", "three days from now")]);
      return makeStep("quiz_window", Flow.QUIZ, "Open the quiz", "Open until when?", choices, { suggestion: sug,
        announce: "Students answer at home by an ordinary phone call, with a parent or another responsible adult present.", known: lessonKnown, secondary: [homeBtn("Not now")] });
    }

    case "quiz_live": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      return makeStep("quiz_live", Flow.QUIZ, "Quiz live", "Hear the number of responses, or close the quiz?", [
        choice("refresh", "How many responses?", { tier: Tier.READ, words: ["how many", "responses"] }),
        choice("close", "Close quiz now", { tier: Tier.COMMIT, words: ["close"], commitWord: "close", readBack: "I'll close the quiz now. No more answers will be accepted." }),
        homeBtn(),
      ], { announce: `Live until ${q && q.openUntil}.`, sections: [section("Status", [`Responses so far: ${q ? e.simulatedResponses(q) : 0} of ${q && q.classSize}.`, "Phone calls are simulated in this prototype."])] });
    }

    case "quiz_results": {
      const q = st.quizzes.find((x) => x.id === d.quizId);
      const open = st.patterns.filter((p) => p.state === "Proposed").length;
      return makeStep("quiz_results", Flow.QUIZ, "Quiz results", "Where would you like to go?",
        [...(open ? [choice("followups", "See follow-up suggestion", { words: ["follow up"] })] : []), homeBtn()], {
          announce: `${q && q.responses} responses. ${q && q.belowThreshold} students scored below 35 percent.`,
          sections: [section("Class level", ((q && q.perQuestionCorrect) || []).map((n, i) => `Question ${i + 1}: ${n} of ${q.responses} correct.`)),
            section("Below the threshold", [`${q && q.belowThreshold} students scored below 35 percent. Their names are shown only to you (not shown in this prototype).`])] });
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
      if (p && p.state === "Proposed") return makeStep("followup_pattern", Flow.FOLLOWUP, "Follow-up suggestion", "This topic needs follow-up. Confirm or dismiss?", [
        choice("confirm", "Confirm", { tier: Tier.CHANGE, words: ["confirm", "yes"], readBack: `I'll mark ${p.concept} as needing follow-up for a group of about ${p.groupSize} students.` }),
        choice("dismiss", "Dismiss", { tier: Tier.CHANGE, words: ["dismiss", "no"], readBack: "I'll dismiss this suggestion. Nothing else changes." }),
      ], { announce: text, banner: NOT_APPROVED, sections: [section("Signals behind it", p.signals), section("Group", [`About ${p.groupSize} of ${p.classSize} students. Names are shown only to you.`])] });
      if (p && p.followUp) return makeStep("followup_pattern", Flow.FOLLOWUP, "Re-check", "After teaching the follow-up: resolved, or still needs work?", [
        choice("resolved", "Resolved", { tier: Tier.CHANGE, words: ["resolved"], readBack: `I'll mark ${p.concept} as resolved.` }), choice("still", "Still needs work", { words: ["still", "needs work"] }),
      ], { announce: `${text} Follow-up prepared: ${p.followUp}.` });
      return makeStep("followup_pattern", Flow.FOLLOWUP, "Follow-up", "Prepare a follow-up now?", [choice("type", "Prepare follow-up", { words: ["prepare", "yes"] }), homeBtn()], { announce: text });
    }

    case "followup_type": {
      const p = st.patterns.find((x) => x.id === d.patternId);
      const base = p && e.lesson(p.lessonId);
      return makeStep("followup_type", Flow.FOLLOWUP, "Follow-up content", "A simpler TIK, audio or a quiz?",
        [choice("tik", "A simpler TIK", { words: ["tik", "simpler"] }), choice("audio", "Audio", { words: ["audio"] }), choice("quiz", "A quiz", { words: ["quiz"] })],
        { announce: base ? e.prepLine(base.classNum) : null, sections: [section("What happens", ["It goes through the normal approval step before it is used."])] });
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
  const next = e.nextScheduled();
  if (next) {
    const [en, lx] = next;
    const ch = Curriculum.chapter(en.chapterId);
    const tp = lx ? e.topicOf(lx) : ch ? e.nextTopic(ch) : null;
    const status = lx && e.ready(lx) && !e.approvedAudio(lx).length && !lx.tikOnly ? "ready to teach, no audio yet" : lx && e.ready(lx) ? "ready to teach" : "not ready, no TIK yet";
    const ready = st.schedule.filter((x) => { const y = e.lessonForEntry(x); return y && e.ready(y); }).length;
    sections.push(section("Next lesson", [`${en.day} period ${en.period}: Class ${en.classNum} ${en.subject}, ${ch && ch.name}, ${tp && tp.name}. ${cap(status)}.`,
      `This week: ${ready} of ${plural(st.schedule.length, "scheduled lesson", "scheduled lessons")} ready.`], { emphasis: !active }));
    if (!active) choices.push(lx && e.ready(lx) ? choice("start_next", "Start class", { words: ["start class", "start"] }) : choice("prepare_next", "Prepare it", { words: ["prepare it", "prepare"] }));
  } else {
    const ready = st.lessons.filter((x) => e.ready(x) && !e.taught(x));
    if (ready.length) {
      sections.push(section("Ready to teach", ready.map((x) => e.lessonName(x)), { emphasis: !active }));
      choices.push(choice("teach_pick", "Teach a ready lesson", { words: ["teach"] }));
    }
    if (!st.lessons.length && !st.sessions.length) {
      sections.push(section("No lessons yet", ["Set up your week, or plan a lesson."]));
      choices.push(choice("next_topic", "What should I teach next?", { words: ["what should i teach", "teach next", "lesson plan", "what is my lesson plan"] }));
      choices.push(choice("setup_week", "Set up my week", { words: ["set up", "schedule", "my week"] }));
      choices.push(choice("plan", "Plan a lesson", { words: ["plan"] }));
    }
  }
  const waiting = [];
  const n1 = st.lessons.filter((x) => x.tikState === "DRAFT").length; if (n1) waiting.push(`${n1} ${n1 === 1 ? "TIK" : "TIKs"} waiting for approval`);
  const n2 = st.lessons.filter((x) => e.ready(x) && x.audio.some((a) => !a.approved)).length; if (n2) waiting.push(`${n2} audio waiting for approval`);
  const n3 = st.quizzes.filter((q) => q.state === "Draft").length; if (n3) waiting.push(`${n3} ${n3 === 1 ? "quiz" : "quizzes"} waiting for approval`);
  const n4 = st.records.filter((x) => !x.saved).length; if (n4) waiting.push(`${n4} class record ${n4 === 1 ? "draft" : "drafts"}`);
  const n5 = st.patterns.filter((p) => p.state === "Proposed").length; if (n5) waiting.push(`${n5} follow-up ${n5 === 1 ? "suggestion" : "suggestions"}`);
  if (waiting.length) { sections.push(section("Waiting for you", waiting)); choices.push(choice("awaiting", "Review waiting items", { words: ["waiting", "review", "approval"] })); }
  // the first action answers "yes" to the question Home asks, so a teacher can just agree (FR-62, FR-87)
  if (choices[0] && ["continue", "start_next", "prepare_next"].includes(choices[0].id)) choices[0] = { ...choices[0], words: [...choices[0].words, "yes", "okay", "sure", "let's do it"] };
  const primary = [...choices.filter((c, i) => choices.findIndex((x) => x.id === c.id) === i).slice(0, 3), choice("menu", "More options", { words: ["more", "more options", "menu"] })];
  // spoken like a colleague catching you up, not a list of headings
  const talk = [];
  if (e.draft.justSignedIn) { talk.push(`Hello, ${e.teacher && e.teacher.name}.`); e.draft.justSignedIn = false; }
  let question = "What would you like to do?";
  if (active) { talk.push(`You have a class going on: ${e.lessonName(e.lesson(active.lessonId))}.`); question = "Shall we carry on with it?"; }
  if (next && !active) {
    const [en, lx] = next, ch = Curriculum.chapter(en.chapterId), tp = lx ? e.topicOf(lx) : ch ? e.nextTopic(ch) : null;
    const ok = lx && e.ready(lx);
    talk.push(`Your next class is on ${en.day}, period ${en.period}: class ${en.classNum} science, ${ch && ch.name}, ${tp && tp.name}. ${ok ? "It's ready to teach." : "It isn't ready yet."}`);
    question = ok ? "Shall we start the class?" : "Shall we get it ready now?";
  } else if (!active) {
    const ready = st.lessons.filter((x) => e.ready(x) && !e.taught(x)).length;
    if (ready) talk.push(`You have ${plural(ready, "lesson", "lessons")} ready to teach.`);
    else if (!st.lessons.length) talk.push("You don't have any lessons yet. I can help you set up your week, or plan a lesson.");
  }
  if (waiting.length) talk.push(`You ${talk.some((x) => !x.startsWith("Hello")) ? "also " : ""}have ${orList(waiting.map((w) => w.replace(/ waiting for approval$/, " to approve"))).replace(/ or ([^,]*)$/, " and $1")}.`);
  return makeStep("home", Flow.HOME, "Home", question, primary, { announce: talk.join(" ") || null, sections,
    help: "With the voice guide you can say what you want in one sentence, for example: plan class 7 science for Thursday." });
}
