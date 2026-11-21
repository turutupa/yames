<#
  Leg rtx2: the coach router's held-out eval on the RTX (Windows 11 ARM64, llama.cpp on Vulkan).
  Started by rtx-eval.sh (WSL) through jobq; hidden, BelowNormal. Writes only under C:\yt-coach\.
    -Step build  cargo build --release --features coach-llm-vulkan --bin coach-eval in C:\yt-coach\wt
                 (pv1's toolchain: vcvarsarm64, clang-cl, LLVM libclang, Ninja, VULKAN_SDK below),
                 target C:\yt-coach\target, binary copied to C:\yt-coach\bin\coach-eval-vk.exe.
                 -Sha: refuse unless the worktree's HEAD starts with it.
    -Step eval   coach-eval-vk.exe --gguf <Gguf> --requests C:\yt-coach\evals\requests.jsonl
                 --outcomes C:\yt-coach\evals\<Label>\outcomes.jsonl; nvidia-smi sampled every 2 s.
  Log: C:\yt-coach\logs\s6\<step>-<sha8|label>.log; the output's last line is PASS/FAIL with the minutes.
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet("build", "eval")][string]$Step,
  [string]$Sha = "",
  [string]$Gguf = "",
  [string]$Label = "",
  [string]$Wt = "C:\yt-coach\wt",
  [string]$LlvmBin = "C:\Program Files\LLVM\bin",
  [string]$VulkanSdk = "C:\Users\delgado\src\yames-tools\VulkanSDK-1.4.313.0"
)
$ErrorActionPreference = "Continue"
try { (Get-Process -Id $PID).PriorityClass = "BelowNormal" } catch {}
$env:PATH = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$logs = "C:\yt-coach\logs\s6"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$t0 = Get-Date
$bin = "C:\yt-coach\bin\coach-eval-vk.exe"
$smi = "C:\Windows\System32\nvidia-smi.exe"

if ($Step -eq "build") {
  Set-Location $Wt
  $head = (cmd /c "git rev-parse HEAD 2>&1").Trim()
  $log = Join-Path $logs ("build-coach-eval-{0}.log" -f $head.Substring(0, [Math]::Min(8, $head.Length)))
} else {
  Set-Location "C:\yt-coach"
  $head = $Label
  $log = Join-Path $logs "eval-$Label.log"
}
function Done($ok, $m) {
  $mins = [Math]::Round(((Get-Date) - $t0).TotalMinutes, 1)
  $line = if ($ok) { "PASS $Step $head ($m; $mins min)" } else { "FAIL $Step $head ($m; $mins min)" }
  Add-Content -Path $log -Value $line
  Write-Output $line
  exit ([int](-not $ok))
}
function Grep($pattern, $n) {
  Select-String -CaseSensitive -Path $log -Pattern $pattern | Select-Object -Last $n | ForEach-Object { $_.Line }
}
Set-Content -Path $log -Value ("[{0:HH:mm:ss}] {1} at {2}" -f (Get-Date), $Step, $head)

