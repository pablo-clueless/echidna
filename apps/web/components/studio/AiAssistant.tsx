"use client";

import {
  ArrowUp,
  Check,
  CircleAlert,
  Eye,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  RotateCcw,
  Sparkles,
  Square,
  SquarePen,
  X,
} from "lucide-react";
import { type ClipboardEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { builds, partsById } from "@echidna/library";
import { cn } from "cn";

import {
  ATTACHMENT_ACCEPT,
  type AssistantErrorCode,
  classifyAttachment,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  type UploadedAttachment,
} from "@/lib/assistant/protocol";
import {
  type AssistantMode,
  type Entry,
  type ToolAction,
  useAssistantStore,
} from "@/stores/assistant";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { deleteAttachment, uploadAttachment } from "@/lib/assistant/api";
import { buildKey, paramKey, partKey, slotKey } from "@/lib/messageKeys";
import { useProjectStore } from "@/stores/project";
import { formatQuantity } from "@/lib/units";
import { TabPanel } from "../ui/tab-panel";
import { Button } from "../ui/button";

interface Props {
  tab: string;
}

type Draft = {
  localId: string;
  name: string;
  kind: "image" | "document";
  status: "uploading" | "ready";
  attachment?: UploadedAttachment;
};

type AttachmentError = AssistantErrorCode | "type" | "size" | "count";

/**
 * Describes one of the assistant's tool calls in the user's language, naming parts the way the rest of the studio
 * does.
 * @returns A function from an action to its description.
 */
const useDescribeAction = () => {
  const t = useTranslations("Studio.ai-assistant.actions");
  const tParts = useTranslations("Parts");
  const tParams = useTranslations("Studio.params");
  const tSlots = useTranslations("Studio.slots.names");
  const tBuilds = useTranslations("Builds");
  const locale = useLocale();
  const components = useProjectStore((s) => s.components);

  const specName = (specId: unknown) => {
    const id = String(specId);
    const key = `${partKey(id)}.name`;
    return tParts.has(key as never) ? tParts(key as never) : (partsById.get(id)?.name ?? id);
  };
  const partName = (partId: unknown) => {
    const id = String(partId);
    const component = components.find((c) => c.id === id);
    return component ? `${id} (${specName(component.specId)})` : id;
  };
  const pin = (ref: unknown) => {
    const { componentId, pinId } = (ref ?? {}) as { componentId?: string; pinId?: string };
    return `${componentId}.${pinId}`;
  };

  return ({ name, input }: ToolAction): string => {
    switch (name) {
      case "get_project":
      case "arrange_schematic":
        return t(name);
      case "get_slot_options":
      case "select_part":
      case "remove_part":
      case "unplug":
        return t(name, { part: partName(input.partId) });
      case "add_part":
        return t(name, { part: specName(input.specId) });
      case "connect":
        return t(name, { a: pin(input.a), b: pin(input.b) });
      case "remove_wire":
        return t(name, { wire: String(input.wireId) });
      case "set_param": {
        const param = String(input.param);
        const label = tParams.has(paramKey(param)) ? tParams(paramKey(param)) : param;
        const spec = partsById.get(components.find((c) => c.id === input.partId)?.specId ?? "");
        if (typeof input.value !== "number") {
          return t("reset_param", { part: partName(input.partId), param: label });
        }
        const unit = spec?.params[param]?.unit ?? "";
        return t(name, {
          part: partName(input.partId),
          param: label,
          value: formatQuantity(input.value, unit, locale),
        });
      }
      case "set_variant":
        return t(name, { part: partName(input.partId), variant: String(input.variant) });
      case "swap_part":
        return t(name, { part: partName(input.partId), spec: specName(input.specId) });
      case "plug_in": {
        const slot = String(input.slotId);
        return t(name, {
          part: partName(input.partId),
          host: partName(input.hostId),
          slot: tSlots.has(slotKey(slot)) ? tSlots(slotKey(slot)) : slot,
        });
      }
      case "set_ambient_temperature":
        return t(name, { value: formatQuantity(Number(input.kelvin), "K", locale) });
      case "load_build": {
        const id = String(input.buildId);
        const key = `${buildKey(id)}.name`;
        const known = builds.some((b) => b.id === id) && tBuilds.has(key as never);
        return t(name, { build: known ? tBuilds(key as never) : id });
      }
      case "load_preset":
        return t(name, { board: specName(input.hostSpecId) });
      default:
        return t("unknown", { name });
    }
  };
};

const ActionsCard = ({ actions, awaiting }: { actions: ToolAction[]; awaiting: boolean }) => {
  const t = useTranslations("Studio.ai-assistant");
  const describe = useDescribeAction();
  const apply = useAssistantStore((s) => s.apply);
  const reject = useAssistantStore((s) => s.reject);
  const changes = actions.filter((a) => !a.readOnly);

  return (
    <div
      className={cn(
        "grid gap-1.5 rounded-lg border p-2 text-xs",
        awaiting ? "border-primary bg-background" : "bg-background/50",
      )}
    >
      {awaiting && <p className="font-medium">{t("proposalTitle")}</p>}
      <ul className="grid gap-1">
        {actions.map((action) => (
          <li className="flex items-start gap-1.5" key={action.id}>
            <span className="mt-px shrink-0">
              {action.readOnly ? (
                <Eye className="text-muted-foreground size-3.5" />
              ) : action.status === "applied" ? (
                <Check className="text-status-pass-text size-3.5" />
              ) : action.status === "failed" ? (
                <CircleAlert className="text-status-fail-text size-3.5" />
              ) : action.status === "rejected" ? (
                <X className="text-muted-foreground size-3.5" />
              ) : (
                <SquarePen className="text-primary size-3.5" />
              )}
            </span>
            <span
              className={cn(
                "min-w-0 wrap-break-word",
                (action.readOnly || action.status === "rejected") && "text-muted-foreground",
                action.status === "rejected" && "line-through",
              )}
            >
              {describe(action)}
              {action.status === "failed" && (
                <span className="text-muted-foreground block">{t("status.failed")}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {awaiting && changes.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <Button onClick={apply} size="xs">
            <Check />
            {t("apply")}
          </Button>
          <Button onClick={reject} size="xs" variant="outline">
            <X />
            {t("reject")}
          </Button>
          <span className="text-muted-foreground">{t("awaitingHint")}</span>
        </div>
      )}
    </div>
  );
};

const EntryView = ({ entry, awaiting }: { entry: Entry; awaiting: boolean }) => {
  const t = useTranslations("Studio.ai-assistant");
  switch (entry.kind) {
    case "user":
      return (
        <div className="bg-muted ml-6 grid gap-1.5 self-end rounded-lg px-2.5 py-2 text-sm">
          {entry.attachments.length > 0 && (
            <ul className="flex flex-wrap gap-1">
              {entry.attachments.map((a) => (
                <li
                  className="bg-background flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs"
                  key={a.fileId}
                >
                  {a.kind === "image" ? (
                    <ImageIcon className="size-3 shrink-0" />
                  ) : (
                    <FileText className="size-3 shrink-0" />
                  )}
                  <span className="truncate">{a.name}</span>
                </li>
              ))}
            </ul>
          )}
          {entry.text && <p className="wrap-break-word whitespace-pre-wrap">{entry.text}</p>}
        </div>
      );
    case "assistant":
      return entry.text ? (
        <p className="mr-2 text-sm wrap-break-word whitespace-pre-wrap">{entry.text}</p>
      ) : null;
    case "actions":
      return <ActionsCard actions={entry.actions} awaiting={awaiting} />;
    case "notice":
      return (
        <p
          className={cn(
            "text-xs",
            entry.code === "undone" || entry.code === "stopped"
              ? "text-muted-foreground"
              : "text-status-fail-text",
          )}
          role={entry.code === "undone" || entry.code === "stopped" ? undefined : "alert"}
        >
          {t(`notices.${entry.code}`)}
        </p>
      );
  }
};

const MessageList = () => {
  const t = useTranslations("Studio.ai-assistant");
  const entries = useAssistantStore((s) => s.entries);
  const status = useAssistantStore((s) => s.status);
  const activity = useAssistantStore((s) => s.activity);
  const canUndo = useAssistantStore((s) => s.undoSnapshot !== null && s.status === "idle");
  const undo = useAssistantStore((s) => s.undo);
  const end = useRef<HTMLDivElement>(null);
  const lastActions = entries.reduce((last, e, i) => (e.kind === "actions" ? i : last), -1);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [entries, status]);

  if (!entries.length) {
    return (
      <div className="text-muted-foreground flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <Sparkles className="text-primary size-6" />
        <p className="text-foreground text-sm font-medium">{t("emptyTitle")}</p>
        <p className="text-xs">{t("emptyBody")}</p>
      </div>
    );
  }

  return (
    <div
      aria-live="polite"
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2"
      role="log"
    >
      {entries.map((entry, i) => (
        <EntryView
          awaiting={status === "awaiting" && i === lastActions}
          entry={entry}
          key={entry.id}
        />
      ))}
      {status === "streaming" && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <LoaderCircle className="size-3.5 animate-spin" />
          {t(`activity.${activity}`)}
        </p>
      )}
      {canUndo && (
        <Button className="self-start" onClick={undo} size="xs" variant="outline">
          <RotateCcw />
          {t("undo")}
        </Button>
      )}
      <div ref={end} />
    </div>
  );
};

const PromptBar = () => {
  const t = useTranslations("Studio.ai-assistant");
  const mode = useAssistantStore((s) => s.mode);
  const setMode = useAssistantStore((s) => s.setMode);
  const status = useAssistantStore((s) => s.status);
  const send = useAssistantStore((s) => s.send);
  const stop = useAssistantStore((s) => s.stop);
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<AttachmentError | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const streaming = status === "streaming";
  const uploading = drafts.some((d) => d.status === "uploading");
  const canSend = !streaming && !uploading && (text.trim() !== "" || drafts.length > 0);

  const addFiles = (files: File[]) => {
    setError(null);
    if (drafts.length + files.length > MAX_ATTACHMENTS) {
      setError("count");
      return;
    }
    for (const file of files) {
      const kind = classifyAttachment(file.name, file.type);
      if (!kind) {
        setError("type");
        continue;
      }
      if (file.size > (kind.kind === "image" ? MAX_IMAGE_BYTES : MAX_ATTACHMENT_BYTES)) {
        setError("size");
        continue;
      }
      const localId = crypto.randomUUID();
      setDrafts((d) => [...d, { localId, name: file.name, kind: kind.kind, status: "uploading" }]);
      void uploadAttachment(file).then((result) => {
        if ("error" in result) {
          setError(result.error);
          setDrafts((d) => d.filter((x) => x.localId !== localId));
          return;
        }
        setDrafts((d) => {
          // Removed while it was uploading: nothing will send it, so it goes.
          if (!d.some((x) => x.localId === localId)) deleteAttachment(result.attachment.fileId);
          return d.map((x) =>
            x.localId === localId ? { ...x, status: "ready", attachment: result.attachment } : x,
          );
        });
      });
    }
  };

  const removeDraft = (draft: Draft) => {
    if (draft.attachment) deleteAttachment(draft.attachment.fileId);
    setDrafts((d) => d.filter((x) => x.localId !== draft.localId));
  };

  const submit = () => {
    if (!canSend) return;
    send(
      text,
      drafts.flatMap((d) => (d.attachment ? [d.attachment] : [])),
    );
    setText("");
    setDrafts([]);
    setError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (files.length) {
      event.preventDefault();
      addFiles(files);
    }
  };

  return (
    <div className="bg-background focus-within:border-ring grid shrink-0 gap-1.5 rounded-lg border p-1.5">
      {drafts.length > 0 && (
        <ul className="flex flex-wrap gap-1">
          {drafts.map((draft) => (
            <li
              className="bg-muted flex max-w-full items-center gap-1 rounded py-0.5 pr-0.5 pl-1.5 text-xs"
              key={draft.localId}
            >
              {draft.status === "uploading" ? (
                <LoaderCircle
                  aria-label={t("uploading")}
                  className="size-3 shrink-0 animate-spin"
                />
              ) : draft.kind === "image" ? (
                <ImageIcon className="size-3 shrink-0" />
              ) : (
                <FileText className="size-3 shrink-0" />
              )}
              <span className="max-w-32 truncate">{draft.name}</span>
              <Button
                aria-label={t("removeAttachment", { name: draft.name })}
                onClick={() => removeDraft(draft)}
                size="icon-xs"
                variant="ghost"
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="text-status-fail-text px-1 text-xs" role="alert">
          {error === "type" || error === "size" || error === "count"
            ? t(`attachmentErrors.${error}`, { count: MAX_ATTACHMENTS })
            : t(`notices.${error}`)}
        </p>
      )}
      <textarea
        aria-label={t("placeholder")}
        className="placeholder:text-muted-foreground field-sizing-content max-h-48 min-h-14 w-full resize-none bg-transparent px-1 text-xs outline-none"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        placeholder={status === "awaiting" ? t("placeholderAwaiting") : t("placeholder")}
        value={text}
      />
      <div className="flex items-center gap-1">
        <input
          accept={ATTACHMENT_ACCEPT}
          className="hidden"
          multiple
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
          ref={fileInput}
          type="file"
        />
        <Button
          aria-label={t("attach")}
          disabled={drafts.length >= MAX_ATTACHMENTS}
          onClick={() => fileInput.current?.click()}
          size="icon-sm"
          title={t("attach")}
          variant="ghost"
        >
          <Plus />
        </Button>
        <Select onValueChange={(value) => setMode(value as AssistantMode)} value={mode}>
          <SelectTrigger
            aria-label={t("modeLabel")}
            className="min-w-25 text-xs"
            size="sm"
            title={t(`modeHints.${mode}`)}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="text-xs">
            {(["manual", "auto"] as const).map((m) => (
              <SelectItem key={m} value={m}>
                <span className="text-xs">{t(`modes.${m}`)}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="flex-1" />
        {streaming ? (
          <Button aria-label={t("stop")} onClick={stop} size="icon-sm" title={t("stop")}>
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button
            aria-label={t("send")}
            disabled={!canSend}
            onClick={submit}
            size="icon-sm"
            title={t("send")}
          >
            <ArrowUp />
          </Button>
        )}
      </div>
    </div>
  );
};

/** The AI assistant tab of the studio sidebar: a conversation with Claude that can read and change the project. */
export const AiAssistant = ({ tab }: Props) => {
  const t = useTranslations("Studio.ai-assistant");
  const reset = useAssistantStore((s) => s.reset);
  const hasEntries = useAssistantStore((s) => s.entries.length > 0);

  return (
    <TabPanel
      aria-label={t("title")}
      className="text-sidebar-foreground min-h-0 flex-1"
      innerClassName="flex flex-col gap-2 p-2"
      tab={tab}
      value="ai-assistant"
    >
      <div className="flex shrink-0 items-center justify-between">
        <h2 className="text-xs font-medium">{t("title")}</h2>
        <Button
          disabled={!hasEntries}
          onClick={reset}
          size="xs"
          title={t("newChat")}
          variant="ghost"
        >
          <SquarePen />
          {t("newChat")}
        </Button>
      </div>
      <MessageList />
      <PromptBar />
    </TabPanel>
  );
};
