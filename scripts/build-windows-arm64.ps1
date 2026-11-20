<#
.SYNOPSIS
  Local release build of Yames for Windows on ARM (aarch64-pc-windows-msvc),
  native, with the beta's features. No GitHub Actions involved.

.DESCRIPTION
  The beta workflow (.github/workflows/beta.yml) only builds x86_64 Windows,
  which an ARM64 PC runs emulated. This builds the same app natively:

    npx tauri build --bundles nsis --config <local overlay>
                    -- --features coach-llm-vulkan,detect-tract

  What differs from the x86_64 beta, and why:
    * The C/C++ compiler is clang-cl (LLVM), not cl.exe. llama.cpp's CPU
      backend refuses MSVC on ARM ("MSVC is not supported for ARM, use
      clang"), ring and tract-linalg's arm64 assembly need clang as well.
      MSVC still provides the headers, libraries, link.exe, rc and mt
      (vcvarsarm64.bat).
    * The Vulkan SDK is LunarG's ARM64 SDK (1.4.313.0, the version CI pins).
      Only Include\, Lib\vulkan-1.lib and Bin\glslc.exe are needed; a full
      install works too (-VulkanSdk / VULKAN_SDK).
    * The updater artifact is not signed (no TAURI_SIGNING_PRIVATE_KEY
      here), so the overlay turns createUpdaterArtifacts off. The version is
      <next minor>-local.<stamp>, which sorts above every -beta.N.
    * The installer is not code-signed: SmartScreen asks once
      ("More info" -> "Run anyway").

  Prerequisites: rustup stable-aarch64-pc-windows-msvc, VS 2022 Build Tools
  (C++ workload, MSVC 14.4x, arm64 tools, its bundled CMake/Ninja), LLVM
  (clang-cl + libclang.dll, C:\Program Files\LLVM), node, git, cmake.

  The build runs at BelowNormal priority by default (child processes
  inherit it); -Priority Normal -Jobs 20 when the PC is free. For
  a hidden background run with a log you can poll:

    Start-Process powershell -WindowStyle Hidden -ArgumentList `
      '-NoProfile','-ExecutionPolicy','Bypass','-File','scripts\build-windows-arm64.ps1' `
      -RedirectStandardOutput C:\yt-arm64\build.log -RedirectStandardError C:\yt-arm64\build.err

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\build-windows-arm64.ps1 -VulkanSdk C:\VulkanSDK\1.4.313.0
#>
param(
  [string]$VulkanSdk = $env:VULKAN_SDK,
  [string]$LlvmBin = "C:\Program Files\LLVM\bin",
  [string]$TargetDir = "C:\yt-arm64",          # short: llama.cpp's CMake tree vs MAX_PATH
  [string]$OutDir = "$env:USERPROFILE\Desktop\yames-test",
  [string]$Features = "coach-llm-vulkan,detect-tract",
  [ValidateSet("Idle","BelowNormal","Normal")]
  [string]$Priority = "BelowNormal",          # Normal = full throttle (owner's call)
  [int]$Jobs = 0,                             # cargo -j; 0 = all cores
  [switch]$SkipNpmInstall
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
try { (Get-Process -Id $PID).PriorityClass = $Priority } catch {}
if ($Jobs -gt 0) { $env:CARGO_BUILD_JOBS = "$Jobs" }
$t0 = Get-Date
function Step($m) { Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $m) }

# --- MSVC arm64 environment (headers, libs, link.exe, rc, mt, Ninja) --------
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.ARM64 -property installationPath
if (-not $vs) { $vs = & $vswhere -latest -products * -property installationPath }
$vcvars = Join-Path $vs "VC\Auxiliary\Build\vcvarsarm64.bat"
if (-not (Test-Path $vcvars)) { throw "vcvarsarm64.bat not found under $vs" }
Step "MSVC env from $vcvars"
cmd /c "`"$vcvars`" >nul && set" | ForEach-Object {
  if ($_ -match '^([^=]+)=(.*)$') { Set-Item -Path "env:$($Matches[1])" -Value $Matches[2] }
}
$link = Get-Command link.exe -All | Where-Object { $_.Source -like '*\VC\Tools\MSVC\*' } |
  Select-Object -First 1 -ExpandProperty Source
if (-not $link) { throw "MSVC link.exe not on PATH after vcvars" }
$env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = $link

# --- clang-cl for every C/C++ build (llama.cpp, aubio, ring, tract) --------
if (-not (Test-Path "$LlvmBin\clang-cl.exe")) { throw "clang-cl.exe not found in $LlvmBin (install LLVM for Windows on ARM)" }
$env:PATH = "$LlvmBin;$env:PATH"
$env:CC_aarch64_pc_windows_msvc = "clang-cl"
$env:CXX_aarch64_pc_windows_msvc = "clang-cl"
# cl.exe only warns (C4530) on `throw` without /EHsc; clang-cl refuses, and
# llama-cpp-sys-2's cc-built wrappers (wrapper_common.cpp) do not pass it.
$env:CXXFLAGS_aarch64_pc_windows_msvc = "/EHsc"
$env:LIBCLANG_PATH = $LlvmBin                  # bindgen (aubio-sys, llama-cpp-sys-2)
$env:CMAKE_GENERATOR = "Ninja"                 # MSBuild's CL tracker vs MAX_PATH (AGENTS.md)
$env:CMAKE_POLICY_VERSION_MINIMUM = "3.5"      # CMake 4 vs old cmake_minimum_required in vendored C
$env:CARGO_TARGET_DIR = $TargetDir
# As CI (.github/actions/llm-build-env): llama.cpp's unused cpp-httplib must
# not find OpenSSL. An OpenSSL 4 install (C:\Program Files\OpenSSL-Win64-ARM)
# breaks it outright: X509_NAME constness.
$env:CMAKE_DISABLE_FIND_PACKAGE_OpenSSL = "TRUE"
# llama-cpp-2 turns ggml's OpenMP on. cl.exe (x86_64 CI) links MSVC's vcomp
# by itself; clang-cl emits LLVM's __kmpc_* calls, which need libomp.dll
# shipped next to the exe. Without OpenMP ggml uses its own thread pool
# (CPU inference only; the Vulkan path is unaffected).
$env:CMAKE_DISABLE_FIND_PACKAGE_OpenMP = "TRUE"

# --- Vulkan SDK (coach-llm-vulkan) ------------------------------------------
if ($Features -match "vulkan") {
  if (-not $VulkanSdk -and (Test-Path C:\VulkanSDK)) {
    $VulkanSdk = Get-ChildItem C:\VulkanSDK -Directory | Sort-Object { [version]$_.Name } -Descending |
      Select-Object -First 1 -ExpandProperty FullName
  }
  foreach ($f in "Include\vulkan\vulkan.h", "Lib\vulkan-1.lib", "Bin\glslc.exe") {
    if (-not $VulkanSdk -or -not (Test-Path (Join-Path $VulkanSdk $f))) {
      throw "Vulkan SDK incomplete ($f missing in '$VulkanSdk'). Pass -VulkanSdk, or -Features detect-tract to build without the GPU coach."
    }
  }
  $env:VULKAN_SDK = $VulkanSdk
  $env:PATH = "$VulkanSdk\Bin;$env:PATH"
}

Step "rustc: $(rustc -vV | Select-String host)  clang-cl: $((& clang-cl --version)[0])"
Step "cmake: $((cmake --version)[0])  ninja: $(ninja --version)  VULKAN_SDK=$env:VULKAN_SDK"

# --- frontend deps -----------------------------------------------------------
if (-not $SkipNpmInstall) { Step "npm install"; npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw "npm install failed" } }

# --- local config overlay: no updater signature, a -local version ------------
$stable = (Get-Content src-tauri\tauri.conf.json -Raw | ConvertFrom-Json).version
$v = $stable.Split("-")[0].Split(".")
$version = "{0}.{1}.0-local.{2}" -f $v[0], ([int]$v[1] + 1), (Get-Date -Format "yyMMddHHmm")
New-Item -ItemType Directory -Force $TargetDir | Out-Null
$overlay = Join-Path $TargetDir "local.conf.json"
@{ version = $version; bundle = @{ createUpdaterArtifacts = $false } } | ConvertTo-Json -Depth 4 |
  Set-Content -Encoding ascii $overlay
$sha = (git rev-parse --short HEAD)
Step "building $version from $sha with --features $Features"

# --- build -------------------------------------------------------------------
npx tauri build --bundles nsis --config $overlay -- --features $Features
if ($LASTEXITCODE) { throw "tauri build failed ($LASTEXITCODE)" }

$nsis = Get-ChildItem "$TargetDir\release\bundle\nsis\*-setup.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $nsis) { throw "no NSIS installer under $TargetDir\release\bundle\nsis" }
New-Item -ItemType Directory -Force $OutDir | Out-Null
$dest = Join-Path $OutDir ("Yames_{0}_arm64-setup_{1}.exe" -f $version, $sha)
Copy-Item $nsis.FullName $dest -Force
Step ("done in {0:N1} min: {1} ({2:N1} MB)" -f ((Get-Date) - $t0).TotalMinutes, $dest, ((Get-Item $dest).Length / 1MB))
