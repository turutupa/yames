# Read-only look at the RTX (WSL side). Sent as the argument of `bash -c` in a jobq job.
renice -n 19 $$ >/dev/null 2>&1
echo "== whoami: $(whoami) host: $(hostname) wsl: $(uname -r)"
echo "== /mnt/c/yt-coach"; ls -la /mnt/c/yt-coach/ 2>&1
for d in bin models logs target; do echo "== $d"; ls -la /mnt/c/yt-coach/$d 2>&1 | head -20; done
echo "== wt"; ls -la /mnt/c/yt-coach/wt 2>&1 | head -60
echo "== wt/.git"; cat /mnt/c/yt-coach/wt/.git 2>&1
echo "== node_modules"; ls -la /mnt/c/yt-coach/wt/node_modules 2>&1 | head -5; ls /mnt/c/yt-coach/wt/node_modules 2>/dev/null | wc -l
ls -la /mnt/c/yt-coach/wt/node_modules/.bin/vitest* /mnt/c/yt-coach/wt/node_modules/.bin/tsc* 2>&1 | head
echo "== WSL tools"; for t in git node npm cargo rustc python3 scp ssh curl powershell.exe cmd.exe git.exe node.exe; do printf '%s: ' $t; command -v $t || echo none; done
echo "== windows tools via cmd.exe"
cd /mnt/c/yt-coach && cmd.exe /c "where git node npm cargo rustc rustup cmake ninja & git -C C:\yt-coach\wt rev-parse HEAD & git -C C:\yt-coach\wt log -1 --format=%cd%x20%s & git -C C:\yt-coach\wt status --porcelain & node --version & rustup toolchain list" 2>&1 | head -40
echo "== playwright browsers"; ls /mnt/c/Users/delgado/AppData/Local/ms-playwright 2>&1 | head
echo "== ssh config host lines (WSL)"; grep -i '^ *host\b\|hostname' ~/.ssh/config 2>&1 | head -20
echo "== ssh config host lines (Windows)"; grep -i '^ *host\b\|hostname' /mnt/c/Users/delgado/.ssh/config 2>&1 | head -20
echo "== known bundles"; ls -la /mnt/c/Users/delgado/src/*.bundle 2>&1
echo "== tailscale"; command -v tailscale; ls "/mnt/c/Program Files/Tailscale/" 2>&1 | head -3
echo "== disk"; df -h /mnt/c 2>&1 | tail -1
echo "== yt-coach-jobs"; ls -la ~/yt-coach-jobs 2>&1
