# Click with the neck, 2026-11-16, UNDER LOAD: not a gate result

Machine: DGX Spark (GB10, 20 cores), five other workers building and testing. Build: mvp-e2e (no song-end fix), release, no LLM, --features callback-probe-alloc. Command: `npm run test:e2e:probe -- --no-build`.

| run | p99 jitter ms | missed beats | cb allocs/frees | dropped notif. | CPU cores while playing | loadavg at start |
|---|---|---|---|---|---|---|
| headless click-jitter-probe | 1.02264 | 0 | 0/0 | 0 | - | 9.57 32.29 28.71 8/1984 570152 |
| app, neck 3d-webgl2 (xvfb) | 0.4187 | 0 | 0/0 | 0 | {"pipewire-pulse":0.02,"yames":0.17,"WebKitWebProces":0.86} | 9.57 32.29 28.71 8/1984 570152 |
| app, neck 3d-webgl2 (gpu) | 0.63818 | 0 | 0/0 | 0 | {"pipewire-pulse":0.02,"yames":0.17,"WebKitWebProces":0.35} | 3.64 18.39 23.89 6/1805 578467 |

Renderer: Xvfb row, WebKit policy "never" (software compositing), WebGL2 context on the GPU via NVIDIA EGL (`nvidia-smi` lists WebKitWebProcess, 168 MiB). GPU row: Xorg on the GB10, policy "always", DMABuf renderer with shared-memory buffers (`WEBKIT_DMABUF_RENDERER_FORCE_SHM=1`), WebKitWebProcess 354 MiB on the GPU. The page's own WebGL renderer string is "Apple GPU" in both (WebKitGTK masks it).

Buffers: app 1176 frames at 44.1 kHz (26.7 ms); headless probe 1882 frames (42.7 ms). PipeWire data loops at SCHED_FIFO 88; the app's cpal threads at normal priority.

## Load

```
== before Xvfb 2026-11-16T20:40:19-08:00
 20:40:19 up 1 day,  9:25,  1 user,  load average: 10.23, 32.80, 28.86
%CPU USER           COMMAND
 613 dgx-personal   yames_lib-2ad1a
15.5 dgx-delgado    phoenix
 9.0 dgx-personal   claude
 5.6 dgx-delgado    llama-server
 3.2 netdata        netdata
 2.4 netdata        apps.plugin
 2.1 dgx-personal   2.1.325

== after Xvfb 2026-11-16T20:43:40-08:00
 20:43:40 up 1 day,  9:28,  1 user,  load average: 3.79, 18.67, 24.01
%CPU USER           COMMAND
 100 dgx-personal   ld
44.7 dgx-personal   rustc
30.2 dgx-personal   rustc
15.5 dgx-delgado    phoenix
 8.5 dgx-personal   cargo
 6.2 dgx-personal   cargo
 5.5 dgx-delgado    llama-server

== after GPU 2026-11-16T20:45:58-08:00
 20:45:58 up 1 day,  9:31,  1 user,  load average: 2.56, 12.77, 21.07
%CPU USER           COMMAND
15.5 dgx-delgado    phoenix
 5.5 dgx-delgado    llama-server
 3.1 netdata        netdata
 2.4 netdata        apps.plugin
 2.1 dgx-personal   2.1.325
 1.9 dgx-delgado    openclaw-gatewa
 1.8 dgx-personal   git-remote-http

```
