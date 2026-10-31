param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'lib\windows-job.ps1')
$requestData = Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
$result = $null
switch ($requestData.action) {
    'operatorGate' {
        . (Join-Path $PSScriptRoot 'lib\operator-gate.ps1')
        try{Assert-DyeOperator;$result=@{allowed=$true}}
        catch{$result=@{allowed=$false;reason=$_.Exception.Message}}
    }
    'inspect' {
        $rows = @($requestData.pids | ForEach-Object {
            $info = [DyeJobs.Process]::Inspect([int]$_)
            @{pid=[int]$_; alive=$info.Alive; unknown=(-not $info.Known); createdAt=$info.Created.ToString(); reason=$info.Error.ToString()}
        })
        $result = @{ processes=$rows }
    }
    'enumerate' {
        try {
            if ($requestData.marker -notmatch '^dye-fake-[a-f0-9-]{36}$') { throw 'Invalid run marker' }
            Import-Module (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\CimCmdlets\CimCmdlets.psd1') -ErrorAction Stop
            $query="Name='node.exe' AND CommandLine LIKE '%"+$requestData.marker+"%'"
            $rows = @(Get-CimInstance Win32_Process -Filter $query -OperationTimeoutSec 3 -ErrorAction Stop | Where-Object {
                $_.CommandLine -and $_.CommandLine.Contains([string]$requestData.marker) -and $_.CommandLine.Contains([string]$requestData.fixture)
            } | ForEach-Object {
                $info = [DyeJobs.Process]::Inspect([int]$_.ProcessId)
                if (-not $info.Known) { throw 'Marked process inspection unavailable' }
                if ($info.Alive) { @{pid=[int]$_.ProcessId; createdAt=$info.Created.ToString(); marker=$requestData.marker; fixture=$requestData.fixture; startedAt=[DateTime]::FromFileTimeUtc($info.Created).Subtract([DateTime]'1970-01-01Z').TotalMilliseconds} }
            })
            $result = @{result='PASS'; processes=$rows}
        } catch { $result = @{result='NOT_RUN'; reason=$_.Exception.Message; processes=@()} }
    }
    'terminate' { $result = @{terminated=[DyeJobs.Process]::KillVerified([int]$requestData.pid,[long]$requestData.createdAt)} }
    default { throw 'Unknown inspection action' }
}
$result | ConvertTo-Json -Depth 12 -Compress
