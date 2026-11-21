<#
  One gate of the coach build in C:\yt-coach\wt, on the RTX (Windows 11 ARM64). Started by
  rtx-job.sh (WSL) through jobq; hidden, BelowNormal.
    -Step check     read-only: tools, versions, HEAD, node_modules, browsers
    -Step tsc       tsc --noEmit
    -Step vitest    vitest run (the whole suite)
    -Step build     npm run build (tsc + vite build)
    -Step rust-lib  node scripts\rust-test.mjs --lib --no-default-features (= npm run test:rust, the Windows way)
  -Sha: refuse unless C:\yt-coach\wt's HEAD starts with it (a job runs on the commit it was given).
  Log: C:\yt-coach\logs\s6\<step>-<sha8>.log; the output's last line is PASS/FAIL with the minutes.
  Toolchain set-up for Rust copied from the relay's yames-coach-test.ps1 (vcvarsarm64, clang-cl,
  LLVM's libclang, Ninja, CARGO_TARGET_DIR=C:\yt-coach\target).
#>
param(
  [Parameter(Mandatory = $true)][ValidateSet("check", "tsc", "vitest", "build", "rust-lib")][string]$Step,
  [string]$Sha = "",
  [string]$Wt = "C:\yt-coach\wt",
  [string]$LlvmBin = "C:\Program Files\LLVM\bin"
)
$ErrorActionPreference = "Continue"
try { (Get-Process -Id $PID).PriorityClass = "BelowNormal" } catch {}
$env:PATH = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
$logs = "C:\yt-coach\logs\s6"
New-Item -ItemType Directory -Force -Path $logs | Out-Null
Set-Location $Wt
$head = (cmd /c "git rev-parse HEAD 2>&1").Trim()
$log = Join-Path $logs ("{0}-{1}.log" -f $Step, $head.Substring(0, [Math]::Min(8, $head.Length)))
$t0 = Get-Date
function Done($ok, $m) {
  $mins = [Math]::Round(((Get-Date) - $t0).TotalMinutes, 1)
  $line = if ($ok) { "PASS $Step $head ($m; $mins min)" } else { "FAIL $Step $head ($m; $mins min)" }
  Add-Content -Path $log -Value $line
  Write-Output $line
  exit ([int](-not $ok))
}
function Run($cmdline) {
  Add-Content -Path $log -Value ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $cmdline)
  cmd /c "$cmdline >> `"$log`" 2>&1"
  return $LASTEXITCODE
}
function Grep($pattern, $n) {
  Select-String -CaseSensitive -Path $log -Pattern $pattern | Select-Object -Last $n | ForEach-Object { $_.Line }
}
Set-Content -Path $log -Value ("[{0:HH:mm:ss}] {1} at {2} in {3}" -f (Get-Date), $Step, $head, $Wt)
if ($Sha -and -not $head.StartsWith($Sha)) { Done $false "HEAD is not ${Sha}; run sync first" }

$nm = Join-Path $Wt "node_modules"
if ($Step -in "tsc", "vitest", "build") {
  if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Done $false "node is not on PATH" }
  if (-not (Test-Path $nm)) { Done $false "no node_modules in $Wt (nothing installed; this leg may not install)" }
}

switch ($Step) {
  "check" {
    Write-Output "arch $env:PROCESSOR_ARCHITECTURE  HEAD $head"
    Write-Output ("tracked changes: " + ((cmd /c "git status --porcelain --untracked-files=no 2>&1") -join " | "))
    foreach ($t in "git", "node", "npm", "cargo", "rustc", "rustup", "cmake", "ninja", "clang-cl") {
      $c = Get-Command $t -ErrorAction SilentlyContinue
      Write-Output ("{0}: {1}" -f $t, $(if ($c) { $c.Source } else { "none" }))
    }
    Write-Output ("node " + (cmd /c "node --version 2>&1"))
    Write-Output ("rustup: " + ((cmd /c "rustup toolchain list 2>&1") -join " | "))
    Write-Output ("libclang: " + (Test-Path "$LlvmBin\libclang.dll"))
    Write-Output ("node_modules: " + (Test-Path $nm))
    Write-Output ("VULKAN_SDK (machine/user): " + [Environment]::GetEnvironmentVariable("VULKAN_SDK", "Machine") + " / " + [Environment]::GetEnvironmentVariable("VULKAN_SDK", "User"))
    $pw = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "ms-playwright"
    Write-Output ("playwright browsers ($pw): " + $(if (Test-Path $pw) { (Get-ChildItem $pw -Name) -join ", " } else { "none" }))
    Write-Output ("USERPROFILE=" + $env:USERPROFILE + "  profile=" + [Environment]::GetFolderPath("UserProfile"))
    Write-Output ("free RAM MB: " + [int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory / 1024))
    Done $true "read-only look"
  }
  "tsc" {
    $code = Run "node node_modules\typescript\bin\tsc --noEmit"
    Grep "error TS" 20
    Done ($code -eq 0) "exit $code"
  }
  "vitest" {
    $code = Run "node node_modules\vitest\vitest.mjs run"
    Grep "^\s*(Test Files|Tests|Duration)\s" 3
    Grep "FAIL " 20
    Done ($code -eq 0) ("exit $code; " + ((Grep "^\s*Tests\s" 1) -join "").Trim())
  }
  "build" {
    $code = Run "npm run build"
    Grep "error|built in" 20
    Done ($code -eq 0) "exit $code"
  }
  "rust-lib" {
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vswhere)) { Done $false "vswhere.exe not found" }
    $isArm = ($env:PROCESSOR_ARCHITECTURE -eq "ARM64")
    if ($isArm) {
      $vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.ARM64 -property installationPath
      if (-not $vs) { $vs = & $vswhere -latest -products * -property installationPath }
      $vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvarsarm64.bat"
    } else {
      $vs = & $vswhere -latest -products * -property installationPath
      $vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvars64.bat"
    }
    if (-not (Test-Path $vcvars)) { Done $false "vcvars not found under $vs" }
    cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
      if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
    }
    if (-not (Test-Path "$LlvmBin\libclang.dll")) { Done $false "libclang.dll not found in $LlvmBin" }
    $env:PATH = "$LlvmBin;$env:PATH"
    $env:LIBCLANG_PATH = $LlvmBin
    $env:CMAKE_GENERATOR = "Ninja"
    $env:CMAKE_POLICY_VERSION_MINIMUM = "3.5"
    $env:CARGO_TARGET_DIR = "C:\yt-coach\target"
    if ($isArm) {
      $link = Get-Command link.exe -All | Where-Object { $_.Source -like '*\VC\Tools\MSVC\*' } |
        Select-Object -First 1 -ExpandProperty Source
      if (-not $link) { Done $false "MSVC link.exe not on PATH after vcvars" }
      $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = $link
      $env:CC_aarch64_pc_windows_msvc = "clang-cl"
      $env:CXX_aarch64_pc_windows_msvc = "clang-cl"
      $env:CXXFLAGS_aarch64_pc_windows_msvc = "/EHsc"
      $toolchains = (cmd /c "rustup toolchain list 2>&1") -join " "
      if ($toolchains -match "stable-aarch64-pc-windows-msvc") { $env:RUSTUP_TOOLCHAIN = "stable-aarch64-pc-windows-msvc" }
    }
    $code = Run "node scripts\rust-test.mjs --lib --no-default-features"
    Grep "^test result|FAILED|panicked|^error" 30
    $res = ((Grep "^test result" 1) -join "").Trim()
    Done ($code -eq 0) "exit $code; $res"
  }
}
