import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/** At most this share of the stage's height goes to the bracket; the pools get the rest. */
const BRACKET_SHARE = 0.5;
/** The bracket is scaled at most this many times more than the pools, so they stay readable. */
const BRACKET_GROWTH = 1.5;
/** Space between the bracket and the pools, in screen pixels. */
const GAP = 24;

interface Placement {
  scale: number;
  left: number;
  top: number;
}

/**
 * The part of /live below the header. The TV can't be scrolled, so the bracket (during the
 * knockout) and the pools are laid out at their natural size, then scaled up or down to fill the
 * screen and centred: the bracket on top, taking up to BRACKET_SHARE of the height (and growing
 * at most BRACKET_GROWTH times as much as the pools), and the pools below in whatever is left. Re-measured whenever the screen or the content changes size.
 */
export function LiveStage({ bracket, pools }: { bracket?: ReactNode; pools: ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const bracketRef = useRef<HTMLDivElement>(null);
  const poolsRef = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ bracket?: Placement; pools?: Placement }>({});
  const hasBracket = bracket !== undefined;

  useLayoutEffect(() => {
    const stage = stageRef.current!;
    const fit = () => {
      const width = stage.clientWidth;
      const height = stage.clientHeight;
      // offsetWidth/Height ignore transforms: the natural size.
      const b = bracketRef.current;
      const p = poolsRef.current!;
      let bracketScale = 0;
      let bracketHeight = 0;
      if (b) {
        // The pools' scale if the bracket were exactly BRACKET_GROWTH times bigger.
        const balanced = Math.min(
          width / p.offsetWidth,
          (height - GAP) / (p.offsetHeight + BRACKET_GROWTH * b.offsetHeight),
        );
        bracketScale = Math.min(
          width / b.offsetWidth,
          (height * BRACKET_SHARE) / b.offsetHeight,
          BRACKET_GROWTH * balanced,
        );
        bracketHeight = b.offsetHeight * bracketScale + GAP;
      }
      const poolsScale = Math.min(width / p.offsetWidth, (height - bracketHeight) / p.offsetHeight);
      const top = (height - bracketHeight - p.offsetHeight * poolsScale) / 2;
      setPlaced({
        bracket: b
          ? { scale: bracketScale, left: (width - b.offsetWidth * bracketScale) / 2, top }
          : undefined,
        pools: {
          scale: poolsScale,
          left: (width - p.offsetWidth * poolsScale) / 2,
          top: top + bracketHeight,
        },
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    for (const element of [stage, bracketRef.current, poolsRef.current]) {
      if (element) observer.observe(element);
    }
    return () => observer.disconnect();
  }, [hasBracket]);

  const style = (placement?: Placement): CSSProperties =>
    placement
      ? {
          left: placement.left,
          top: placement.top,
          transform: `scale(${placement.scale})`,
        }
      : // Not measured yet: laid out, but not shown.
        { visibility: 'hidden' };

  return (
    <div ref={stageRef} className="live-stage">
      {hasBracket && (
        <div ref={bracketRef} className="live-fit" style={style(placed.bracket)}>
          {bracket}
        </div>
      )}
      <div ref={poolsRef} className="live-fit" style={style(placed.pools)}>
        {pools}
      </div>
    </div>
  );
}
