// State of a dialog that reads something, shows the changes and then writes (or sends) on a click: shared by
// src/ui/refetchModal.tsx and src/ui/feedbackModal.tsx. A late answer after the dialog was closed is dropped, and
// only one action runs at a time (a second tap does nothing).
import { useEffect, useRef, useState } from "preact/hooks";
import { allKept } from "./changeList";
import type { Preview } from "../refetch";
import type { Part } from "../fingerprint";

export type Done = { ok: boolean; message?: string; stale?: boolean };

export function useChanges(p: { path: string; startLoading: boolean; onCancel: () => void; onCloseView: () => void }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(p.startLoading);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string>();
  // Parts edited by hand that the user wants replaced anyway; the default is to keep them.
  const [replace, setReplace] = useState<Part[]>([]);
  const alive = useRef(true);
  const running = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      p.onCancel();
    };
  }, [p.path]);
  /** Reads with `load`; the result replaces the list. */
  const read = (load: () => Promise<Preview>) => {
    setPreview(null);
    setReplace([]);
    setLoading(true);
    void load().then((r) => {
      if (!alive.current) return;
      setPreview(r);
      setLoading(false);
    });
  };
  /** Forgets what was read (the list is locked until the next read). */
  const clear = () => {
    setPreview(null);
    setReplace([]);
  };
  /** Runs one action (write, send, discard): closes on success, shows the message otherwise. `stale`: what to do if the note changed meanwhile. */
  const act = async (run: () => Promise<Done>, stale?: () => void) => {
    if (running.current) return;
    running.current = true;
    setActing(true);
    setMessage(undefined);
    try {
      const r = await run();
      if (!alive.current) return;
      if (r.ok) return p.onCloseView();
      setMessage(r.message);
      if (r.stale) stale?.();
    } finally {
      running.current = false;
      if (alive.current) setActing(false);
    }
  };
  const changes = preview?.ok ? preview.changes : [];
  const edited = preview?.ok ? preview.edited : [];
  return {
    preview,
    loading,
    acting,
    message,
    replace,
    setReplace,
    read,
    clear,
    act,
    changes,
    keptAll: allKept(changes, edited, replace),
  };
}
