"use client";

import { isValidElement, useRef, useState } from "react";
import * as Primitive from "@radix-ui/react-tooltip";

/** Hover and keyboard hints that flip at viewport edges and stay above dialogs. */
export default function Tooltip({ text, children, position = "top", color }) {
  const anchor = useRef(null);
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState(null);
  const directTrigger = isValidElement(children) && typeof children.type === "string"
    && ["button", "a", "input"].includes(children.type) && !children.props.disabled;

  if (!text) return children;
  return (
    <Primitive.Provider delayDuration={250} skipDelayDuration={100}>
      <Primitive.Root open={open} onOpenChange={(next) => {
        // Body portals sit below the browser's top layer. Keep hints inside the
        // nearest native dialog so focus management and visual stacking agree.
        if (next) setContainer(anchor.current?.closest("dialog[open]") || null);
        setOpen(next);
      }}>
        <span ref={anchor} className="relative inline-flex min-w-0">
          <Primitive.Trigger asChild>
            {directTrigger ? children : <span tabIndex={0} className="inline-flex min-w-0 rounded-md outline-offset-4">{children}</span>}
          </Primitive.Trigger>
        </span>
        <Primitive.Portal container={container || undefined}>
          <Primitive.Content
            side={position}
            sideOffset={8}
            collisionPadding={12}
            className="workspace-tooltip z-[100] max-w-[min(17rem,calc(100vw-24px))] rounded-xl border border-white/10 bg-text-main px-3 py-2 text-xs leading-relaxed text-bg shadow-elevated outline-none"
            style={color ? { backgroundColor: color, color: "#fff" } : undefined}
          >
            {text}
            <Primitive.Arrow className="fill-text-main" style={color ? { fill: color } : undefined} width={10} height={5} />
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
