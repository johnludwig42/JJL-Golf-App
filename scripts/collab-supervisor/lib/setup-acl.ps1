# Stage 1b implementation library. Loading it defines functions only; no ACL,
# native compilation, profile lookup or mutation occurs until explicitly called.
function Get-B0Hash([byte[]]$Bytes) {
    $h=[Security.Cryptography.SHA256]::Create()
    try { return ([BitConverter]::ToString($h.ComputeHash($Bytes))).Replace('-','').ToLowerInvariant() } finally { $h.Dispose() }
}
function ConvertTo-B0Json($Value) { return (ConvertTo-Json -InputObject $Value -Depth 30 -Compress) }
function Get-B0TextBytes([string]$Text) { return ,([Text.UTF8Encoding]::new($false,$true).GetBytes($Text)) }
function Initialize-B0Native {
    if ('DyeB0.Native' -as [type]) { return }
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Security.Cryptography;
using Microsoft.Win32.SafeHandles;
namespace DyeB0 {
 public sealed class Snapshot {
  public string Path,Kind,Id,Owner,Sddl,Hash,CreatedUtc,WrittenUtc; public long Size; public uint Links;
 }
 public static class Native {
  [StructLayout(LayoutKind.Sequential)] struct Info { public uint Attributes; public System.Runtime.InteropServices.ComTypes.FILETIME Created,Accessed,Written; public uint Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow; }
  [StructLayout(LayoutKind.Sequential)] struct SA { public int Length; public IntPtr Descriptor; public int Inherit; }
  [StructLayout(LayoutKind.Sequential)] struct Mapping { public uint Read,Write,Execute,All; }
  [StructLayout(LayoutKind.Sequential)] struct Member { public IntPtr Sid; public int Use; public IntPtr Name; }
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFile(string p,uint a,uint share,IntPtr sa,uint creation,uint flags,IntPtr t);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectory(string p,ref SA sa);
  [DllImport("kernel32.dll",EntryPoint="CreateDirectoryW",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateInheritedDirectory(string p,IntPtr sa);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle h,out Info i);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle h,int type,ref int value,uint size);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetKernelObjectSecurity(SafeFileHandle h,int info,byte[] sd,uint n,out uint needed);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool GetTokenInformation(IntPtr t,int cls,IntPtr data,int n,out int needed);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool DuplicateToken(IntPtr t,int level,out IntPtr dup);
  [DllImport("advapi32.dll",SetLastError=true)] static extern bool AccessCheck(byte[] sd,IntPtr token,uint desired,ref Mapping map,IntPtr privileges,ref uint length,out uint granted,out bool result);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr p);
  [DllImport("netapi32.dll",CharSet=CharSet.Unicode)] static extern int NetLocalGroupGetMembers(string server,string group,int level,out IntPtr buffer,int max,out int read,out int total,ref IntPtr resume);
  [DllImport("netapi32.dll")] static extern int NetApiBufferFree(IntPtr p);
  static void Check(bool b) { if(!b) throw new Win32Exception(Marshal.GetLastWin32Error()); }
  static SafeFileHandle Open(string p,bool deleting,bool content) {
   // Metadata must not hold up writers in profile/Temp directories. Content
   // hashing keeps writers/deletion out; the final delete handle is exclusive.
   uint sharing=deleting?0u:(content?1u:7u);
   var h=CreateFile(p,0x80000000u|0x20000u|(deleting?0x10000u:0),sharing,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
   if(h.IsInvalid) { int e=Marshal.GetLastWin32Error(); h.Dispose(); throw new Win32Exception(e); } return h;
  }
  static string Sha(byte[] b) { using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(b)).Replace("-","").ToLowerInvariant(); }
  static Snapshot Read(SafeFileHandle h,string p,bool content,bool directory) {
   Info i; Check(GetFileInformationByHandle(h,out i));
   if((i.Attributes&0x400)!=0) throw new IOException("REPARSE_POINT");
   if(!directory && (i.Attributes&0x10)==0 && i.Links!=1) throw new IOException("HARD_LINK");
   uint needed; GetKernelObjectSecurity(h,7,null,0,out needed);
   var bytes=new byte[needed]; Check(GetKernelObjectSecurity(h,7,bytes,needed,out needed));
   var sd=new RawSecurityDescriptor(bytes,0);
   var s=new Snapshot {Path=p,Kind=(i.Attributes&0x10)!=0?"directory":"file",Id=i.Volume.ToString("x8")+":"+i.IndexHigh.ToString("x8")+i.IndexLow.ToString("x8"),Owner=sd.Owner.Value,Sddl=sd.GetSddlForm(AccessControlSections.Owner|AccessControlSections.Group|AccessControlSections.Access),Size=((long)i.SizeHigh<<32)|i.SizeLow,Links=i.Links,CreatedUtc=DateTime.FromFileTimeUtc(((long)i.Created.dwHighDateTime<<32)|(uint)i.Created.dwLowDateTime).ToString("o"),WrittenUtc=DateTime.FromFileTimeUtc(((long)i.Written.dwHighDateTime<<32)|(uint)i.Written.dwLowDateTime).ToString("o")};
   if(content && s.Kind=="file") {
    // Do not transfer ownership of the native handle to a FileStream.
    using(var stream=new FileStream(new SafeFileHandle(h.DangerousGetHandle(),false),FileAccess.Read)) using(var hash=SHA256.Create()) s.Hash=BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
   }
   return s;
  }
  public static Snapshot Inspect(string p,bool content) { using(var h=Open(p,false,content)) return Read(h,p,content,false); }
  // Metadata only, for the finite installed Git layout prerequisite check.
  public static Snapshot InspectRuntime(string p) { using(var h=Open(p,false,false)) return Read(h,p,false,true); }
  public static void MakeDirectory(string p,string sddl) {
   var sd=new RawSecurityDescriptor(sddl); var b=new byte[sd.BinaryLength];sd.GetBinaryForm(b,0);
   var mem=Marshal.AllocHGlobal(b.Length); try {Marshal.Copy(b,0,mem,b.Length);var sa=new SA {Length=Marshal.SizeOf(typeof(SA)),Descriptor=mem};Check(CreateDirectory(p,ref sa));} finally {Marshal.FreeHGlobal(mem);}
  }
  public static void MakeInheritedDirectory(string p) { Check(CreateInheritedDirectory(p,IntPtr.Zero)); }
  public static bool Elevated() {
   int n;var b=Marshal.AllocHGlobal(4);try{Check(GetTokenInformation(WindowsIdentity.GetCurrent().Token,20,b,4,out n));return Marshal.ReadInt32(b)!=0;}finally{Marshal.FreeHGlobal(b);}
  }
  public static string[] TokenSids() {
   var rows=new List<string>();rows.Add(WindowsIdentity.GetCurrent().User.Value);
   foreach(int cls in new[]{2,11}) {
    int n;GetTokenInformation(WindowsIdentity.GetCurrent().Token,cls,IntPtr.Zero,0,out n);var b=Marshal.AllocHGlobal(n);
    try {Check(GetTokenInformation(WindowsIdentity.GetCurrent().Token,cls,b,n,out n));int count=Marshal.ReadInt32(b);int offset=IntPtr.Size==8?8:4;int stride=IntPtr.Size==8?16:8;
     for(int j=0;j<count;j++)rows.Add(new SecurityIdentifier(Marshal.ReadIntPtr(b,offset+j*stride)).Value);
    }finally{Marshal.FreeHGlobal(b);}
   }return rows.ToArray();
  }
  public static bool HasFullAccess(string sddl) {
   var d=new RawSecurityDescriptor(sddl);var bytes=new byte[d.BinaryLength];d.GetBinaryForm(bytes,0);IntPtr token;
   Check(DuplicateToken(WindowsIdentity.GetCurrent().Token,2,out token));var p=Marshal.AllocHGlobal(4096);
   try {uint len=4096,granted;bool result;var map=new Mapping {Read=0x120089,Write=0x120116,Execute=0x1200a0,All=0x1f01ff};Check(AccessCheck(bytes,token,0x1f01ff,ref map,p,ref len,out granted,out result));return result && (granted&0x1f01ff)==0x1f01ff;}finally{Marshal.FreeHGlobal(p);CloseHandle(token);}
  }
  public static string[] LocalMembers(string name) {
   IntPtr b,resume=IntPtr.Zero;int read,total;int e=NetLocalGroupGetMembers(null,name,2,out b,-1,out read,out total,ref resume);
   if(e!=0)throw new Win32Exception(e);var rows=new List<string>();try{int size=Marshal.SizeOf(typeof(Member));for(int i=0;i<read;i++){var m=(Member)Marshal.PtrToStructure(IntPtr.Add(b,i*size),typeof(Member));rows.Add(new SecurityIdentifier(m.Sid).Value+"|"+m.Use+"|"+Marshal.PtrToStringUni(m.Name));}}finally{NetApiBufferFree(b);}return rows.ToArray();
  }
  public static void DeleteVerified(string p,string id,string hash,string owner,string sddl,long size,bool dir) {
   // Exclusive sharing prevents another writer replacing a checked file. Parent
   // directories must still be revalidated by the caller; same-user limit P2.
   using(var h=Open(p,true,!dir)) {var s=Read(h,p,!dir,dir);if(s.Id!=id||s.Owner!=owner||(dir&&s.Sddl!=sddl)||(!dir&&(s.Hash!=hash||s.Size!=size)))throw new IOException("UNCERTAIN");int yes=1;Check(SetFileInformationByHandle(h,4,ref yes,4));}
  }
 }
}
'@
}
function Assert-B0Path([string]$Path,[switch]$MissingLeaf) {
    if ($Path -notmatch '^[A-Za-z]:\\' -or $Path -match '[\x00-\x1f<>"|?*]' -or $Path.Substring(2) -match ':') { throw 'PATH: canonical drive-absolute path required' }
    $parts=$Path.Substring(3).Split('\'); $current=$Path.Substring(0,3)
    for($i=0;$i -lt $parts.Length;$i++) {
        $part=$parts[$i]
        if(!$part -or $part -in @('.','..') -or $part -match '[. ]$|~[0-9]') { throw 'PATH: ambiguous spelling' }
        $current=[IO.Path]::Combine($current,$part)
        try { $attr=[IO.File]::GetAttributes($current) } catch [IO.FileNotFoundException] { if($MissingLeaf -and $i -eq $parts.Length-1){return};throw } catch [IO.DirectoryNotFoundException] { if($MissingLeaf -and $i -eq $parts.Length-1){return};throw }
        if(($attr -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'PATH: reparse point'}
    }
}
function Test-B0Exists([string]$Path) {
    try { [void][IO.File]::GetAttributes($Path); return $true } catch [IO.FileNotFoundException] {return $false} catch [IO.DirectoryNotFoundException] {return $false}
}
function Get-B0Snapshot([string]$Path,[bool]$Content=$false) { Assert-B0Path $Path; Initialize-B0Native; return [DyeB0.Native]::Inspect($Path,$Content) }
function Get-B0Descriptor([string]$Owner,[string]$Deny) {
    [void][Security.Principal.SecurityIdentifier]::new($Owner);[void][Security.Principal.SecurityIdentifier]::new($Deny)
    return "O:${Owner}G:${Owner}D:P(D;OICI;FA;;;$Deny)(A;OICI;FA;;;$Owner)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)"
}
function Assert-B0Token([string]$Deny,[string[]]$Sids) { if($Sids -contains $Deny){throw 'OPERATOR_BLOCKED: deny SID in token'} }
function Get-B0Membership([string]$Group,[string]$Owner) {
    Initialize-B0Native
    $seen=@{};$queue=[Collections.Generic.Queue[string]]::new();$queue.Enqueue($Group);$result=@()
    while($queue.Count) {
        $name=$queue.Dequeue();if($seen.ContainsKey($name)){continue};$seen[$name]=$true
        foreach($row in [DyeB0.Native]::LocalMembers($name)) {
            $result+= $row; $fields=$row.Split('|');$sid=$fields[0];$use=[int]$fields[1];$label=$fields[2]
            if($sid -in @($Owner,'S-1-5-18','S-1-5-32-544')){throw 'OPERATOR_BLOCKED: protected identity is a deny-group member'}
            if($use -in @(2,4,5)) {
                $bits=$label.Split('\')
                if($bits.Length -ne 2 -or $bits[0] -notin @($env:COMPUTERNAME,'BUILTIN')) { throw 'MEMBERSHIP_UNKNOWN: external group expansion not permitted' }
                $queue.Enqueue($bits[1])
            }
        }
    }
    return ,@($result | Sort-Object)
}
function Write-B0Exclusive([string]$Path,[byte[]]$Bytes) {
    Assert-B0Path $Path -MissingLeaf
    $f=[IO.FileStream]::new($Path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try {$f.Write($Bytes,0,$Bytes.Length);$f.Flush($true)} finally {$f.Dispose()}
}
function Read-B0Json([string]$Path) {
    Assert-B0Path $Path;[void](Get-B0Snapshot $Path)
    $text=[Text.UTF8Encoding]::new($false,$true).GetString([IO.File]::ReadAllBytes($Path))
    return ConvertFrom-Json -InputObject $text
}
function Read-B0Journal([string]$Path) {
    Assert-B0Path $Path;[void](Get-B0Snapshot $Path)
    $bytes=[IO.File]::ReadAllBytes($Path);$text=[Text.UTF8Encoding]::new($false,$true).GetString($bytes)
    $parts=$text.Split([char]10);$rows=@();$prev='';$torn=$false
    for($i=0;$i -lt $parts.Length;$i++) {
        if($i -eq $parts.Length-1){if($parts[$i]){$torn=$true};break}
        try {$row=ConvertFrom-Json -InputObject $parts[$i]} catch {
            if($i -eq $parts.Length-2 -and !$parts[$parts.Length-1]){$torn=$true;break}
            throw 'JOURNAL_DAMAGED: invalid complete line'
        }
        if($row.prev -cne $prev){throw 'JOURNAL_DAMAGED: broken chain'}
        $rows+= $row;$prev=Get-B0Hash (Get-B0TextBytes ($parts[$i]+"`n"))
    }
    return @{rows=@($rows);prev=$prev;torn=$torn}
}
function Add-B0Journal([string]$Path,$Entry) {
    $j=Read-B0Journal $Path
    if($j.torn){throw 'JOURNAL_DAMAGED: retain torn journal; do not append'}
    $Entry.prev=$j.prev;$line=(ConvertTo-B0Json $Entry)+"`n";$bytes=Get-B0TextBytes $line
    $f=[IO.FileStream]::new($Path,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read)
    try{$f.Write($bytes,0,$bytes.Length);$f.Flush($true)}finally{$f.Dispose()}
}
function Get-B0Classification($Done,$Observed) {
    if($null -eq $Observed){return 'ABSENT'}
    if($null -eq $Done){return 'UNCERTAIN'}
    foreach($key in @('Id','Kind','Owner')) {if($Done.$key -cne $Observed.$key){return 'UNCERTAIN'}}
    if($Observed.Kind -eq 'directory' -and $Done.Sddl -cne $Observed.Sddl){return 'UNCERTAIN'}
    if($Observed.Kind -eq 'file' -and ($Done.Hash -cne $Observed.Hash -or $Done.Size -ne $Observed.Size)){return 'UNCERTAIN'}
    return 'CERTAIN'
}
function Invoke-B0Mutation([string]$Journal,[string]$Step,[string]$Path,[string]$Kind,[byte[]]$Bytes,[string]$Sddl,[scriptblock]$Fault) {
    Assert-B0Path $Path -MissingLeaf
    if(Test-B0Exists $Path){throw 'EXISTS: create refused'}
    $expected=if($Kind -eq 'file'){Get-B0Hash $Bytes}else{$Sddl}
    Add-B0Journal $Journal @{event='intent';step=$Step;path=$Path;kind=$Kind;expected=$expected;pre='absent'}
    if($Kind -eq 'directory'){Initialize-B0Native;[DyeB0.Native]::MakeDirectory($Path,$Sddl)}else{Write-B0Exclusive $Path $Bytes}
    if($Fault){& $Fault $Step 'after-mutation' $Path}
    $snapshot=Get-B0Snapshot $Path ($Kind -eq 'file')
    if($Kind -eq 'directory') {
        $expectedSd=[Security.AccessControl.RawSecurityDescriptor]::new($Sddl)
        $expectedSddl=$expectedSd.GetSddlForm([Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group -bor [Security.AccessControl.AccessControlSections]::Access)
        if($snapshot.Sddl -cne $expectedSddl -or $snapshot.Owner -cne $expectedSd.Owner.Value){throw 'CREATE_VERIFY: descriptor differs; retain uncertain folder'}
    } elseif($snapshot.Hash -cne $expected -or $snapshot.Size -ne $Bytes.Length){throw 'CREATE_VERIFY: file differs; retain uncertain file'}
    Add-B0Journal $Journal @{event='done';step=$Step;path=$Path;observed=$snapshot}
    if($Fault){& $Fault $Step 'after-done' $Path}
    return $snapshot
}
function Get-B0Observed([string]$Path) {
    if(!(Test-B0Exists $Path)){return $null}
    $meta=Get-B0Snapshot $Path
    # An unexpected profile file must not become a credential-read primitive.
    # Only the 52-byte candidate is read; unexpected larger files are metadata-only.
    if($meta.Kind -eq 'file' -and $meta.Size -le 52){return Get-B0Snapshot $Path $true}
    return $meta
}
function Get-B0ApplyObjects($Journal) {
    $out=@();foreach($r in $Journal.rows){if($r.event -eq 'intent'){$out+=@{path=$r.path;step=$r.step;done=$null}}elseif($r.event -eq 'done'){
        $match=@($out | Where-Object {$_.path -ceq $r.path -and $_.step -ceq $r.step})
        if($match.Count -ne 1 -or $null -ne $match[0].done){throw 'JOURNAL_DAMAGED: unmatched completion'};$match[0].done=$r.observed
    }};return ,$out
}
function Get-B0ManifestDigest($Manifest) { return Get-B0Hash (Get-B0TextBytes (ConvertTo-B0Json $Manifest)) }
function Get-B0BundleDigest([string]$Entry,[string]$Library) { return Get-B0Hash (Get-B0TextBytes ("platform-setup.ps1 $Entry`nlib/setup-acl.ps1 $Library`n")) }
function Test-B0Within([string]$Root,[string]$Path) { return $Path.Equals($Root,[StringComparison]::OrdinalIgnoreCase) -or $Path.StartsWith($Root.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase) }
function Get-B0Parents($Manifest) {
    $list=@($Manifest.evidenceRoot,$Manifest.repo,$Manifest.profileClaude,$Manifest.profileCodex,$Manifest.temp)
    if($Manifest.profileSupabase){$list+= $Manifest.profileSupabase}
    $rows=@();foreach($p in $list){$s=Get-B0Snapshot $p;$rows+= [ordered]@{path=$p;id=$s.Id;owner=$s.Owner;sddl=$s.Sddl}}
    return ,$rows
}
function Get-B0ParentDrift($Manifest) {
    $rows=@()
    foreach($p in $Manifest.parents) {
        try {
            $s=Get-B0Snapshot $p.path;$changes=@()
            if($s.Id -cne $p.id){$changes+='identity'}
            if($s.Owner -cne $p.owner){$changes+='owner'}
            if($s.Sddl -cne $p.sddl){$changes+='permissions'}
            if($changes.Count){$rows+= [ordered]@{path=$p.path;changes=$changes;expectedId=$p.id;observedId=$s.Id;expectedOwner=$p.owner;observedOwner=$s.Owner;expectedSddl=$p.sddl;observedSddl=$s.Sddl}}
        } catch {$rows+= [ordered]@{path=$p.path;changes=@('unreadable')}}
    }
    return ,$rows
}
function Assert-B0Parents($Manifest,[switch]$AllowPermissionDrift) {
    foreach($drift in (Get-B0ParentDrift $Manifest)) {
        if(!$AllowPermissionDrift -or @($drift.changes | Where-Object {$_ -ne 'permissions'}).Count){throw 'PARENT_DRIFT: identity/owner drift blocks use; permission drift blocks acceptance only'}
    }
}
function Get-B0Targets($Manifest) {
    $rows=@([ordered]@{name='S1';path=[IO.Path]::Combine($Manifest.repo,'.env.wp-auto-sentinel')},
        [ordered]@{name='S2';path=[IO.Path]::Combine($Manifest.profileClaude,'wp-auto-02-sentinel.txt')},
        [ordered]@{name='S3';path=[IO.Path]::Combine($Manifest.profileCodex,'wp-auto-02-sentinel.txt')})
    if($Manifest.profileSupabase){$rows+= [ordered]@{name='S4';path=[IO.Path]::Combine($Manifest.profileSupabase,'wp-auto-02-sentinel.txt')}}
    $rows+= [ordered]@{name='S5';path=[IO.Path]::Combine($Manifest.temp,'wp-auto-02-sentinel.txt')}
    $rows+= [ordered]@{name='S6';path=[IO.Path]::Combine($Manifest.control,'wp-auto-02-sentinel.txt')}
    return ,$rows
}
function Assert-B0TargetSet($Manifest) {
    if((ConvertTo-B0Json (Get-B0Targets $Manifest)) -cne (ConvertTo-B0Json $Manifest.targets)){throw 'MANIFEST: unexpected target set'}
    if($Manifest.control -cne [IO.Path]::Combine($Manifest.evidenceRoot,'_supervisor')){throw 'MANIFEST: unexpected control path'}
}
function Get-B0ExpectedPaths($Manifest,[string]$ApplyId) {
    $setup=[IO.Path]::Combine($Manifest.control,'setup');$run=[IO.Path]::Combine($setup,'b0-'+$ApplyId)
    return ,(@([IO.Path]::Combine($Manifest.evidenceRoot,'WP-AUTO-02','stage1b-apply-'+$ApplyId+'-before-acl.json'),$Manifest.control,[IO.Path]::Combine($Manifest.control,'approvals'),[IO.Path]::Combine($Manifest.control,'tools'),$setup,$run,
        [IO.Path]::Combine($run,'manifest.json'),[IO.Path]::Combine($run,'before-acl.json'),[IO.Path]::Combine($run,'sentinel-values.json'),[IO.Path]::Combine($run,'access-probe.tmp'))+@($Manifest.targets | ForEach-Object {$_.path}))
}
function Assert-B0JournalScope($Manifest,[string]$ApplyId,$Journal) {
    $expected=Get-B0ExpectedPaths $Manifest $ApplyId
    foreach($r in $Journal.rows){if($r.event -in @('intent','done','delete-intent','delete-done') -and $expected -cnotcontains $r.path){throw 'JOURNAL_DAMAGED: path outside fixed setup set'}}
}
function Get-B0KnownObserved($Object) {
    if(!(Test-B0Exists $Object.path)){return $null}
    Assert-B0Path $Object.path
    if($Object.done -and $Object.done.Kind -eq 'file') {
        $meta=Get-B0Snapshot $Object.path
        if($meta.Id -cne $Object.done.Id -or $meta.Owner -cne $Object.done.Owner -or $meta.Size -ne $Object.done.Size){return $meta}
        return Get-B0Snapshot $Object.path $true
    }
    return Get-B0Observed $Object.path
}
function Get-B0VerificationCore($Manifest,[string]$ApplyId,[string]$Journal) {
    Assert-B0Parents $Manifest;Assert-B0TargetSet $Manifest
    $j=Read-B0Journal $Journal;Assert-B0JournalScope $Manifest $ApplyId $j
    if($j.torn){throw 'JOURNAL_DAMAGED: torn completion'}
    $objects=Get-B0ApplyObjects $j;$rows=@()
    foreach($o in $objects) {
        if($o.step -eq 'access-probe') {if(Test-B0Exists $o.path){throw 'VERIFY: access probe remains'};continue}
        $observed=Get-B0KnownObserved $o;$state=Get-B0Classification $o.done $observed
        if($state -ne 'CERTAIN'){throw "VERIFY: $state at $($o.step)"}
        if($o.done.Sddl -cne $observed.Sddl){throw "VERIFY: permission drift at $($o.step)"}
        $rows+= [ordered]@{step=$o.step;path=$o.path;observed=$observed}
    }
    foreach($target in $Manifest.targets){if(@($rows | Where-Object {$_.path -ceq $target.path}).Count -ne 1){throw 'VERIFY: missing sentinel'}}
    # Only our newly created control tree is enumerated; never profile folders.
    foreach($o in @($objects | Where-Object {$_.done -and $_.done.Kind -eq 'directory'})) {
        foreach($child in [IO.Directory]::EnumerateFileSystemEntries($o.path)) {if(@($objects | Where-Object {$_.path -ceq $child -and $_.step -ne 'access-probe'}).Count -ne 1){throw 'VERIFY: unexpected control content'}}
    }
    return [ordered]@{schema=1;result='PASS';applyId=$ApplyId;objects=$rows;realResults='UNVERIFIED';effectiveAccess='UNVERIFIED'}
}
function Invoke-B0ApplyCore($Manifest,[string]$ApplyId,[string]$Journal,[scriptblock]$Fault) {
    Initialize-B0Native;Assert-B0TargetSet $Manifest;Assert-B0Parents $Manifest
    if(Test-B0Exists $Manifest.control){throw 'EXISTS: control area'}
    foreach($t in $Manifest.targets){if($t.name -ne 'S6'){Assert-B0Path $t.path -MissingLeaf};if(Test-B0Exists $t.path){throw 'EXISTS: sentinel'}}
    Assert-B0Token $Manifest.deny ([DyeB0.Native]::TokenSids())
    if(![DyeB0.Native]::HasFullAccess($Manifest.sddl)){throw 'OPERATOR_BLOCKED: proposed descriptor'}
    Write-B0Exclusive $Journal @()
    Add-B0Journal $Journal @{event='start';applyId=$ApplyId;manifestHash=(Get-B0ManifestDigest $Manifest);manifest=$Manifest}
    $beforeCopy=[IO.Path]::Combine($Manifest.evidenceRoot,'WP-AUTO-02','stage1b-apply-'+$ApplyId+'-before-acl.json')
    [void](Invoke-B0Mutation $Journal 'before-acl-evidence' $beforeCopy 'file' (Get-B0TextBytes (ConvertTo-B0Json $Manifest.parents)) '' $Fault)
    $control=$Manifest.control;$setup=[IO.Path]::Combine($control,'setup');$run=[IO.Path]::Combine($setup,'b0-'+$ApplyId)
    $dirs=@(@('control',$control),@('approvals',[IO.Path]::Combine($control,'approvals')),@('tools',[IO.Path]::Combine($control,'tools')),@('setup',$setup),@('run',$run))
    foreach($d in $dirs){[void](Invoke-B0Mutation $Journal $d[0] $d[1] 'directory' @() $Manifest.sddl $Fault)}
    [void](Invoke-B0Mutation $Journal 'manifest' ([IO.Path]::Combine($run,'manifest.json')) 'file' (Get-B0TextBytes (ConvertTo-B0Json $Manifest)) '' $Fault)
    [void](Invoke-B0Mutation $Journal 'before-acl' ([IO.Path]::Combine($run,'before-acl.json')) 'file' (Get-B0TextBytes (ConvertTo-B0Json $Manifest.parents)) '' $Fault)
    $values=[ordered]@{};$rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try {foreach($t in $Manifest.targets){$b=New-Object byte[] 16;$rng.GetBytes($b);$values[$t.name]='WP-AUTO-02-SENTINEL-'+([BitConverter]::ToString($b)).Replace('-','').ToLowerInvariant()}}finally{$rng.Dispose()}
    [void](Invoke-B0Mutation $Journal 'values' ([IO.Path]::Combine($run,'sentinel-values.json')) 'file' (Get-B0TextBytes (ConvertTo-B0Json $values)) '' $Fault)
    $probe=[IO.Path]::Combine($run,'access-probe.tmp')
    $probeInfo=Invoke-B0Mutation $Journal 'access-probe' $probe 'file' (Get-B0TextBytes 'b0-access-probe') '' $Fault
    Add-B0Journal $Journal @{event='delete-intent';step='access-probe';path=$probe}
    [DyeB0.Native]::DeleteVerified($probe,$probeInfo.Id,$probeInfo.Hash,$probeInfo.Owner,$probeInfo.Sddl,$probeInfo.Size,$false)
    if($Fault){& $Fault 'access-probe-delete' 'after-mutation' $probe}
    Add-B0Journal $Journal @{event='delete-done';step='access-probe';path=$probe}
    foreach($t in $Manifest.targets){[void](Invoke-B0Mutation $Journal $t.name $t.path 'file' (Get-B0TextBytes $values[$t.name]) '' $Fault)}
    $result=Get-B0VerificationCore $Manifest $ApplyId $Journal
    Add-B0Journal $Journal @{event='verified';applyId=$ApplyId;result='PASS'}
    return $result
}
function Invoke-B0RestoreCore($Manifest,[string]$ApplyId,[string]$Journal,[string]$RestoreJournal,[scriptblock]$Fault) {
    Initialize-B0Native;Assert-B0Parents $Manifest -AllowPermissionDrift;Assert-B0TargetSet $Manifest
    $j=Read-B0Journal $Journal;Assert-B0JournalScope $Manifest $ApplyId $j
    if(@($j.rows | Where-Object {$_.event -eq 'start'}).Count -ne 1){throw 'JOURNAL_DAMAGED: start record required'}
    $objects=Get-B0ApplyObjects $j
    if(!(Test-B0Exists $RestoreJournal)){Write-B0Exclusive $RestoreJournal @();Add-B0Journal $RestoreJournal @{event='restore-start';applyId=$ApplyId}}
    $rj=Read-B0Journal $RestoreJournal
    if($rj.torn){throw 'JOURNAL_DAMAGED: retain torn restore journal'}
    Assert-B0JournalScope $Manifest $ApplyId $rj
    $filePermissionDrift=@()
    foreach($o in $objects){$observed=Get-B0KnownObserved $o;if((Get-B0Classification $o.done $observed) -eq 'UNCERTAIN'){throw "UNCERTAIN: retained $($o.step)"};if($observed -and $observed.Kind -eq 'file' -and $o.done.Sddl -cne $observed.Sddl){$filePermissionDrift+= [ordered]@{path=$o.path;expectedSddl=$o.done.Sddl;observedSddl=$observed.Sddl}}}
    foreach($o in @($objects | Where-Object {$_.done -and $_.done.Kind -eq 'directory'})) {
        if(Test-B0Exists $o.path){foreach($child in [IO.Directory]::EnumerateFileSystemEntries($o.path)){if(@($objects | Where-Object {$_.path -ceq $child}).Count -ne 1){throw 'UNCERTAIN: extra control content'}}}
    }
    $recordDir=[IO.Path]::Combine([IO.Path]::GetDirectoryName($Journal),'stage1b-restore-'+$ApplyId)
    $archiveDone=@($rj.rows | Where-Object {$_.event -eq 'archive-done'})
    if(Test-B0Exists $recordDir) {
        if($archiveDone.Count -ne 1 -or $archiveDone[0].path -cne $recordDir -or (Get-B0Classification $archiveDone[0].observed (Get-B0Snapshot $recordDir)) -ne 'CERTAIN'){throw 'UNCERTAIN: archive directory'}
    } else {
        if($archiveDone.Count){throw 'UNCERTAIN: archive directory removed'}
        Assert-B0Path $recordDir -MissingLeaf
        Add-B0Journal $RestoreJournal @{event='archive-intent';path=$recordDir}
        [DyeB0.Native]::MakeInheritedDirectory($recordDir)
        if($Fault){& $Fault 'archive' 'after-mutation' $recordDir}
        Add-B0Journal $RestoreJournal @{event='archive-done';path=$recordDir;observed=(Get-B0Snapshot $recordDir)}
    }
    Assert-B0Path $recordDir
    foreach($o in @($objects | Where-Object {$_.step -in @('manifest','before-acl')})) {
        $destination=[IO.Path]::Combine($recordDir,[IO.Path]::GetFileName($o.path))
        if(Test-B0Exists $destination){$saved=Get-B0Snapshot $destination $true;if($saved.Hash -cne $o.done.Hash){throw 'UNCERTAIN: changed evidence copy'}}
        elseif(Test-B0Exists $o.path){Add-B0Journal $RestoreJournal @{event='copy-intent';source=$o.path;destination=$destination};Write-B0Exclusive $destination ([IO.File]::ReadAllBytes($o.path));$saved=Get-B0Snapshot $destination $true;if($saved.Hash -cne $o.done.Hash){throw 'UNCERTAIN: evidence copy hash'};Add-B0Journal $RestoreJournal @{event='copy-done';source=$o.path;destination=$destination;hash=$saved.Hash}}
    }
    $ordered=@($objects | Where-Object {$_.done -and $_.done.Kind -eq 'file' -and $_.step -notin @('values','before-acl-evidence')} | Sort-Object @{Expression={if($_.step -match '^S[1-5]$'){0}else{1}}})
    $ordered+=@($objects | Where-Object {$_.step -eq 'values' -and $_.done})
    $ordered+=@($objects | Where-Object {$_.done -and $_.done.Kind -eq 'directory'} | Sort-Object @{Expression={$_.path.Length};Descending=$true})
    foreach($o in $ordered) {
        if(!(Test-B0Exists $o.path)){Add-B0Journal $RestoreJournal @{event='delete-done';path=$o.path;result='absent'};continue}
        Assert-B0Path $o.path
        Add-B0Journal $RestoreJournal @{event='delete-intent';path=$o.path;id=$o.done.Id}
        if($Fault){& $Fault $o.step 'before-delete' $o.path}
        [DyeB0.Native]::DeleteVerified($o.path,$o.done.Id,$o.done.Hash,$o.done.Owner,$o.done.Sddl,$o.done.Size,($o.done.Kind -eq 'directory'))
        if($Fault){& $Fault $o.step 'after-delete' $o.path}
        Add-B0Journal $RestoreJournal @{event='delete-done';path=$o.path;result='deleted'}
    }
    Assert-B0Parents $Manifest -AllowPermissionDrift
    Add-B0Journal $RestoreJournal @{event='restored';applyId=$ApplyId}
    return [ordered]@{schema=1;result='RESTORED';applyId=$ApplyId;uncertainDeleted=$false;parentDrift=(Get-B0ParentDrift $Manifest);filePermissionDrift=$filePermissionDrift;cleanupPolicy='retain-all-when-uncertain'}
}
function Write-B0FailureRecord($Manifest,[string]$ApplyId,[string]$Journal,[ValidateSet('Apply','Verify','Restore')][string]$Action,$ActionError) {
    # No journal discovery or metadata reads before the entry has trusted its
    # source/manifest. Library tests supply the same context in private Temp.
    if($ApplyId -cnotmatch '^[a-f0-9]{32}$' -or !(Test-B0Exists $Journal)){return $null}
    Assert-B0TargetSet $Manifest
    $expected=Get-B0ExpectedPaths $Manifest $ApplyId
    $objects=@();$journalStatus='UNREADABLE';$outOfScope=$false
    try {
        $j=Read-B0Journal $Journal
        Assert-B0JournalScope $Manifest $ApplyId $j
        $objects=Get-B0ApplyObjects $j
        $journalStatus=if($j.torn){'TORN_TAIL'}else{'READABLE'}
    } catch {
        # Do not adopt completion identities from a damaged chain or inspect an
        # injected path. Inventory only the manifest's closed, fixed target set.
        $objects=@();$journalStatus='DAMAGED_OR_UNREADABLE';$outOfScope=$true
    }
    $rows=@()
    foreach($path in $expected) {
        $matches=@($objects | Where-Object {$_.path -ceq $path})
        $o=if($matches.Count -eq 1){$matches[0]}else{@{path=$path;step=$null;done=$null}}
        $observed=$null;$classification='UNCERTAIN';$inspection='READABLE'
        try {$observed=Get-B0KnownObserved $o;$classification=Get-B0Classification $o.done $observed}
        catch {$inspection='REFUSED_OR_UNREADABLE'}
        $row=[ordered]@{path=$path;step=$o.step;journalled=($matches.Count -eq 1);classification=$classification;inspection=$inspection;kind=$null;size=$null;owner=$null;id=$null;createdUtc=$null;writtenUtc=$null;permissionDrift=$false}
        if($observed) {
            $row.kind=$observed.Kind;$row.size=$observed.Size;$row.owner=$observed.Owner;$row.id=$observed.Id
            $row.createdUtc=$observed.CreatedUtc;$row.writtenUtc=$observed.WrittenUtc
            $row.permissionDrift=($null -ne $o.done -and $o.done.Sddl -cne $observed.Sddl)
            # Never serialize a snapshot directly: known large setup JSON may
            # have been hashed for classification, but its hash isn't evidence.
            if($observed.Kind -eq 'file' -and $observed.Size -le 52 -and $observed.Hash){$row.hash=$observed.Hash}
        }
        $rows+= $row
    }
    $category='SETUP_FAILED'
    if($ActionError -and $ActionError.Exception.Message -cmatch '^([A-Z][A-Z0-9_]+)(?=:|$)'){$category=$Matches[1]}
    $record=[ordered]@{schema=1;action=$Action;applyId=$ApplyId;result='FAILED';category=$category;journalStatus=$journalStatus;untrustedJournalPathsNotInspected=$outOfScope;objects=$rows;parentDrift=(Get-B0ParentDrift $Manifest);cleanupPolicy='retain-all-when-uncertain';realResults='UNVERIFIED'}
    $folder=[IO.Path]::Combine($Manifest.evidenceRoot,'WP-AUTO-02')
    $path=[IO.Path]::Combine($folder,'stage1b-'+$Action.ToLowerInvariant()+'-'+$ApplyId+'-failed-'+[guid]::NewGuid().ToString('N')+'.json')
    Write-B0Exclusive $path (Get-B0TextBytes (ConvertTo-B0Json $record))
    return $path
}
function Invoke-B0GuardedAction($Manifest,[string]$ApplyId,[string]$Journal,[ValidateSet('Apply','Verify','Restore')][string]$Action,[scriptblock]$Operation) {
    try { & $Operation } catch {
        $actionError=$_
        try {
            $failurePath=Write-B0FailureRecord $Manifest $ApplyId $Journal $Action $actionError
            if($failurePath){$actionError.Exception.Data['B0FailureEvidence']=$failurePath;Write-Warning ('Failure evidence: '+$failurePath)}
        } catch {
            # Preserve the action failure and make evidence-storage failure
            # visible too. Never turn either failure into a success/fallback.
            Write-Error -Message 'FAILURE_EVIDENCE_WRITE_FAILED: original action also failed; retain its journal' -ErrorAction Continue
        }
        throw $actionError
    }
}
function Invoke-B0Apply($Manifest,[string]$ApplyId,[string]$Journal,[scriptblock]$Fault) {
    Invoke-B0GuardedAction $Manifest $ApplyId $Journal 'Apply' {Invoke-B0ApplyCore $Manifest $ApplyId $Journal $Fault}
}
function Get-B0Verification($Manifest,[string]$ApplyId,[string]$Journal) {
    Invoke-B0GuardedAction $Manifest $ApplyId $Journal 'Verify' {Get-B0VerificationCore $Manifest $ApplyId $Journal}
}
function Invoke-B0Restore($Manifest,[string]$ApplyId,[string]$Journal,[string]$RestoreJournal,[scriptblock]$Fault) {
    Invoke-B0GuardedAction $Manifest $ApplyId $Journal 'Restore' {Invoke-B0RestoreCore $Manifest $ApplyId $Journal $RestoreJournal $Fault}
}
