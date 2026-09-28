"use client";

import { useEffect, useRef, useState } from "react";
import type { AskHomewardResponse, DischargeData } from "@/lib/types";

interface AskHomewardProps {
  discharge: DischargeData;
}

interface Message {
  role: "user" | "assistant";
  text: string;
  type?: AskHomewardResponse["type"];
}

interface Position {
  x: number;
  y: number;
}

const SUGGESTIONS = [
  "Can I shower today?",
  "When's my next dose?",
  "What was I told about lifting?",
  "When's my follow-up?",
];

// Below this, a pointer-down/up counts as a click (open/close), not a drag — otherwise every
// tap-to-open would register as a zero-pixel "drag" and nothing would ever open.
const DRAG_THRESHOLD_PX = 4;

function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}

function DragHandleIcon() {
  return (
    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
      <circle cx="6" cy="5" r="1.3" />
      <circle cx="14" cy="5" r="1.3" />
      <circle cx="6" cy="10" r="1.3" />
      <circle cx="14" cy="10" r="1.3" />
      <circle cx="6" cy="15" r="1.3" />
      <circle cx="14" cy="15" r="1.3" />
    </svg>
  );
}

function clampToViewport(x: number, y: number, width: number, height: number): Position {
  const maxX = Math.max(window.innerWidth - width, 0);
  const maxY = Math.max(window.innerHeight - height, 0);
  return { x: Math.min(Math.max(x, 0), maxX), y: Math.min(Math.max(y, 0), maxY) };
}