if ($Step -eq "build") {
  if ($Sha -and -not $head.StartsWith($Sha)) { Done $false "HEAD is not ${Sha}; run sync first" }
  $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
  if (-not (Test-Path $vswhere)) { Done $false "vswhere.exe not found" }
  $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.ARM64 -property installationPath
  if (-not $vs) { $vs = & $vswhere -latest -products * -property installationPath }
  $vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvarsarm64.bat"
  if (-not (Test-Path $vcvars)) { Done $false "vcvarsarm64.bat not found under $vs" }
  cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
    if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
  }
  $link = Get-Command link.exe -All | Where-Object { $_.Source -like '*\VC\Tools\MSVC\*' } | Select-Object -First 1 -ExpandProperty Source
  if (-not $link) { Done $false "MSVC link.exe not on PATH after vcvars" }
  if (-not (Test-Path "$LlvmBin\libclang.dll")) { Done $false "libclang.dll not found in $LlvmBin" }
  foreach ($f in "Include\vulkan\vulkan.h", "Lib\vulkan-1.lib", "Bin\glslc.exe") {
    if (-not (Test-Path (Join-Path $VulkanSdk $f))) { Done $false "Vulkan SDK incomplete: $f missing in $VulkanSdk" }
  }
  $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = $link
  $env:PATH = "$LlvmBin;$VulkanSdk\Bin;$env:PATH"
  $env:CC_aarch64_pc_windows_msvc = "clang-cl"
  $env:CXX_aarch64_pc_windows_msvc = "clang-cl"
  $env:CXXFLAGS_aarch64_pc_windows_msvc = "/EHsc"
  $env:LIBCLANG_PATH = $LlvmBin
  $env:CMAKE_GENERATOR = "Ninja"
  $env:CMAKE_POLICY_VERSION_MINIMUM = "3.5"
  $env:CMAKE_DISABLE_FIND_PACKAGE_OpenSSL = "TRUE"
  $env:CMAKE_DISABLE_FIND_PACKAGE_OpenMP = "TRUE"
  $env:CARGO_TARGET_DIR = "C:\yt-coach\target"
  $env:VULKAN_SDK = $VulkanSdk
  $toolchains = (cmd /c "rustup toolchain list 2>&1") -join " "
  if ($toolchains -match "stable-aarch64-pc-windows-msvc") { $env:RUSTUP_TOOLCHAIN = "stable-aarch64-pc-windows-msvc" }
  Add-Content $log ("toolchain: " + ((cmd /c 'rustc -vV 2>&1' | Select-String host) -join '') + " VULKAN_SDK=$env:VULKAN_SDK")
  cmd /c "cargo build --release --manifest-path src-tauri\Cargo.toml --features coach-llm-vulkan --bin coach-eval >> `"$log`" 2>&1"
  $code = $LASTEXITCODE
  Grep "^error|^warning: unused|Finished|Compiling yames" 20
  if ($code -ne 0) { Done $false "cargo exit $code" }
  Copy-Item -Force (Join-Path $env:CARGO_TARGET_DIR "release\coach-eval.exe") $bin
  $h = (Get-FileHash -Algorithm SHA256 $bin).Hash
  Done $true "cargo exit 0; $bin sha256 $h"
}

# eval
if (-not (Test-Path $bin)) { Done $false "no $bin; build first" }
if (-not (Test-Path $Gguf)) { Done $false "no $Gguf" }
$req = "C:\yt-coach\evals\requests.jsonl"
if (-not (Test-Path $req)) { Done $false "no $req" }
$dir = "C:\yt-coach\evals\$Label"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$outc = Join-Path $dir "outcomes.jsonl"
$errf = Join-Path $dir "stderr.log"
$smif = Join-Path $dir "nvidia-smi.csv"
Set-Content -Path $smif -Value "time,memory.used MiB,utilization.gpu %"
$q = "--query-gpu=memory.used,utilization.gpu"
$before = (& $smi $q "--format=csv,noheader,nounits" 2>&1) -join " "
Add-Content $log "nvidia-smi before: $before"
Add-Content $log "bin sha256 $((Get-FileHash -Algorithm SHA256 $bin).Hash)"
$p = Start-Process -FilePath $bin -ArgumentList @("--gguf", $Gguf, "--requests", $req, "--outcomes", $outc) `
  -NoNewWindow -PassThru -RedirectStandardError $errf -RedirectStandardOutput (Join-Path $dir "stdout.log")
$null = $p.Handle  # keeps ExitCode readable after exit
try { $p.PriorityClass = "BelowNormal" } catch {}
$peak = 0
while (-not $p.HasExited) {
  $s = (& $smi $q "--format=csv,noheader,nounits" 2>&1) -join " "
  Add-Content $smif ("{0:HH:mm:ss},{1}" -f (Get-Date), $s)
  $m = 0
  if ([int]::TryParse(($s -split ",")[0].Trim(), [ref]$m) -and $m -gt $peak) { $peak = $m }
  Start-Sleep -Seconds 2
}
$p.WaitForExit()
$code = $p.ExitCode
Get-Content $errf | Select-String -CaseSensitive -Pattern "ggml_vulkan|offloaded|using device|model buffer size|KV buffer size|compute buffer size|loaded .* in|requests in|backend=|error|panicked" |
  ForEach-Object { Add-Content $log $_.Line }
Add-Content $log "nvidia-smi before $before; peak memory.used during the run $peak MiB; samples $smif"
Get-Content $log | Select-Object -Skip 1
$n = if (Test-Path $outc) { (Get-Content $outc | Measure-Object -Line).Lines } else { 0 }
Done ($code -eq 0) "exit $code; $n outcomes; peak nvidia-smi memory.used $peak MiB"
