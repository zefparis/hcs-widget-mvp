/**
 * HCS-U7 Widget v3 — DOM utilities
 * All UI creation uses textContent, never innerHTML.
 */

/** Create an element with styles and textContent (safe, no innerHTML) */
export function el(
  tag: string,
  styles: string,
  text?: string
): HTMLElement {
  const node = document.createElement(tag);
  node.style.cssText = styles;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Append multiple children to a parent */
export function append(parent: HTMLElement, ...children: HTMLElement[]): void {
  for (const child of children) parent.appendChild(child);
}

/** Remove an element by ID if it exists */
export function removeById(id: string): void {
  const node = document.getElementById(id);
  if (node) node.remove();
}

/** Run callback when DOM is ready */
export function onReady(fn: () => void): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
}

/** Safely append to body (waits for body if needed) */
export function appendToBody(node: HTMLElement): void {
  if (document.body) {
    document.body.appendChild(node);
  } else {
    onReady(() => document.body.appendChild(node));
  }
}
