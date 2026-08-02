import { cn } from "@/lib/utils";
import type { ChatMessage } from "@/types";

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-3xl bg-secondary px-5 py-3 text-[15px] leading-7 text-foreground sm:max-w-[75%]">
          {message.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
        AC
      </div>
      <div className="min-w-0 max-w-[85%] flex-1 whitespace-pre-wrap rounded-3xl bg-muted px-5 py-3 text-[15px] leading-7 text-foreground sm:max-w-[90%]">
        {message.content}
      </div>
    </div>
  );
}
