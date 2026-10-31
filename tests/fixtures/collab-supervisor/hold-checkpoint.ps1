param([Parameter(Mandatory=$true)][string]$Request)
$ErrorActionPreference='Stop'
$data=Get-Content -LiteralPath $Request -Raw | ConvertFrom-Json
$tempRoot=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')+'\'
foreach($path in @($Request,$data.target,$data.ready)){
    if(-not [IO.Path]::GetFullPath([string]$path).StartsWith($tempRoot,[StringComparison]::OrdinalIgnoreCase)){throw 'Disposable OS Temp files only'}
}
if($data.holdMs -lt 1 -or $data.holdMs -gt 6000){throw 'Bounded test hold required'}
if($data.startAt){
    while([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() -lt [long]$data.startAt){Start-Sleep -Milliseconds 5}
}
$stream=$null
try{
    $stream=[IO.File]::Open([string]$data.target,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite)
    [IO.File]::WriteAllText([string]$data.ready,'reader holds checkpoint without delete sharing')
    Start-Sleep -Milliseconds ([int]$data.holdMs)
}finally{if($stream){$stream.Dispose()}}
