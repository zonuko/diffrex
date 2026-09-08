# Diffrex Windows PowerShell Installer & Uninstaller
# Usage:
#   irm https://raw.githubusercontent.com/zonuko/diffrex/main/scripts/install.ps1 | iex
#   & ./scripts/install.ps1 -Uninstall
#   & ./scripts/install.ps1 -Version "v0.1.0"

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [string]$Version = "",

    [Parameter(Mandatory = $false)]
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Programs\diffrex"),

    [Parameter(Mandatory = $false)]
    [switch]$NoPathUpdate = $false,

    [Parameter(Mandatory = $false)]
    [switch]$Uninstall = $false
)

$ErrorActionPreference = "Stop"
$Repo = "zonuko/diffrex"
$ArtifactName = "diffrex-windows-x86_64"
$ArchiveName = "$ArtifactName.zip"

function Write-Info([string]$Message) {
    Write-Host $Message -ForegroundColor Cyan
}

function Write-Success([string]$Message) {
    Write-Host $Message -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host $Message -ForegroundColor Yellow
}

function Write-Err([string]$Message) {
    Write-Host $Message -ForegroundColor Red
}

# --- Uninstall Flow ---
if ($Uninstall) {
    Write-Info "🦖 Uninstalling Diffrex..."

    # 1. Remove from user PATH
    $UserPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
    if ($UserPath) {
        $Paths = $UserPath -split ";" | Where-Object { $_ -and ($_ -ne $InstallDir) }
        $NewPath = $Paths -join ";"
        if ($NewPath -ne $UserPath) {
            [Environment]::SetEnvironmentVariable("Path", $NewPath, [EnvironmentVariableTarget]::User)
            Write-Info "  Removed '$InstallDir' from User PATH environment variable."
        }
    }

    # 2. Delete installation directory
    if (Test-Path -Path $InstallDir) {
        try {
            Remove-Item -Path $InstallDir -Recurse -Force
            Write-Info "  Removed installation folder: $InstallDir"
        }
        catch {
            Write-Warn "  Could not fully remove '$InstallDir': $($_.Exception.Message)"
        }
    }

    Write-Success "✨ Diffrex has been uninstalled."
    return
}

# --- Install Flow ---
# 1. Architecture Check
if (-not [System.Environment]::Is64BitOperatingSystem) {
    Write-Err "❌ Error: Diffrex currently only supports 64-bit Windows."
    exit 1
}

# 2. Resolve Download URLs
if ($Version) {
    $DownloadBaseUrl = "https://github.com/$Repo/releases/download/$Version"
    Write-Info "🦖 Installing Diffrex ($Version) for Windows x86_64..."
}
else {
    $DownloadBaseUrl = "https://github.com/$Repo/releases/latest/download"
    Write-Info "🦖 Installing the latest Diffrex for Windows x86_64..."
}

$DownloadUrl = "$DownloadBaseUrl/$ArchiveName"
$ChecksumUrl = "$DownloadBaseUrl/$ArchiveName.sha256"

# 3. Create Temporary Working Directory
$TempFolder = Join-Path ([System.IO.Path]::GetTempPath()) ("diffrex-install-" + [System.Guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $TempFolder -Force | Out-Null

try {
    $ZipPath = Join-Path $TempFolder $ArchiveName
    $ChecksumPath = Join-Path $TempFolder "$ArchiveName.sha256"

    # Use TLS 1.2+ for downloads
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13

    # 4. Download Release Archive
    Write-Info "⬇️  Downloading $ArchiveName from GitHub Releases..."
    try {
        Invoke-WebRequest -Uri $DownloadUrl -OutFile $ZipPath -UseBasicParsing
    }
    catch {
        Write-Err "❌ Error: Failed to download $DownloadUrl"
        Write-Err "Details: $($_.Exception.Message)"
        exit 1
    }

    # 5. Optional Checksum Verification
    try {
        Invoke-WebRequest -Uri $ChecksumUrl -OutFile $ChecksumPath -UseBasicParsing -ErrorAction SilentlyContinue
        if (Test-Path $ChecksumPath) {
            Write-Info "🔍 Verifying SHA-256 checksum..."
            $ChecksumContent = (Get-Content -Path $ChecksumPath -Raw).Trim()
            $ExpectedHash = ($ChecksumContent -split "\s+")[0].ToLower()
            $ActualHash = (Get-FileHash -Path $ZipPath -Algorithm SHA256).Hash.ToLower()

            if ($ExpectedHash -and ($ActualHash -ne $ExpectedHash)) {
                Write-Err "❌ Error: Checksum verification failed!"
                Write-Err "  Expected: $ExpectedHash"
                Write-Err "  Actual:   $ActualHash"
                exit 1
            }
            Write-Success "✅ Checksum verified."
        }
    }
    catch {
        # Checksum file not available; continue
    }

    # 6. Extract Archive
    Write-Info "📦 Extracting package..."
    $ExtractFolder = Join-Path $TempFolder "extracted"
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractFolder -Force

    # Locate package files
    $SourceFolder = Join-Path $ExtractFolder $ArtifactName
    if (-not (Test-Path $SourceFolder)) {
        $SourceFolder = $ExtractFolder
    }

    # 7. Install to Destination
    Write-Info "📂 Installing to: $InstallDir"
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    else {
        # Clean existing files
        Get-ChildItem -Path $InstallDir -Force | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    }

    Copy-Item -Path "$SourceFolder\*" -Destination $InstallDir -Recurse -Force

    # Verify executable exists
    $ExePath = Join-Path $InstallDir "diffrex.exe"
    if (-not (Test-Path $ExePath)) {
        # Check case sensitivity or subdirectories
        $FoundExe = Get-ChildItem -Path $InstallDir -Filter "diffrex.exe" -Recurse | Select-Object -First 1
        if ($FoundExe) {
            $ExePath = $FoundExe.FullName
        }
        else {
            Write-Err "❌ Error: 'diffrex.exe' was not found in the extracted package."
            exit 1
        }
    }

    # 8. Update User PATH Environment Variable
    if (-not $NoPathUpdate) {
        $UserPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
        $Paths = if ($UserPath) { $UserPath -split ";" } else { @() }
        
        $NormalizedTarget = $InstallDir.TrimEnd('\')
        $AlreadyInPath = $false
        foreach ($p in $Paths) {
            if ($p -and ($p.TrimEnd('\') -eq $NormalizedTarget)) {
                $AlreadyInPath = $true
                break
            }
        }

        if (-not $AlreadyInPath) {
            $NewUserPath = if ($UserPath) { "$UserPath;$InstallDir" } else { $InstallDir }
            [Environment]::SetEnvironmentVariable("Path", $NewUserPath, [EnvironmentVariableTarget]::User)
            $env:Path = "$env:Path;$InstallDir"
            Write-Success "✅ Added '$InstallDir' to User PATH environment variable."
        }
        else {
            Write-Info "ℹ️  '$InstallDir' is already in your User PATH."
        }
    }

    Write-Success "🎉 Diffrex has been successfully installed!"
    Write-Host ""
    Write-Host "You can now open a new terminal and run:" -ForegroundColor White
    Write-Host "  diffrex --help" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To uninstall in the future:" -ForegroundColor Gray
    Write-Host "  irm https://raw.githubusercontent.com/$Repo/main/scripts/install.ps1 | iex -args -Uninstall" -ForegroundColor Gray
}
finally {
    # Cleanup temporary folder
    if (Test-Path $TempFolder) {
        Remove-Item -Path $TempFolder -Recurse -Force -ErrorAction SilentlyContinue
    }
}
