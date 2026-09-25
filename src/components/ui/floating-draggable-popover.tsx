"use client";

import { MouseEvent as ReactMouseEvent, PointerEvent, ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type AnchorRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

type Placement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

type FloatingDraggablePopoverProps = {
  anchorRect: AnchorRect | null;
  children: ReactNode;
  className: string;
  onClose: () => void;
  placement?: Placement;
  gap?: number;
  width?: number;
  dataAttribute?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function initialPosition(
  rect: AnchorRect,
  placement: Placement,
  width: number,
  gap: number
) {
  const margin = 12;
  const estimatedHeight = 360;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const left =
    placement.endsWith("end")
      ? rect.right - width
      : rect.left;
  const top =
    placement.startsWith("top")
      ? rect.top - estimatedHeight - gap
      : rect.bottom + gap;

  return {
    x: clamp(left, margin, Math.max(margin, viewportWidth - width - margin)),
    y: clamp(top, margin, Math.max(margin, viewportHeight - estimatedHeight - margin)),
  };
}

export default function FloatingDraggablePopover({
  anchorRect,
  children,
  className,
  onClose,
  placement = "bottom-start",
  gap = 8,
  width = 340,
  dataAttribute = "true",
}: FloatingDraggablePopoverProps) {
  const [mounted, setMounted] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!anchorRect || !mounted) {
      return;
    }

    setPosition(initialPosition(anchorRect, placement, width, gap));
  }, [anchorRect, gap, mounted, placement, width]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;

      if (target && containerRef.current?.contains(target)) {
        return;
      }

      onClose();
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [onClose]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    const target = event.target as HTMLElement;

    if (target.closest("button,input,select,textarea,a,label")) {
      return;
    }

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;

    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    setPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    });
  }

  function stopDrag(event: PointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleInternalClick(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();

    const target = event.target as HTMLElement;
    const actionElement = target.closest("button,a,[data-popover-close='true']");

    if (!actionElement || actionElement.closest("[data-popover-keep-open='true']")) {
      return;
    }

    window.setTimeout(onClose, 0);
  }

  if (!mounted || !anchorRect) {
    return null;
  }

  return createPortal(
    <div
      ref={containerRef}
      data-cadastros-popover={dataAttribute}
      data-finance-popover={dataAttribute}
      data-ledger-popover={dataAttribute}
      className={`${className} fixed z-[9999] cursor-grab touch-none select-none active:cursor-grabbing`}
      style={{
        left: position.x,
        top: position.y,
      }}
      onClick={handleInternalClick}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
    >
      {children}
    </div>,
    document.body
  );
}
