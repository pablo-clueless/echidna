import type {
  BetaContentBlockParam,
  BetaMessageParam,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { createJSONStorage, persist } from "zustand/middleware";
import { create } from "zustand";

import type { AssistantErrorCode, UploadedAttachment } from "@/lib/assistant/protocol";
import { deleteAttachment, streamTurn } from "@/lib/assistant/api";
import { READ_ONLY_TOOLS } from "@/lib/assistant/tools";
import type { ProjectData } from "@/lib/project/model";
import { executeTool } from "@/lib/assistant/execute";
import { useProjectStore } from "@/stores/project";

export const ASSISTANT_STORAGE_KEY = "echidna-assistant";

/** Most tool-calling turns one request may take before the assistant is stopped, so it can't run away. */
export const MAX_STEPS = 25;

/** Auto applies the assistant's changes as it makes them; manual shows them for the user to apply or reject. */
export type AssistantMode = "auto" | "manual";

export type ActionStatus = "pending" | "applied" | "rejected" | "failed";

export type ToolAction = {
  id: string;
  name: string;
  input: Record<string, unknown>;
  readOnly: boolean;
  status: ActionStatus;
  /** The tool result, shown when it failed. */
  result?: string;
};

export type NoticeCode =
  AssistantErrorCode | "refusal" | "truncated" | "tooManySteps" | "stopped" | "undone";

export type Entry =
  | { kind: "user"; id: string; text: string; attachments: UploadedAttachment[] }
  | { kind: "assistant"; id: string; text: string }
  | { kind: "actions"; id: string; actions: ToolAction[] }
  | { kind: "notice"; id: string; code: NoticeCode };

export type AssistantStatus = "idle" | "streaming" | "awaiting";

/** What the assistant is doing while it streams, for the activity indicator. */
export type Activity = "waiting" | "thinking" | "writing" | "tool";

type AssistantState = {
  mode: AssistantMode;
  /** The conversation exactly as the API takes it. Assistant turns are kept unchanged, thinking blocks included. */
  history: BetaMessageParam[];
  /** The conversation as the panel shows it. */
  entries: Entry[];
  status: AssistantStatus;
  activity: Activity;
  /** The project before the latest request changed it, for undo. */
  undoSnapshot: ProjectData | null;
  setMode: (mode: AssistantMode) => void;
  /** Sends a message with attachments. While changes await approval, a message rejects them and says why. */
  send: (text: string, attachments: UploadedAttachment[]) => void;
  /** Applies the changes awaiting approval in manual mode, then lets the assistant carry on. */
  apply: () => void;
  /** Rejects the changes awaiting approval in manual mode. */
  reject: () => void;
  stop: () => void;
  /** Puts the project back as it was before the latest request changed it. */
  undo: () => void;
  /** Starts a new conversation, deleting its uploaded attachments. */
  reset: () => void;
};

let controller: AbortController | null = null;
let steps = 0;
/** Tool calls awaiting the user's decision in manual mode. */
let pending: BetaToolUseBlock[] = [];
/** Whether the latest request has changed the project yet, so the undo snapshot is taken before its first change. */
let changed = false;
/** Set after an undo, so the assistant is told the project went back with the user's next message. */
let undoneNote = false;

const newId = () => crypto.randomUUID();

const snapshot = (): ProjectData => {
  const p = useProjectStore.getState();
  return {
    name: p.name,
    foundation: p.foundation,
    components: p.components,
    wires: p.wires,
    schematic: p.schematic,
    board: p.board,
    boardSize: p.boardSize,
    ambientTemperature: p.ambientTemperature,
    slots: p.slots,
  };
};

const attachmentBlock = (a: UploadedAttachment): BetaContentBlockParam =>
  a.kind === "image"
    ? { type: "image", source: { type: "file", file_id: a.fileId } }
    : { type: "document", source: { type: "file", file_id: a.fileId }, title: a.name };

const UNDONE_NOTE =
  "(The user undid every change from my previous request, so the project is back as it was before it.)";

/**
 * The AI assistant's conversation and the loop that runs it: each turn streams from the assistant route, the
 * browser runs the tool calls against the project (straight away in auto mode, once applied in manual mode), and
 * their results go back in the next turn. Only the mode is persisted.
 * @returns The assistant store.
 */
export const useAssistantStore = create<AssistantState>()(
  persist(
    (set, get) => {
      const notice = (code: NoticeCode) =>
        set((s) => ({ entries: [...s.entries, { kind: "notice", id: newId(), code }] }));

      const updateActions = (entryId: string, actions: ToolAction[]) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === entryId && e.kind === "actions" ? { ...e, actions } : e,
          ),
        }));

      /** Runs tool calls, or declines the ones that change the project, and returns their results. */
      const runTools = (
        entryId: string,
        toolUses: BetaToolUseBlock[],
        approved: boolean,
      ): BetaToolResultBlockParam[] => {
        const entry = get().entries.find((e) => e.id === entryId);
        const actions = entry?.kind === "actions" ? [...entry.actions] : [];
        const results = toolUses.map((use, i): BetaToolResultBlockParam => {
          const readOnly = READ_ONLY_TOOLS.has(use.name);
          if (!readOnly && !approved) {
            if (actions[i]) actions[i] = { ...actions[i], status: "rejected" };
            return {
              type: "tool_result",
              tool_use_id: use.id,
              content: "The user declined this change.",
              is_error: true,
            };
          }
          if (!readOnly && !changed) {
            set({ undoSnapshot: snapshot() });
            changed = true;
          }
          const outcome = executeTool(use.name, use.input);
          if (actions[i]) {
            actions[i] = {
              ...actions[i],
              status: outcome.isError ? "failed" : "applied",
              ...(outcome.isError ? { result: outcome.content } : {}),
            };
          }
          return {
            type: "tool_result",
            tool_use_id: use.id,
            content: outcome.content,
            ...(outcome.isError ? { is_error: true } : {}),
          };
        });
        updateActions(entryId, actions);
        return results;
      };

      const pushUser = (content: BetaContentBlockParam[]) =>
        set((s) => ({ history: [...s.history, { role: "user", content }] }));

      /** Handles a finished turn's tool calls: runs them, or waits for approval in manual mode. */
      const handleToolUses = (toolUses: BetaToolUseBlock[]) => {
        const entryId = newId();
        const actions: ToolAction[] = toolUses.map((use) => ({
          id: use.id,
          name: use.name,
          input: (use.input ?? {}) as Record<string, unknown>,
          readOnly: READ_ONLY_TOOLS.has(use.name),
          status: "pending",
        }));
        set((s) => ({ entries: [...s.entries, { kind: "actions", id: entryId, actions }] }));

        if (++steps > MAX_STEPS) {
          pushUser(
            toolUses.map((use) => ({
              type: "tool_result",
              tool_use_id: use.id,
              content: "Stopped: this request took too many steps.",
              is_error: true,
            })),
          );
          updateActions(
            entryId,
            actions.map((a) => ({ ...a, status: "rejected" })),
          );
          notice("tooManySteps");
          set({ status: "idle" });
          return;
        }

        const needsApproval = get().mode === "manual" && actions.some((a) => !a.readOnly);
        if (needsApproval) {
          pending = toolUses;
          set({ status: "awaiting" });
          return;
        }
        pushUser(runTools(entryId, toolUses, true));
        void turn();
      };

      /** Streams one assistant turn from the route and acts on how it ended. */
      const turn = async () => {
        controller?.abort();
        const abort = new AbortController();
        controller = abort;
        const replyId = newId();
        set((s) => ({
          status: "streaming",
          activity: "waiting",
          entries: [...s.entries, { kind: "assistant", id: replyId, text: "" }],
        }));
        const appendText = (text: string) =>
          set((s) => ({
            activity: "writing",
            entries: s.entries.map((e) =>
              e.id === replyId && e.kind === "assistant" ? { ...e, text: e.text + text } : e,
            ),
          }));
        const dropEmptyReply = () =>
          set((s) => ({
            entries: s.entries.filter(
              (e) => !(e.id === replyId && e.kind === "assistant" && !e.text),
            ),
          }));

        try {
          for await (const event of streamTurn(get().history, abort.signal)) {
            if (event.type === "text") appendText(event.text);
            else if (event.type === "thinking") set({ activity: "thinking" });
            else if (event.type === "tool") set({ activity: "tool" });
            else if (event.type === "error") {
              dropEmptyReply();
              notice(event.code);
              set({ status: "idle" });
              return;
            } else {
              dropEmptyReply();
              const toolUses = event.content.filter(
                (b): b is BetaToolUseBlock => b.type === "tool_use",
              );
              if (event.stopReason === "refusal") {
                notice("refusal");
                set({ status: "idle" });
                return;
              }
              // A turn cut off mid tool call can't be answered, so it is left out of the conversation.
              if (event.stopReason === "max_tokens" && toolUses.length) {
                notice("truncated");
                set({ status: "idle" });
                return;
              }
              set((s) => ({
                history: [...s.history, { role: "assistant", content: event.content }],
              }));
              if (event.stopReason === "tool_use" && toolUses.length) {
                handleToolUses(toolUses);
                return;
              }
              if (event.stopReason === "max_tokens") notice("truncated");
              set({ status: "idle" });
              return;
            }
          }
          // The stream ended without a final turn.
          dropEmptyReply();
          notice("failed");
          set({ status: "idle" });
        } catch {
          dropEmptyReply();
          if (!abort.signal.aborted) notice("failed");
          if (controller === abort) set({ status: "idle" });
        } finally {
          if (controller === abort) controller = null;
        }
      };

      const actionsEntryId = () =>
        [...get().entries].reverse().find((e) => e.kind === "actions")?.id ?? "";

      return {
        mode: "manual",
        history: [],
        entries: [],
        status: "idle",
        activity: "waiting",
        undoSnapshot: null,

        setMode: (mode) => set({ mode }),

        send: (text, attachments) => {
          const trimmed = text.trim();
          if (!trimmed && !attachments.length) return;
          if (get().status === "streaming") return;
          const note = undoneNote ? `${UNDONE_NOTE}\n\n` : "";
          undoneNote = false;
          const prompt: BetaContentBlockParam[] = [
            ...attachments.map(attachmentBlock),
            { type: "text", text: `${note}${trimmed || "(See the attached files.)"}` },
          ];
          set((s) => ({
            entries: [...s.entries, { kind: "user", id: newId(), text: trimmed, attachments }],
          }));
          if (get().status === "awaiting") {
            // The message answers the waiting changes: they are declined, and the message says what instead.
            const results = runTools(actionsEntryId(), pending, false);
            pending = [];
            pushUser([...results, ...prompt]);
          } else {
            steps = 0;
            changed = false;
            set({ undoSnapshot: null });
            pushUser(prompt);
          }
          void turn();
        },

        apply: () => {
          if (get().status !== "awaiting") return;
          const toolUses = pending;
          pending = [];
          pushUser(runTools(actionsEntryId(), toolUses, true));
          void turn();
        },

        reject: () => {
          if (get().status !== "awaiting") return;
          const toolUses = pending;
          pending = [];
          // The results wait in the conversation and go with the user's next message.
          pushUser(runTools(actionsEntryId(), toolUses, false));
          set({ status: "idle" });
        },

        stop: () => {
          const { status } = get();
          if (status === "streaming") {
            controller?.abort();
            controller = null;
            notice("stopped");
            set({ status: "idle" });
          } else if (status === "awaiting") {
            get().reject();
          }
        },

        undo: () => {
          const { undoSnapshot, status } = get();
          if (!undoSnapshot || status !== "idle") return;
          useProjectStore.getState().loadProject(undoSnapshot);
          undoneNote = true;
          changed = false;
          set({ undoSnapshot: null });
          notice("undone");
        },

        reset: () => {
          controller?.abort();
          controller = null;
          pending = [];
          steps = 0;
          changed = false;
          undoneNote = false;
          for (const entry of get().entries) {
            if (entry.kind === "user")
              for (const a of entry.attachments) deleteAttachment(a.fileId);
          }
          set({
            history: [],
            entries: [],
            status: "idle",
            activity: "waiting",
            undoSnapshot: null,
          });
        },
      };
    },
    {
      name: ASSISTANT_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ mode }) => ({ mode }),
      skipHydration: true,
    },
  ),
);
