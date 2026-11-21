<#
  Bring C:\yt-coach\wt to one commit of the coach build, from a git bundle made on the DGX.
  Started by rtx-job.sh (WSL) through jobq; hidden, BelowNormal.

  C:\yt-coach\wt is a worktree of the owner's checkout (C:\Users\delgado\src\yames), made by the
  relay's yames-coach-test.ps1. This does what that script does and no more: the bundle's
  branches are fetched into remote-style refs (refs/remotes/dgx/*), and the worktree is checked
  out DETACHED at the sha. The owner's own working tree, branches and HEAD are never touched.
  It refuses when the worktree has changes to tracked files (no destructive git).
  Log: C:\yt-coach\logs\s6\sync-<sha8>.log, last line PASS/FAIL.
#>
param(
  [Parameter(Mandatory = $true)][string]$Sha,
  [string]$Bundle = "C:\yt-coach\bundles\sync.bundle",
  [string]$Wt = "C:\yt-coach\wt"
)
$ErrorActionPreference = "Continue"
try { (Get-Process -Id $PID).PriorityClass = "BelowNormal" } catch {}
# A process started from WSL may not carry the Windows PATH: rebuild it from the registry.
$env:PATH = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$logs = "C:\yt-coach\logs\s6"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$short = $Sha.Substring(0, [Math]::Min(8, $Sha.Length))
$log = Join-Path $logs "sync-$short.log"
Set-Content -Path $log -Value ("[{0:HH:mm:ss}] sync {1} from {2}" -f (Get-Date), $Sha, $Bundle)
$t0 = Get-Date
function Done($ok, $m) {
  $secs = [int]((Get-Date) - $t0).TotalSeconds
  $line = if ($ok) { "PASS sync $Sha ($m, ${secs}s)" } else { "FAIL sync $Sha ($m, ${secs}s)" }
  Add-Content -Path $log -Value $line
  Get-Content $log -Tail 15 | Select-Object -SkipLast 1
  Write-Output $line
  exit ([int](-not $ok))
}
function Git($argline) {
  cmd /c "git -C `"$Wt`" $argline >> `"$log`" 2>&1"
  return $LASTEXITCODE
}

if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Done $false "git is not on PATH" }
if (-not (Test-Path (Join-Path $Wt ".git"))) { Done $false "no worktree at $Wt" }
if (-not (Test-Path $Bundle)) { Done $false "no bundle at $Bundle" }

$dirty = (cmd /c "git -C `"$Wt`" status --porcelain --untracked-files=no 2>&1") -join "`n"
if ($dirty.Trim()) { Add-Content $log $dirty; Done $false "the worktree has changes to tracked files; left as it is" }

if (Git "bundle verify `"$Bundle`"") { Done $false "bundle verify (a thin bundle whose base the RTX lacks?)" }
if (Git "fetch --no-tags `"$Bundle`" +refs/heads/*:refs/remotes/dgx/*") { Done $false "git fetch from the bundle" }
$full = (cmd /c "git -C `"$Wt`" rev-parse --verify --quiet `"$Sha^{commit}`"" 2>$null)
if (-not $full) { Done $false "$Sha is not in the bundle" }
$full = "$full".Trim()
if (Git "checkout --detach $full") { Done $false "git checkout --detach" }
$head = (cmd /c "git -C `"$Wt`" rev-parse HEAD").Trim()
if ($head -ne $full) { Done $false "HEAD is $head after checkout" }

# tauri's generate_context! wants the frontend folder to exist at compile time.
$dist = Join-Path $Wt "dist"
if (-not (Test-Path $dist)) {
  New-Item -ItemType Directory -Force -Path $dist | Out-Null
  Set-Content -Path (Join-Path $dist "index.html") -Value "<html></html>"
}
$subject = (cmd /c "git -C `"$Wt`" log -1 --format=%s HEAD").Trim()
Add-Content $log "HEAD $head $subject"
Done $true "HEAD $head"
