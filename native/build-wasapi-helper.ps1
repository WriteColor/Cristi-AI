param(
    [string]$Source = (Join-Path $PSScriptRoot 'CristiWasapiLoopback.cs'),
    [string]$Output = (Join-Path $PSScriptRoot 'CristiWasapiLoopback.exe')
)

$ErrorActionPreference = 'Stop'

Write-Host "[WASAPI Helper] Iniciando compilacion de loopback de audio nativo..." -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $Source)) {
    Write-Error "[WASAPI Helper] Archivo fuente no encontrado en: $Source"
    exit 1
}

# Locate Microsoft .NET Framework C# compiler (csc.exe)
$cscCandidates = @(
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'),
    (Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe')
)

$cscPath = $null
foreach ($candidate in $cscCandidates) {
    if (Test-Path -LiteralPath $candidate) {
        $cscPath = $candidate
        break
    }
}

if (-not $cscPath) {
    $cscCmd = Get-Command 'csc.exe' -ErrorAction SilentlyContinue
    if ($cscCmd) {
        $cscPath = $cscCmd.Source
    }
}

if (-not $cscPath) {
    Write-Error "[WASAPI Helper] csc.exe no encontrado en .NET Framework ni en PATH."
    exit 1
}

Write-Host "[WASAPI Helper] Utilizando compilador: $cscPath" -ForegroundColor DarkGray

$outputDir = Split-Path -Parent $Output
if (-not (Test-Path -LiteralPath $outputDir)) {
    New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
}

$compileArgs = @(
    '/nologo',
    '/target:exe',
    '/platform:x64',
    '/optimize+',
    "/out:$Output",
    $Source
)

& $cscPath $compileArgs

if ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $Output)) {
    $exeSize = (Get-Item -LiteralPath $Output).Length
    $sizeKb = [Math]::Round($exeSize / 1024, 1)
    Write-Host "[WASAPI Helper] OK - Compilado con exito: $Output ($sizeKb KB)" -ForegroundColor Green
    exit 0
} else {
    Write-Error "[WASAPI Helper] Error al compilar $Source (Codigo de salida: $LASTEXITCODE)"
    exit 1
}
