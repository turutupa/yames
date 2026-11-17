/** Whether this webview can give us a WebGL2 context we should use. Checked once, lazily. */
let cached: boolean | null = null;

/** A renderer that draws on the CPU: SwiftShader, Mesa's llvmpipe, Microsoft Basic Render. */
export function isSoftwareRenderer(renderer: string): boolean {
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(renderer);
}

declare global {
  interface Window {
    /** The `?shot=` harness and the layout suite run on SwiftShader and must see the 3D neck. */
    __YAMES_ALLOW_SOFTWARE_GL__?: boolean;
  }
}

/**
 * WebGL2, on a real GPU. A software renderer is refused on purpose: measured on
 * a running Take it costs about nine CPU cores (against a fifth of one on a GPU),
 * and the click shares that CPU. Those machines get the SVG neck instead.
 *
 * The name is not always there to read (WebKitGTK reports "Apple GPU" on every
 * Linux machine), so this is the first of two checks: the controller also
 * times a few frames once the engine has compiled (`speed.ts`).
 */
export function webgl2Available(): boolean {
  if (cached !== null) return cached;
  try {
    if (typeof window === "undefined" || !("WebGL2RenderingContext" in window)) return (cached = false);
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") as WebGL2RenderingContext | null;
    let ok = !!gl;
    if (gl && !window.__YAMES_ALLOW_SOFTWARE_GL__) {
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? "");
      if (isSoftwareRenderer(renderer)) ok = false;
    }
    cached = ok;
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    cached = false;
  }
  return cached;
}