export function AskHomeward({ discharge }: AskHomewardProps) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);

  // null = not yet dragged this session — render at the default bottom-right anchor via CSS.
  // Once set, position is explicit fixed coordinates instead. Plain component state is enough
  // to "persist for the session" (survives collapse/expand, doesn't survive a reload) since
  // this component stays mounted the whole time — see the file header of RecoveryTracer.tsx.
  const [pos, setPos] = useState<Position | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const dragOrigin = useRef<{ pointerX: number; pointerY: number; elX: number; elY: number } | null>(null);
  const didDrag = useRef(false);

  // Re-clamp whenever the rendered element's size changes (opening swaps a small pill for a
  // much bigger panel) or the viewport itself resizes — keeps it fully on-screen either way,
  // not just at the moment a drag ends.
  useEffect(() => {
    function reclamp() {
      const el = rootRef.current;
      if (!el) return;
      setPos((prev) => {
        if (!prev) return prev;
        const rect = el.getBoundingClientRect();
        return clampToViewport(prev.x, prev.y, rect.width, rect.height);
      });
    }
    reclamp();
    window.addEventListener("resize", reclamp);
    return () => window.removeEventListener("resize", reclamp);
  }, [open]);

  function handlePointerDown(e: React.PointerEvent) {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragOrigin.current = { pointerX: e.clientX, pointerY: e.clientY, elX: rect.left, elY: rect.top };
    didDrag.current = false;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    const origin = dragOrigin.current;
    const el = rootRef.current;
    if (!origin || !el) return;
    const dx = e.clientX - origin.pointerX;
    const dy = e.clientY - origin.pointerY;
    if (!didDrag.current) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      didDrag.current = true;
    }
    const rect = el.getBoundingClientRect();
    setPos(clampToViewport(origin.elX + dx, origin.elY + dy, rect.width, rect.height));
  }

  function handlePointerUp() {
    dragOrigin.current = null;
    // Leave didDrag true through the click event that follows pointerup on the same element
    // (that's how the browser tells a drag from a tap), then reset for next time.
    if (didDrag.current) setTimeout(() => (didDrag.current = false), 0);
  }

  const dragHandlers = {
    onPointerDown: handlePointerDown,
    onPointerMove: handlePointerMove,
    onPointerUp: handlePointerUp,
  };

  function toggleOpen(next: boolean) {
    if (didDrag.current) return; // suppress the click that follows a drag
    setOpen(next);
  }

  function goToCheckin() {
    setOpen(false);
    document.getElementById("checkin-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function ask(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;
    // `messages` here is everything BEFORE this turn (setMessages below hasn't applied to this
    // closure yet) — exactly the prior-turns history the API needs for conversational follow-ups.
    const history = messages.map((m) => ({ role: m.role, content: m.text }));
    setMessages((prev) => [...prev, { role: "user", text: trimmed }]);
    setQuestion("");
    setLoading(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ discharge, question: trimmed, history }),
      });
      const data = await res.json();
      const response: AskHomewardResponse | undefined = data.response;
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: response?.answer ?? "Something went wrong answering that — please try again.",
          type: response?.type,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Something went wrong answering that — please try again." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    ask(question);
  }

  const posStyle: React.CSSProperties = pos
    ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" }
    : {};
  const anchorClass = pos ? "" : "bottom-5 right-5";

  if (!open) {
    return (
      <button
        ref={(el) => {
          rootRef.current = el;
        }}
        style={posStyle}
        {...dragHandlers}
        onClick={() => toggleOpen(true)}
        className={`fixed z-40 inline-flex touch-none items-center gap-2 rounded-full bg-homeward-primary px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-homeward-primaryDark active:cursor-grabbing sm:px-4 sm:py-3 ${anchorClass}`}
      >
        <ChatIcon />
        {/* Shorter label on narrow viewports — the full-width pill was colliding with
            TodayCard's "Do today's check-in" button on phone-height screens. */}
        <span className="sm:hidden">Ask Homeward</span>
        <span className="hidden sm:inline">Need help? Ask Homeward</span>
      </button>
    );
  }

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
      }}
      style={posStyle}
      className={`fixed z-40 flex max-h-[32rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-homeward-border bg-homeward-card shadow-xl ${anchorClass}`}
    >
      <div
        {...dragHandlers}
        className="flex touch-none cursor-grab items-center justify-between border-b border-homeward-border bg-homeward-forest px-4 py-3 active:cursor-grabbing"
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <DragHandleIcon />
          <ChatIcon />
          Ask Homeward
        </div>
        <button
          onClick={() => toggleOpen(false)}
          aria-label="Close"
          className="rounded-md p-1 text-white/80 transition hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 5l10 10M15 5L5 15" />
          </svg>
        </button>
      </div>

      <p className="disclaimer m-3 !rounded-lg text-[11px]">
        Ask Homeward answers only from your own plan and general recovery guides — it never
        diagnoses. For how you&apos;re feeling right now, use today&apos;s check-in.
      </p>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 pb-2">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-xs text-homeward-muted">Try asking:</p>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-full border border-homeward-border bg-homeward-bg px-2.5 py-1 text-xs text-homeward-ink transition hover:border-homeward-primary hover:text-homeward-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-homeward-primary px-3 py-2 text-sm text-white">
                {m.text}
              </div>
            </div>
          ) : (
            <div key={i} className="flex justify-start">
              <div
                className={`max-w-[85%] rounded-2xl rounded-bl-sm border px-3 py-2 text-sm ${
                  m.type === "redirect"
                    ? "border-amber-200 bg-amber-50 text-amber-900"
                    : m.type === "term"
                      ? "border-sky-200 bg-sky-50 text-sky-900"
                      : "border-homeward-border bg-homeward-bg text-homeward-ink"
                }`}
              >
                <p>{m.text}</p>
                {m.type === "redirect" && (
                  <button
                    onClick={goToCheckin}
                    className="mt-2 text-xs font-semibold text-homeward-primaryDark underline underline-offset-2"
                  >
                    Go to today&apos;s check-in ↓
                  </button>
                )}
              </div>
            </div>
          ),
        )}

        {loading && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-homeward-border bg-homeward-bg px-3 py-2 text-sm text-homeward-muted">
              Thinking…
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-homeward-border p-3">
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about your plan…"
          className="input flex-1 text-sm"
          disabled={loading}
        />
        <button type="submit" disabled={loading || !question.trim()} className="btn-primary px-3 py-2 text-sm">
          Ask
        </button>
      </form>
    </div>
  );
}
