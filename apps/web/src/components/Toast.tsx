/** A short message to show, with a key so the same text shown again starts over. */
export interface ToastMessage {
  text: string;
  key: number;
}

/**
 * A message at the bottom of the screen that fades away by itself (the CSS animation), e.g.
 * "Resultatet er låst". Nothing to click; `onDone` is called when it has faded out.
 */
export function Toast({ message, onDone }: { message: ToastMessage | null; onDone: () => void }) {
  if (!message) return null;
  return (
    <div key={message.key} className="toast" role="status" onAnimationEnd={onDone}>
      {message.text}
    </div>
  );
}
