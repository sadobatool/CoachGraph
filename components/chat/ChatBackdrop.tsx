import { SignalField } from "@/components/brand/SignalField";

/** Side-rail signal animation — keeps the chat column clear in the center. */
export function ChatBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-y-0 left-0 hidden w-[min(28vw,320px)] overflow-hidden opacity-80 lg:block">
        <SignalField idPrefix="chat-left" edgeFade={false} className="scale-110" />
        <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-background to-transparent" />
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>

      <div className="absolute inset-y-0 right-0 hidden w-[min(28vw,320px)] overflow-hidden opacity-80 lg:block">
        <SignalField idPrefix="chat-right" edgeFade={false} className="scale-110 -translate-x-[35%]" />
        <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-background to-transparent" />
        <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-background to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
      </div>

      {/* Soft atmospheric wash on smaller screens where side rails hide */}
      <div className="absolute inset-0 lg:hidden">
        <SignalField idPrefix="chat-mobile" className="opacity-35" />
        <div className="absolute inset-0 bg-background/55" />
      </div>
    </div>
  );
}
