"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { MessageBubble } from "./MessageBubble";
import { AgentPlanTracker } from "./AgentPlanTracker";
import { ChatBackdrop } from "./ChatBackdrop";
import type { AgentStreamEvent, ChatMessage, TaskStep } from "@/types";

function LinkHome() {
  return (
    <Link href="/" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
      Home
    </Link>
  );
}

const EMAIL_STORAGE_KEY = "adaptcoach_client_email";

export function ChatWindow() {
  const [email, setEmail] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [checkingProfile, setCheckingProfile] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [taskPlan, setTaskPlan] = useState<TaskStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(EMAIL_STORAGE_KEY);
    if (stored) setEmail(stored);
  }, []);

  // Greeting from profile lookup — avoid running the graph on load
  useEffect(() => {
    if (!email || bootstrapped.current) return;
    bootstrapped.current = true;
    setCheckingProfile(true);

    fetch(`/api/agent/profile?email=${encodeURIComponent(email)}`)
      .then((res) => res.json())
      .then((data: { exists: boolean; name: string | null; onboardingStatus: string | null; planSummary: string | null }) => {
        const greeting =
          data.onboardingStatus === "active"
            ? [
                `Welcome back${data.name ? `, ${data.name}` : ""}!`,
                "How has training been going?",
                data.planSummary,
                [
                  "When you're ready, send a check-in like:",
                  '- "Weighed 62 kg, did all 3 workouts, soreness 2"',
                  '- "Weight 138 lbs, did 2 of 3 workouts this week"',
                ].join("\n"),
                "Note: check-ins track weight and workouts. Meal logging isn't available yet — follow the calorie/macro targets on your plan.",
              ]
                .filter(Boolean)
                .join("\n\n")
            : [
                "Hi! I'm your CoachGraph coach.",
                "I'll build a simple starter plan for you. Tell me about:",
                [
                  "- Your goal (fat loss, muscle gain, etc.)",
                  "- Age, height, and weight",
                  "- How active you are",
                  "- What equipment you have",
                  "- Any injuries (or say none)",
                ].join("\n"),
                "You can share it all at once, or one thing at a time — whatever's easier.",
              ].join("\n\n");
        setMessages([{ role: "assistant", content: greeting }]);
      })
      .catch(() => {
        setMessages([
          {
            role: "assistant",
            content: "Hi! Tell me about your fitness goals and I'll help you get started.",
          },
        ]);
      })
      .finally(() => setCheckingProfile(false));
  }, [email]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, taskPlan]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  async function sendTurn(history: ChatMessage[], userText: string) {
    const nextMessages: ChatMessage[] = [...history, { role: "user", content: userText }];
    setMessages(nextMessages);
    setTaskPlan([]);
    setIsStreaming(true);
    setError(null);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientEmail: email, messages: nextMessages }),
      });

      if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastEvent: AgentStreamEvent | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const event: AgentStreamEvent = JSON.parse(line);
          if (event.error) {
            setError(event.error);
            continue;
          }
          lastEvent = event;
          setTaskPlan(event.taskPlan);
        }
      }

      if (lastEvent?.assistantReply) {
        setMessages((prev) => [...prev, { role: "assistant", content: lastEvent!.assistantReply! }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setIsStreaming(false);
    }
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    window.localStorage.setItem(EMAIL_STORAGE_KEY, trimmed);
    setEmail(trimmed);
  }

  function handleSend() {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || checkingProfile) return;
    setInput("");
    void sendTurn(messages, trimmed);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  if (!email) {
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <ChatBackdrop />
        <div className="absolute left-4 top-4 z-10">
          <LinkHome />
        </div>
        <div className="relative z-10 w-full max-w-md text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
            CG
          </div>
          <h2 className="font-display text-2xl font-semibold tracking-tight">
            Welcome to CoachGraph
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your email to get started — we&apos;ll use it to save your profile and recognize you next time.
          </p>
          <form onSubmit={handleEmailSubmit} className="mt-8 flex gap-2">
            <Input
              type="email"
              required
              placeholder="you@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              className="h-12 rounded-full px-5"
            />
            <Button type="submit" size="lg" className="h-12 shrink-0 rounded-full px-6">
              Continue
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const canSend = Boolean(input.trim()) && !isStreaming && !checkingProfile;

  return (
    <div className="relative flex h-screen flex-col bg-background">
      <ChatBackdrop />

      <div className="relative z-10 flex h-12 shrink-0 items-center justify-between border-b border-border/50 bg-background/70 px-4 backdrop-blur-md">
        <LinkHome />
        <p className="text-sm font-medium text-foreground/80">CoachGraph</p>
        <span className="w-16" />
      </div>

      <div className="relative z-10 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:px-6">
          {checkingProfile && (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading your profile...
            </div>
          )}

          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} />
          ))}

          {isStreaming && <AgentPlanTracker taskPlan={taskPlan} isStreaming={isStreaming} />}

          {error && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="relative z-10 shrink-0 bg-gradient-to-t from-background via-background/95 to-transparent px-4 pb-4 pt-2 sm:px-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="mx-auto w-full max-w-3xl"
        >
          <div className="relative flex items-end gap-2 rounded-[28px] border border-border/80 bg-background/90 px-3 py-2 shadow-[0_0_0_1px_hsl(var(--border)/0.4),0_8px_30px_-12px_hsl(222_47%_8%_/_0.18)] backdrop-blur-md">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message CoachGraph..."
              disabled={isStreaming || checkingProfile}
              rows={1}
              className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-[15px] leading-6 outline-none placeholder:text-muted-foreground disabled:opacity-50"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              className={cn(
                "mb-0.5 h-9 w-9 shrink-0 rounded-full transition-opacity",
                !canSend && "opacity-40"
              )}
            >
              {isStreaming ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            CoachGraph can make mistakes. Check important details against your plan.
          </p>
        </form>
      </div>
    </div>
  );
}
