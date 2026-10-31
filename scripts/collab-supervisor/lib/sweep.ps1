function Find-DyeMarked([string]$Marker,[string]$Fixture,[double]$StartedAt) {
    try {
        if ($Marker -notmatch '^dye-fake-[a-f0-9-]{36}$') { throw 'Invalid run marker' }
        Import-Module (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\Modules\CimCmdlets\CimCmdlets.psd1') -ErrorAction Stop
        $query="Name='node.exe' AND CommandLine LIKE '%"+$Marker+"%'"
        $rows = @(Get-CimInstance Win32_Process -Filter $query -OperationTimeoutSec 3 -ErrorAction Stop | Where-Object {
            $_.CommandLine -and $_.CommandLine.Contains($Marker) -and $_.CommandLine.Contains($Fixture)
        } | ForEach-Object {
            $info = [DyeJobs.Process]::Inspect([int]$_.ProcessId)
            if (-not $info.Known) { throw 'Marked PID inspection failed' }
            if ($info.Alive) {
                $epoch = [DateTime]::FromFileTimeUtc($info.Created).Subtract([DateTime]'1970-01-01Z').TotalMilliseconds
                if ($epoch -ge $StartedAt) { @{pid=[int]$_.ProcessId; createdAt=$info.Created.ToString(); marker=$Marker; fixture=$Fixture; startedAt=$epoch} }
            }
        })
        return @{result='PASS'; processes=$rows}
    } catch { return @{result='NOT_RUN'; reason=$_.Exception.Message; processes=@()} }
}
function Invoke-DyeSweep([string]$Marker,[string]$Fixture,[double]$StartedAt,[long]$Job=0) {
    $found = Find-DyeMarked $Marker $Fixture $StartedAt
    if ($found.result -ne 'PASS') { return @{result='NOT_RUN';reason=$found.reason;escapes=@();survivors=@()} }
    $escapes=@(); $survivors=@()
    foreach ($row in $found.processes) {
        if ($Job -ne 0 -and [DyeJobs.Process]::Member([int]$row.pid,$Job)) { continue }
        $again = [DyeJobs.Process]::Inspect([int]$row.pid)
        if (-not $again.Known -or ($again.Alive -and $again.Created.ToString() -ne $row.createdAt)) { $survivors += $row; continue }
        if (-not $again.Alive) { continue }
        $escapes += @{pid=$row.pid;createdAt=$row.createdAt;detectedEscape=$true;at=[DateTime]::UtcNow.ToString('o')}
        if (-not [DyeJobs.Process]::KillVerified([int]$row.pid,[long]$row.createdAt)) { $survivors += $row }
    }
    return @{result=$(if($survivors.Count -eq 0){'PASS'}else{'FAIL'});escapes=@($escapes);survivors=@($survivors)}
}
