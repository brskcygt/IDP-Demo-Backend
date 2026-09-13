[CmdletBinding()]
param(
  [string]$BasePath = 'C:\inetpub\wwwroot\idp-demo',
  [string]$ServiceName = 'IDPDemoBackend',
  [string]$SiteName = 'IDP Demo',
  [string]$AppPoolName = 'IDPDemoFrontendPool',
  [int]$BackendPort = 8085,
  [int]$FrontendPort = 8090,
  [string]$NssmPath = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

function Assert-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'PowerShell must be opened with Run as administrator.'
  }
}

function Resolve-Nssm([string]$RequestedPath) {
  if ($RequestedPath) {
    if (-not (Test-Path -LiteralPath $RequestedPath -PathType Leaf)) { throw "NSSM not found: $RequestedPath" }
    return (Resolve-Path -LiteralPath $RequestedPath).Path
  }
  $command = Get-Command nssm.exe -ErrorAction SilentlyContinue
  if ($command) { return $command.Source }
  foreach ($candidate in @('C:\tools\nssm\win64\nssm.exe', 'C:\tools\nssm.exe', 'C:\ProgramData\chocolatey\bin\nssm.exe')) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
  }
  throw 'NSSM was not found. Put nssm.exe on PATH or run again with -NssmPath C:\path\nssm.exe.'
}

function Invoke-Nssm([string[]]$Arguments) {
  & $script:Nssm @Arguments
  if ($LASTEXITCODE -ne 0) { throw "nssm $($Arguments -join ' ') failed with exit code $LASTEXITCODE." }
}

Assert-Administrator
$backendPath = Join-Path $BasePath 'backend'
$frontendPath = Join-Path $BasePath 'frontend'
$serverScript = Join-Path $backendPath 'server.js'
foreach ($required in @($serverScript, (Join-Path $frontendPath 'index.html'))) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
    throw "First deploy the demo artifacts with runtime:none, then rerun this script. Missing: $required"
  }
}

$node = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $node) { throw 'node.exe was not found on the machine PATH. Install Node.js 20 or newer first.' }
$script:Nssm = Resolve-Nssm $NssmPath

$dataPath = Join-Path $env:ProgramData 'IDP\Demo'
$logPath = Join-Path $dataPath 'logs'
New-Item -ItemType Directory -Force -Path $logPath | Out-Null

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Status -ne 'Stopped') {
    Stop-Service -Name $ServiceName -Force
    $existing.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(30))
  }
} else {
  Invoke-Nssm @('install', $ServiceName, $node.Source, $serverScript)
}
Invoke-Nssm @('set', $ServiceName, 'Application', $node.Source)
Invoke-Nssm @('set', $ServiceName, 'AppParameters', $serverScript)
Invoke-Nssm @('set', $ServiceName, 'AppDirectory', $backendPath)
Invoke-Nssm @('set', $ServiceName, 'Start', 'SERVICE_AUTO_START')
Invoke-Nssm @('set', $ServiceName, 'AppEnvironmentExtra', 'NODE_ENV=production', 'HOST=0.0.0.0', "PORT=$BackendPort")
Invoke-Nssm @('set', $ServiceName, 'AppStdout', (Join-Path $logPath 'backend-stdout.log'))
Invoke-Nssm @('set', $ServiceName, 'AppStderr', (Join-Path $logPath 'backend-stderr.log'))
Invoke-Nssm @('set', $ServiceName, 'AppRotateFiles', '1')
Invoke-Nssm @('set', $ServiceName, 'AppRotateBytes', '10485760')

Import-Module WebAdministration -ErrorAction Stop
if (-not (Test-Path "IIS:\AppPools\$AppPoolName")) { New-WebAppPool -Name $AppPoolName | Out-Null }
Set-ItemProperty "IIS:\AppPools\$AppPoolName" -Name managedRuntimeVersion -Value ''

$site = Get-Website -Name $SiteName -ErrorAction SilentlyContinue
if ($site) {
  Set-ItemProperty "IIS:\Sites\$SiteName" -Name physicalPath -Value $frontendPath
  if (-not (Get-WebBinding -Name $SiteName -Protocol http -Port $FrontendPort -ErrorAction SilentlyContinue)) {
    New-WebBinding -Name $SiteName -Protocol http -Port $FrontendPort -IPAddress '*' | Out-Null
  }
} else {
  New-Website -Name $SiteName -PhysicalPath $frontendPath -ApplicationPool $AppPoolName -Port $FrontendPort | Out-Null
}
Set-ItemProperty "IIS:\Sites\$SiteName" -Name applicationPool -Value $AppPoolName

foreach ($rule in @(
  @{ Name = 'IDP Demo Frontend'; Port = $FrontendPort },
  @{ Name = 'IDP Demo Backend'; Port = $BackendPort }
)) {
  $existingRule = Get-NetFirewallRule -DisplayName $rule.Name -ErrorAction SilentlyContinue
  if ($existingRule) {
    $existingRule | Set-NetFirewallRule -Enabled True -Action Allow -Profile Any -RemoteAddress LocalSubnet | Out-Null
  } else {
    New-NetFirewallRule -DisplayName $rule.Name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $rule.Port -Profile Any -RemoteAddress LocalSubnet | Out-Null
  }
}

Start-Service -Name $ServiceName
Start-Website -Name $SiteName

$backendHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$BackendPort/health" -TimeoutSec 10
$frontendVersion = Invoke-RestMethod -Uri "http://127.0.0.1:$FrontendPort/version.json" -TimeoutSec 10
Write-Host "Backend OK: $($backendHealth.version)"
Write-Host "Frontend OK: $($frontendVersion.version)"
Write-Host "Open from another machine: http://$env:COMPUTERNAME`:$FrontendPort"
Write-Host "IDP runtime values: backend=nssm/$ServiceName, frontend=iis-static/$AppPoolName"
Write-Host "Agent application.yml deploy.nssm-path must be: $script:Nssm"
