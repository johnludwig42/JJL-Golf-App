param([string]$Library,[long]$J0,[long]$J1,[string]$Output,[switch]$Breakaway,[string]$Node,[string]$Fixture,[string]$Spec,[string]$Scratch)
$ErrorActionPreference = 'Stop'
. $Library
if ($Breakaway) {
    $child = $null
    try {
        $child = New-Object DyeJobs.Process($Node, [string[]]@($Fixture,$Spec), $Scratch, (Join-Path $Scratch 'breakaway.stdout'), (Join-Path $Scratch 'breakaway.stderr'), $true)
        $record = @{ result='FAIL'; reason='Breakaway was unexpectedly allowed' }
    } catch {
        $cause = $_.Exception
        while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
        $record = @{ result= $(if ($cause -is [ComponentModel.Win32Exception] -and $cause.NativeErrorCode -eq 5) { 'refused' } else { 'NOT_RUN' }); reason=$cause.Message }
    } finally { if ($null -ne $child) { $child.Kill(); $child.Dispose() } }
    $record | ConvertTo-Json | Set-Content -LiteralPath $Output -Encoding UTF8
    exit
}
try {
    $record = @{ j0Inherited=[DyeJobs.Process]::IsJobHandle($J0); j1Inherited=[DyeJobs.Process]::IsJobHandle($J1); pid=$PID; result='observed' }
} catch {
    # Invalid-handle inspection can itself be blocked by a verifier/sandbox.
    # That is not evidence of a non-inherited handle.
    $record = @{ result='NOT_RUN'; reason=$_.Exception.Message; pid=$PID }
}
$record | ConvertTo-Json | Set-Content -LiteralPath $Output -Encoding UTF8
