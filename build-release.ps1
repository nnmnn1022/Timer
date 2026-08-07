$ErrorActionPreference = 'Stop'

$rootPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = Join-Path $rootPath 'Timer.Desktop\Timer.Desktop.csproj'
$outputPath = Join-Path $rootPath 'Timer.Desktop\bin\Release\net8.0-windows'
$exePath = Join-Path $outputPath 'Timer.Desktop.exe'

if (-not (Test-Path -LiteralPath $projectPath)) {
    throw "프로젝트 파일을 찾을 수 없습니다: $projectPath"
}

$runningProcesses = Get-Process -Name 'Timer.Desktop' -ErrorAction SilentlyContinue | Where-Object {
    try {
        $_.Path -and ([System.IO.Path]::GetFullPath($_.Path) -ieq $exePath)
    }
    catch {
        $false
    }
}

foreach ($process in $runningProcesses) {
    Write-Host "실행 중인 Timer.Desktop 종료: PID $($process.Id)"
    Stop-Process -Id $process.Id -Force -ErrorAction Stop
}

& dotnet build $projectPath -c Release -p:UseAppHost=true
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

if (-not (Test-Path -LiteralPath $exePath)) {
    throw "실행 파일이 생성되지 않았습니다: $exePath"
}

Write-Host "빌드 완료: $exePath"
$startedProcess = Start-Process -FilePath $exePath -WorkingDirectory $outputPath -ArgumentList '--show' -WindowStyle Normal -PassThru
$deadline = [DateTime]::UtcNow.AddSeconds(5)
do {
    Start-Sleep -Milliseconds 100
    $startedProcess.Refresh()
} while ($startedProcess.MainWindowHandle -eq 0 -and [DateTime]::UtcNow -lt $deadline)

if ($startedProcess.MainWindowHandle -eq 0) {
    throw "Timer.Desktop 프로세스는 실행됐지만 화면 창을 생성하지 못했습니다. PID: $($startedProcess.Id)"
}

Write-Host "Timer.Desktop 실행 완료"
