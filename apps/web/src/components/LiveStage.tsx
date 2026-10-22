import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** The content is never scaled up more than this, so a final alone doesn't fill the TV. */
const MAX_SCALE = 3;

interface Placement {
  scale: number;
  left: number;
  top: number;
}

/**
 * The part of /live below the header. The TV can't be scrolled, so the content (the pools, or the
 * bracket during the knockout) is laid out at its natural size, then scaled up or down to fill
 * the screen (at most MAX_SCALE) and centred. Re-measured whenever the screen or the content
 * changes size.
 */
export function LiveStage({ children }: { children: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<Placement>();

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const content = contentRef.current!;
    const fit = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      // offsetWidth/Height ignore transforms: the natural size.
      const scale = Math.min(width / content.offsetWidth, height / content.offsetHeight, MAX_SCALE);
      setPlaced({
        scale,
        left: (width - content.offsetWidth * scale) / 2,
        top: (height - content.offsetHeight * scale) / 2,
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    observer.observe(content);
    return () => observer.disconnect();
  }, []);

  const style: CSSProperties = placed
    ? { left: placed.left, top: placed.top, transform: `scale(${placed.scale})` }
    : // Not measured yet: laid out, but not shown.
      { visibility: 'hidden' };

  return (
    <div ref={stageRef} className="live-stage">
      <div ref={contentRef} className="live-fit" style={style}>
        {children}
      </div>
    </div>
  );
}
