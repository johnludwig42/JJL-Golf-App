if ('DyeStage2.AreaHandle' -as [type]) { throw 'AREA_NATIVE_PRELOADED' }
Add-Type -TypeDefinition @'
using System;
using System.Globalization;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using Microsoft.Win32.SafeHandles;

namespace DyeStage2 {
 public sealed class AreaHandle : IDisposable {
  [StructLayout(LayoutKind.Sequential)]
  struct Info {
   public uint Attributes;
   public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
   public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
  }
  [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern SafeFileHandle CreateFile(string path,uint access,uint sharing,IntPtr security,uint disposition,uint flags,IntPtr template);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandle(SafeFileHandle handle,out Info info);
  [DllImport("kernel32.dll", SetLastError=true)]
  static extern bool GetFileInformationByHandleEx(SafeFileHandle handle,int kind,IntPtr value,uint bytes);
  [DllImport("advapi32.dll")]
  static extern uint GetSecurityInfo(SafeFileHandle handle,uint type,uint fields,IntPtr owner,IntPtr group,IntPtr dacl,IntPtr sacl,out IntPtr descriptor);
  [DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
  static extern bool ConvertSecurityDescriptorToStringSecurityDescriptor(IntPtr descriptor,uint revision,uint fields,out IntPtr text,IntPtr length);
  [DllImport("kernel32.dll")]
  static extern IntPtr LocalFree(IntPtr pointer);
  [StructLayout(LayoutKind.Sequential)]
  struct AccessMapping { public uint Read,Write,Execute,All; }
  [DllImport("advapi32.dll",SetLastError=true)]
  static extern bool DuplicateToken(IntPtr token,int level,out IntPtr duplicate);
  [DllImport("advapi32.dll",SetLastError=true)]
  static extern bool AccessCheck(byte[] descriptor,IntPtr token,uint desired,ref AccessMapping mapping,IntPtr privileges,ref uint length,out uint granted,out bool result);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);
  [DllImport("advapi32.dll",SetLastError=true)]
  static extern bool CheckTokenMembership(IntPtr token,byte[] sid,out bool member);
  public static bool IsTokenMember(string sidText) {
   var sid=new SecurityIdentifier(sidText);
   var bytes=new byte[sid.BinaryLength];sid.GetBinaryForm(bytes,0);
   bool member;
   if(!CheckTokenMembership(IntPtr.Zero,bytes,out member))throw new InvalidOperationException("AREA_TOKEN");
   return member;
  }
  public static bool HasFullAccess(string sddl) {
   var descriptor=new RawSecurityDescriptor(sddl);
   var bytes=new byte[descriptor.BinaryLength];descriptor.GetBinaryForm(bytes,0);
   IntPtr token;
   using(var identity=WindowsIdentity.GetCurrent()) {
    if(!DuplicateToken(identity.Token,2,out token)) throw new InvalidOperationException("AREA_ACCESS_CHECK");
   }
   IntPtr privileges=Marshal.AllocHGlobal(4096);
   try {
    uint length=4096,granted;bool allowed;
    var mapping=new AccessMapping {Read=0x120089,Write=0x120116,Execute=0x1200a0,All=0x1f01ff};
    if(!AccessCheck(bytes,token,0x1f01ff,ref mapping,privileges,ref length,out granted,out allowed))
     throw new InvalidOperationException("AREA_ACCESS_CHECK");
    return allowed && (granted&0x1f01ff)==0x1f01ff;
   } finally {Marshal.FreeHGlobal(privileges);CloseHandle(token);}
  }
  [StructLayout(LayoutKind.Sequential)]
  struct SecurityAttributes {
   public int Length;
   public IntPtr Descriptor;
   public int Inherit;
  }
  [DllImport("advapi32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool ConvertStringSecurityDescriptorToSecurityDescriptor(string text,uint revision,out IntPtr descriptor,IntPtr size);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool CreateDirectory(string path,ref SecurityAttributes security);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true,EntryPoint="CreateDirectoryW")]
  static extern bool CreateInheritedDirectory(string path,IntPtr security);

  public static void ProvisionDirectory(string path,string sddl) {
   if(String.IsNullOrEmpty(sddl)) {
    if(!CreateInheritedDirectory(path,IntPtr.Zero)) throw new InvalidOperationException("AREA_CREATE_FAILED");
    return;
   }
   IntPtr descriptor;
   if(!ConvertStringSecurityDescriptorToSecurityDescriptor(sddl,1,out descriptor,IntPtr.Zero))
    throw new InvalidOperationException("AREA_DESCRIPTOR");
   try {
    var attributes=new SecurityAttributes { Length=Marshal.SizeOf(typeof(SecurityAttributes)),Descriptor=descriptor };
    if(!CreateDirectory(path,ref attributes)) throw new InvalidOperationException("AREA_CREATE_FAILED");
   } finally { LocalFree(descriptor); }
  }

  readonly SafeFileHandle handle;
  public string FileId { get; private set; }
  public string Volume { get; private set; }
  public string Sddl { get; private set; }
  public DateTime CreatedUtc { get; private set; }
  public DateTime LastWriteUtc { get; private set; }
  public long Size { get; private set; }
  public AreaHandle(string path,bool directory,bool hold) {
   // Bit 1 requests FILE_LIST_DIRECTORY or FILE_READ_DATA, depending on the target.
   uint access=0x120080u|(hold?1u:0u);
   uint sharing=hold?(directory?3u:1u):7u;
   handle=CreateFile(path,access,sharing,IntPtr.Zero,3,0x02200000,IntPtr.Zero);
   try {
    Info info;
    if(handle.IsInvalid||!GetFileInformationByHandle(handle,out info)) throw new InvalidOperationException("AREA_MISSING");
    if((info.Attributes&1024)!=0 || ((info.Attributes&16)!=0)!=directory || (!directory&&info.Links!=1))
     throw new InvalidOperationException("AREA_REPARSE");
    CreatedUtc=DateTime.FromFileTimeUtc(((long)info.Created.dwHighDateTime<<32)|(uint)info.Created.dwLowDateTime);
    LastWriteUtc=DateTime.FromFileTimeUtc(((long)info.Written.dwHighDateTime<<32)|(uint)info.Written.dwLowDateTime);
    Size=((long)info.SizeHigh<<32)|info.SizeLow;
    IntPtr id=Marshal.AllocHGlobal(24);
    try {
     if(!GetFileInformationByHandleEx(handle,18,id,24)) throw new InvalidOperationException("AREA_RECORD");
     Volume=Marshal.ReadInt64(id).ToString("X16",CultureInfo.InvariantCulture);
     var bytes=new byte[16];
     Marshal.Copy(IntPtr.Add(id,8),bytes,0,bytes.Length);
     FileId=BitConverter.ToString(bytes).Replace("-","");
    } finally { Marshal.FreeHGlobal(id); }
    IntPtr descriptor;
    if(GetSecurityInfo(handle,1,5,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,IntPtr.Zero,out descriptor)!=0)
     throw new InvalidOperationException("AREA_PERMISSIONS");
    try {
     IntPtr text;
     if(!ConvertSecurityDescriptorToStringSecurityDescriptor(descriptor,1,5,out text,IntPtr.Zero))
      throw new InvalidOperationException("AREA_PERMISSIONS");
     try { Sddl=Marshal.PtrToStringUni(text); }
     finally { LocalFree(text); }
    } finally { LocalFree(descriptor); }
   } catch { handle.Dispose(); throw; }
  }
  public void Dispose() { handle.Dispose(); }
 }
}
'@

function Get-DyeAreaTuple([string]$Path,[bool]$Directory=$true) {
    $item=New-Object DyeStage2.AreaHandle($Path,$Directory,$false)
    try { return [ordered]@{volume=$item.Volume;id=$item.FileId;sddl=$item.Sddl} }
    finally { $item.Dispose() }
}

function Assert-DyeAreaTuple($Actual,$Expected) {
    if(!$Expected -or $Actual.Volume -cne $Expected.volume -or $Actual.FileId -cne $Expected.id){throw 'AREA_REPLACED'}
    if($Actual.Sddl -cne $Expected.sddl){throw 'AREA_PERMISSIONS'}
}

function Get-DyeStage1bInventory($Objects) {
    foreach($item in $Objects) {
        $path=[string]$item.path
        [void](Get-DyeProbePath $path)
        $directory=$item.kind -ceq 'directory'
        $handle=New-Object DyeStage2.AreaHandle($path,$directory,$false)
        try {
            $children=@()
            if($directory){
                $children=[string[]]@([IO.Directory]::EnumerateFileSystemEntries($path) | ForEach-Object {[IO.Path]::GetFileName($_)})
                [Array]::Sort($children,[StringComparer]::Ordinal)
            }
            [ordered]@{path=$path;kind=$item.kind;volume=$handle.Volume;id=$handle.FileId;
                sddl=$handle.Sddl;size=$handle.Size;children=@($children)}
        }finally{$handle.Dispose()}
    }
}

function Assert-DyeStage1bInventory($Expected,[string]$EvidenceRoot,[switch]$Fixture) {
    if(@($Expected).Count -eq 0){throw 'S1B_INVENTORY_CHANGED'}
    try{
        $control=(Join-Path $EvidenceRoot '_supervisor')+'\'
        $fixtureRoot=[IO.Path]::GetDirectoryName($EvidenceRoot)+'\'
        foreach($item in $Expected){
            $path=[IO.Path]::GetFullPath([string]$item.path)
            if($path -cne $item.path -or ($Fixture -and !$path.StartsWith($fixtureRoot,[StringComparison]::OrdinalIgnoreCase))){throw 'Inventory path'}
            if($item.kind -ceq 'directory'){
                if($path -cne $control.TrimEnd('\') -and !$path.StartsWith($control,[StringComparison]::Ordinal)){throw 'Inventory directory'}
            }elseif($item.kind -cne 'file'){throw 'Inventory kind'}
        }
        $observed=@(Get-DyeStage1bInventory $Expected)
        $before=ConvertTo-Json -InputObject @($Expected) -Depth 8 -Compress
        $after=ConvertTo-Json -InputObject $observed -Depth 8 -Compress
        if($before -cne $after){throw 'S1B_INVENTORY_CHANGED'}
    }catch{throw 'S1B_INVENTORY_CHANGED'}
}

function Assert-DyeStage2Area($Manifest,[switch]$Hold) {
    $area=[string]$Manifest['area_path']
    $class=$Manifest['run_class']
    $temp=[IO.Path]::GetTempPath().TrimEnd('\')+'\'
    if($class -ceq 'live-test'){
        if(!$area.StartsWith($temp,[StringComparison]::OrdinalIgnoreCase) -or
           [IO.Path]::GetFileName($area) -cne '_stage2'){throw 'AREA_RECORD'}
    }elseif($class -cne 'live-real' -or $area -cne 'C:\Projects\dye-ledger-evidence\_stage2'){
        throw 'AREA_RECORD'
    }
    if(!(Test-Path -LiteralPath $area -PathType Container)){throw 'AREA_MISSING'}
    try {[void](Get-DyeProbePath $area)}
    catch {if($_.ToString() -match 'Reparse'){throw 'AREA_REPARSE'};throw}
    $recordPath=Join-Path $area 'area.json'
    $opened=New-Object 'Collections.Generic.List[IDisposable]'
    $success=$false
    try {
        $areaHandle=New-Object DyeStage2.AreaHandle($area,$true,[bool]$Hold)
        $opened.Add($areaHandle)
        $recordHandle=New-Object DyeStage2.AreaHandle($recordPath,$false,$true)
        $opened.Add($recordHandle)
        $recordBytes=[IO.File]::ReadAllBytes($recordPath)
        if($recordBytes.Length -gt 65536){throw 'AREA_RECORD'}
        $sha=[Security.Cryptography.SHA256]::Create()
        try{$digest=[BitConverter]::ToString($sha.ComputeHash($recordBytes)).Replace('-','')}
        finally{$sha.Dispose()}
        if($digest -cne $Manifest['area_record_hash']){throw 'AREA_RECORD'}
        $record=(New-Object Text.UTF8Encoding($false,$true)).GetString($recordBytes) | ConvertFrom-Json
        if($record.path -cne $area){throw 'AREA_RECORD'}
        if($record.provisionId -cnotmatch '^[a-f0-9]{32}$'){throw 'AREA_RECORD'}
        $receiptPath=Join-Path (Join-Path ([IO.Path]::GetDirectoryName($area)) 'WP-AUTO-02') ('stage2-area-'+$record.provisionId+'.json')
        try {
            [void](Get-DyeProbePath $receiptPath)
            $receiptHandle=New-Object DyeStage2.AreaHandle($receiptPath,$false,$true)
            $opened.Add($receiptHandle)
            $receiptBytes=[IO.File]::ReadAllBytes($receiptPath)
            if($receiptBytes.Length -gt 131072){throw 'AREA_RECORD'}
            $receipt=(New-Object Text.UTF8Encoding($false,$true)).GetString($receiptBytes) | ConvertFrom-Json
            if($receipt.areaRecordHash -cne $digest -or $receipt.record.provisionId -cne $record.provisionId -or
               $receipt.record.approvalHash -cne $record.approvalHash){throw 'AREA_RECORD'}
        } catch {throw 'AREA_RECORD'}
        Assert-DyeAreaTuple $areaHandle $record.root
        if($areaHandle.Volume -cne $Manifest['area_volume'] -or $areaHandle.FileId -cne $Manifest['area_file_id']){throw 'AREA_REPLACED'}
        if($recordHandle.Sddl -cne $record.recordSddl){throw 'AREA_PERMISSIONS'}
        $current=[Security.Principal.WindowsIdentity]::GetCurrent()
        try {
            $descriptor=New-Object Security.AccessControl.RawSecurityDescriptor($areaHandle.Sddl)
            if($current.User.Value -cne $record.owner -or $descriptor.Owner.Value -cne $record.owner -or
              ([DyeStage2.AreaHandle]::IsTokenMember($record.deny)) -or @($current.Groups | Where-Object Value -ceq $record.deny).Count){throw 'AREA_TOKEN'}
            $first=$descriptor.DiscretionaryAcl[0]
            if(!($descriptor.ControlFlags -band [Security.AccessControl.ControlFlags]::DiscretionaryAclProtected) -or
               $first.AceType -ne [Security.AccessControl.AceType]::AccessDenied -or $first.SecurityIdentifier.Value -cne $record.deny -or
               (($first.AccessMask -band 0x1F01FF) -ne 0x1F01FF)){throw 'AREA_PERMISSIONS'}
            if($class -ceq 'live-test' -and $record.deny -cne 'S-1-5-7'){throw 'AREA_TOKEN'}
        }finally{$current.Dispose()}
        $children=@([IO.Directory]::EnumerateFileSystemEntries($area) | ForEach-Object {[IO.Path]::GetFileName($_)} | Sort-Object)
        if(($children -join '|') -cne 'approvals|area.json|runs'){throw 'AREA_UNEXPECTED'}
        foreach($name in @('approvals','runs')){
            $item=New-Object DyeStage2.AreaHandle((Join-Path $area $name),$true,($name -ceq 'runs' -and $Hold))
            $opened.Add($item)
            Assert-DyeAreaTuple $item $record.$name
        }
        $run=Join-Path (Join-Path $area 'runs') ('stage2-'+$Manifest['run_id'])
        if($Manifest['cwd'] -cne $run.ToUpperInvariant()){throw 'AREA_RECORD'}
        $runHandle=New-Object DyeStage2.AreaHandle($run,$true,[bool]$Hold)
        $opened.Add($runHandle)
        if($runHandle.FileId -cne $Manifest['run_dir_file_id'] -or $runHandle.Volume -cne $areaHandle.Volume){throw 'AREA_REPLACED'}
        if($runHandle.Sddl -cne $record.runSddl){throw 'AREA_PERMISSIONS'}
        $approval=[string]$Manifest['approval_path']
        if([IO.Path]::GetDirectoryName($approval) -cne (Join-Path $area 'approvals').ToUpperInvariant()){throw 'AREA_RECORD'}
        $approvalHandle=New-Object DyeStage2.AreaHandle($approval,$false,$true)
        $opened.Add($approvalHandle)
        if($approvalHandle.FileId -cne $Manifest['approval_file_id'] -or $approvalHandle.Volume -cne $areaHandle.Volume){throw 'AREA_REPLACED'}
        if($approvalHandle.Sddl -cne $record.recordSddl){throw 'AREA_PERMISSIONS'}
        if((Get-DyeProbeHash $approval) -cne $Manifest['approval_hash']){throw 'AREA_RECORD'}
        Assert-DyeStage1bInventory $record.stage1bInventory ([IO.Path]::GetDirectoryName($area)) -Fixture:($class -ceq 'live-test')
        $success=$true
        if($Hold){return ,$opened}
    }finally{
        if(!$success -or !$Hold){foreach($item in $opened){$item.Dispose()}}
    }
}
