/** Whether this webview can give us a WebGL2 context. Checked once, lazily. */
let cached: boolean | null = null;

export function webgl2Available(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof window === "undefined" || !("WebGL2RenderingContext" in window)) return (cached = false);
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    cached = !!gl;
    (gl as WebGL2RenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
