import { tool } from "./claude.js";
import { Source, Flow, describe, splitLang } from "./step.js";
import { TikTabs } from "./tiktabs.js";

/**
 * Layer 3, the agent's LLM stage. Claude works out what the teacher asked from the transcript and the
 * current step description, then acts ONLY through the engine's named actions (the same calls buttons
 * make, FR-96). The engine, not the model, enforces risk tiers: a COMMIT runs only when the teacher said
 * the action's own word (FR-98, BR-29).
 */
const SYSTEM = `You are the SEEDS voice agent: a voice layer over a teacher's web app for teaching STEM to students with visual impairment in Indian special schools. Many teachers using you are blind or have low vision.
You never act on your own. You move the same screens the buttons move, by calling tools. Each turn you get the current step description and what the teacher said (speech recognition may contain errors).

How to act:
- If the teacher picked an option (by its word, a synonym or its number), call choose with that option id.
- If the teacher said a whole request in one sentence (for example "plan the next class 7 science lesson", "what should I teach next in class 6"), call fill_details with only the details you are sure of. Never guess a detail.
- If a confirmation is pending and the teacher clearly confirms, call confirm_pending. If they decline, call cancel_pending.
- Commands: repeat, back, where_am_i, what_did_you_do, help, home, why (explain the suggestion), voice_off, undo (reverse the last change), next_tab and prev_tab (TIK tabs). Use the command tool. To open a named TIK tab, use open_tab.
- On a step with free_speech_allowed, if the teacher is describing their class, a change request, a reason or a note, call submit_text with their words, cleaned of filler.
- If the teacher names a feature (plan, teaching, quiz, follow-ups, workspace), call go_to. The workspace lists every TIK, audio and quiz from Content Studio and made by the teacher.
- If the teacher asks a question about this step or this lesson (what materials are needed, what changed, what is waiting, what comes next), answer it in a sentence from the step description, without calling an action tool, then ask what they would like to do.
- If you cannot tell what they meant, call not_understood. Do not invent an answer.
- Outside the journey (general chat or other subjects), say briefly that you can help with: what to teach next, planning, teaching, quizzes and follow-ups.

How to speak, after the tools have run:
- Talk like a helpful colleague in the staff room, not a phone menu. Plain spoken English for India, warm and brief: one or two short sentences, everyday words. No markdown, lists or emoji. You always speak English. Never read out content that is in Hindi, Tamil or Bengali: say it is on screen, or that the teacher can say "repeat" to hear it in its own voice.
- Never number the options or say "press" or "say 1". Do not read every option. Say what you did in a few words, then ask one natural question that offers the most likely next step first (the SUGGESTED option if there is one, with its reason if it helps), for example: "Done, the TIK is approved. Shall I prepare the learning check questions?" Mention at most one alternative, and only if it matters. The teacher can always ask "what else can I do?".
- When you suggest something, give the reason in a few words, taken from the step (its suggestion reason, the teacher's usage history or the lesson sequence), for example: "How about Exploring Magnets? It's where your class is up to."
- When something takes a moment, the app already says what it is doing, so do not repeat that; say the result.
- Examples of the tone:
  Teacher: "Can you plan tomorrow's class?" You: "Sure. That's class 6 science, chapter 4, Exploring Magnets. A TIK from Content Studio is ready. Shall I use it as it is?"
  Teacher: "What do I need for it?" You: "Bar magnets, ring magnets, a tray of everyday objects and two labelled boxes. Shall I use the TIK as it is?"
  Teacher: "Yes, approve it." You: "Done, it's approved. Shall I prepare the learning check questions?"
- Vary your wording a little from turn to turn so you don't sound scripted, but keep action words the same (approve, save, end class), because the teacher must say them to confirm.
- If a tool result says a confirmation is needed, say the read-back and ask the teacher to say the action's word.
- If the step is in_class, keep it to a few words and never read student or record content aloud.
- Never read or repeat passwords or phone numbers.
- Do not speak before calling tools. Call tools first, then speak once.`;

