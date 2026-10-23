import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

type Value = string | number | boolean | null;

/** A sortable column: the value to sort by (dates as YYYY-MM-DD text sort correctly). */
export interface Column<T> {
  key: string;
  value: (row: T) => Value;
  /** The direction of the first click: 'asc' for names, 'desc' (the default) for the rest. */
  first?: 'asc' | 'desc';
}

interface ViewState {
  sort: string | null;
  dir: 'asc' | 'desc';
  query: string;
}

/** Whether `query` matches the start of any word in `text`, ignoring case ("jo", "martin jo"). */
export function matchesWordStart(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const t = text.toLowerCase();
  return t.startsWith(q) || t.includes(` ${q}`) || t.includes(`-${q}`);
}

function read(storageKey: string): ViewState {
  const empty: ViewState = { sort: null, dir: 'desc', query: '' };
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? { ...empty, ...(JSON.parse(stored) as Partial<ViewState>) } : empty;
  } catch {
    return empty;
  }
}

const collator = new Intl.Collator('da', { sensitivity: 'base', numeric: true });

function compare(a: Value, b: Value): number {
  if (a === b) return 0;
  // Missing values always go last.
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === 'string' && typeof b === 'string') return collator.compare(a, b);
  return Number(a) - Number(b);
}

/**
 * Sorting and searching for a table, remembered in this browser under `storageKey`. Rows come
 * in their default order, which is kept when no column is chosen and among equal values.
 */
export function useTableView<T>(
  storageKey: string,
  rows: readonly T[],
  columns: readonly Column<T>[],
  matches: (row: T, query: string) => boolean,
) {
  const [state, setState] = useState(() => read(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Storage is unavailable (a private window): the view just isn't remembered.
    }
  }, [storageKey, state]);

  const column = columns.find((c) => c.key === state.sort);
  const filtered = rows.filter((row) => matches(row, state.query));
  // The sort is stable, so equal values keep the default order.
  const sorted = column
    ? [...filtered].sort((x, y) => {
        const a = column.value(x);
        const b = column.value(y);
        // Missing values stay last in both directions.
        if (a === null || b === null) return compare(a, b);
        return state.dir === 'asc' ? compare(a, b) : compare(b, a);
      })
    : filtered;

  const sortBy = (key: string) =>
    setState((current) => {
      if (current.sort === key) {
        return { ...current, dir: current.dir === 'asc' ? 'desc' : 'asc' };
      }
      const first = columns.find((c) => c.key === key)?.first ?? 'desc';
      return { ...current, sort: key, dir: first };
    });

  return {
    rows: sorted,
    query: state.query,
    setQuery: (query: string) => setState((current) => ({ ...current, query })),
    /** A column header that sorts the table by `key` when clicked. */
    header: (key: string, label: ReactNode) => (
      <SortHeader
        key={key}
        label={label}
        active={state.sort === key ? state.dir : null}
        onClick={() => sortBy(key)}
      />
    ),
  };
}

function SortHeader({
  label,
  active,
  onClick,
}: {
  label: ReactNode;
  active: 'asc' | 'desc' | null;
  onClick: () => void;
}) {
  return (
    <th aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : undefined}>
      <button type="button" className="sort-button" onClick={onClick}>
        {label}
        <span className="sort-arrow" aria-hidden="true">
          {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
        </span>
      </button>
    </th>
  );
}

/** The search field above a table. */
export function TableSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      className="table-search"
      placeholder={placeholder}
      aria-label={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * A column heading with a shorter form for phones ("Sæsonpoint" → "Point"), where the tables are
 * compact. The full heading is the short one's tooltip.
 */
export function ColumnLabel({ full, short }: { full: string; short: string }) {
  return (
    <>
      <span className="label-full">{full}</span>
      <abbr className="label-short" title={full}>
        {short}
      </abbr>
    </>
  );
}

/** The width where the tables turn compact, as the pool tables (PoolTable). */
const PHONE = '(max-width: 600px)';
/** The smallest font a table shrinks to on a phone (0.65rem), like the pool tables. */
const MIN_FONT_PX = 10.4;

/**
 * A table's scroll box that, on phones, shrinks the table's font until it fits the screen (but
 * not below MIN_FONT_PX), so it needs no swiping. The cells' padding is in em on phones, so it
 * shrinks with the text. A table still too wide at the smallest font scrolls sideways. It fits
 * again when the screen turns or the rows change.
 */
export function FitTable({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const fit = () => {
      const table = box.querySelector('table');
      if (!table) return;
      table.style.fontSize = '';
      if (!window.matchMedia(PHONE).matches) return;
      // Padding and borders don't shrink in proportion, so it takes a step or two.
      for (let step = 0; step < 4 && table.scrollWidth > box.clientWidth; step++) {
        const size = parseFloat(getComputedStyle(table).fontSize);
        if (size <= MIN_FONT_PX) break;
        const next = Math.max(MIN_FONT_PX, (size * box.clientWidth) / table.scrollWidth);
        table.style.fontSize = `${next}px`;
      }
    };
    fit();
    const resized = new ResizeObserver(fit);
    resized.observe(box);
    // New rows (a search, live updates) can make it wider.
    const changed = new MutationObserver(fit);
    changed.observe(box, { childList: true, subtree: true, characterData: true });
    return () => {
      resized.disconnect();
      changed.disconnect();
    };
  }, []);

  return (
    <div ref={ref} className={className ? `table-scroll ${className}` : 'table-scroll'}>
      {children}
    </div>
  );
}