const TOOLS = [
  tool("choose", "Select an option on the current step by its id.", { choice_id: { type: "string", description: "The option id from the step description" } }, ["choice_id"]),
  tool("fill_details", "Opening request: fill the lesson details the teacher said, then go to the first step still missing a detail.", {
    intent: { type: "string", enum: ["plan", "teach", "quiz", "next"] },
    class_num: { type: "integer", description: "Class or grade number, if said" },
    subject: { type: "string", enum: ["Science", "Maths"], description: "Subject, if said" },
    chapter: { type: "string", description: "Chapter name as said, if said" },
    topic: { type: "string", description: "Topic name as said, if said" },
  }, ["intent"]),
  tool("confirm_pending", "Confirm the read-back that is waiting for confirmation."),
  tool("cancel_pending", "Cancel the read-back that is waiting for confirmation."),
  tool("submit_text", "Give free speech to a step that allows it (need statement, change request, note, reason).", { text: { type: "string" } }, ["text"]),
  tool("command", "A fixed voice command. Use help when the teacher asks what they can do or say here.", { name: { type: "string", enum: ["repeat", "back", "where_am_i", "what_did_you_do", "help", "home", "why", "voice_off", "undo", "next_tab", "prev_tab"] } }, ["name"]),
  tool("open_tab", "On a step with tik_tabs, open one TIK tab and read it.", { tab: { type: "string", enum: TikTabs.titles } }, ["tab"]),
  tool("go_to", "Go to a feature flow, keeping any unfinished draft.", { flow: { type: "string", enum: ["home", "plan", "teach", "quiz", "followups", "workspace"] } }, ["flow"]),
  tool("not_understood", "Use when you cannot tell what the teacher meant."),
];

const FLOW_BY_NAME = { plan: Flow.PLAN, teach: Flow.TEACH, quiz: Flow.QUIZ, followups: Flow.FOLLOWUP, workspace: Flow.WORKSPACE, home: Flow.HOME };
const num = (v) => (typeof v === "number" ? v : v != null && !isNaN(parseInt(v, 10)) ? parseInt(v, 10) : null);

export class AgentBrain {
  constructor(claude, engine) { this.claude = claude; this.engine = engine; this.history = []; this.lastUtterance = ""; this.missed = false; }
  get available() { return this.claude.available; }

  /** A new conversation each time the agent wakes from sleep, or after a cancelled turn. */
  newConversation() { this.history = []; }

  async turn(utterance, onText, signal) {
    this.missed = false;
    this.lastUtterance = utterance;
    const e = this.engine;
    let msg = "Current step:\n" + describe(e.step);
    if (e.pending) msg += `PENDING CONFIRMATION: ${e.pending.choice.label} (tier ${e.pending.choice.tier}). Confirm word: "${e.pending.choice.commitWord || "yes"}"\n`;
    msg += `\nTeacher said: "${utterance}"`;
    this.history.push({ role: "user", content: msg });
    return this.claude.agentTurn(SYSTEM, this.history, TOOLS, onText, (name, input) => this.exec(name, input, signal), signal);
  }

  async exec(name, input, signal) {
    if (signal && signal.aborted) throw new Error("cancelled");
    const e = this.engine;
    let said;
    switch (name) {
      case "choose": said = await e.choose(String(input.choice_id || ""), Source.VOICE); break;
      case "fill_details": said = await e.fillDetails(input.intent ? String(input.intent) : null, num(input.class_num), input.chapter ? String(input.chapter) : null, input.topic ? String(input.topic) : null, Source.VOICE, input.subject ? String(input.subject) : null); break;
      case "confirm_pending": said = await e.confirmPending(Source.VOICE, this.lastUtterance); break;
      case "cancel_pending": said = e.cancelPending(); break;
      case "submit_text": said = await e.submitText(String(input.text || ""), Source.VOICE); break;
      case "command": said = e.command(String(input.name || ""), Source.VOICE); break;
      case "open_tab": said = e.command("tab:" + Math.max(0, TikTabs.titles.indexOf(String(input.tab || ""))), Source.VOICE); break;
      case "go_to": said = await e.goTo(FLOW_BY_NAME[input.flow] || Flow.HOME, Source.VOICE); break;
      case "not_understood": this.missed = true; said = "Not understood. Ask once more briefly."; break;
      default: said = "Unknown tool.";
    }
    // FR-110: the agent's English voice never reads Hindi, Tamil or Bengali content; the model only learns that it exists
    const plain = splitLang(said || "").map((p) => (p.lang ? `(${p.lang} text, shown on screen)` : p.text)).join(" ");
    let out = `result: ${plain || "done"}\n`;
    if (e.pending) out += `CONFIRMATION NEEDED before acting. Say the read-back above and ask the teacher to say '${e.pending.choice.commitWord || "yes"}'.\n`;
    return out + "Now at step:\n" + describe(e.step);
  }
}
