if ('DyeStage2.Identity' -as [type]) { throw 'IDENTITY_NATIVE_PRELOADED' }

Add-Type -TypeDefinition @'
using System;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Threading.Tasks;

namespace DyeStage2 {
 public sealed class ProcessIdentity {
  public int Pid { get; internal set; }
  public int? ParentPid { get; internal set; }
  public string CreatedFiletime { get; internal set; }
  public string ParentCreatedFiletime { get; internal set; }
  public string OwnerSid { get; internal set; }
  public string Image { get; internal set; }
  public string ImageSha256 { get; internal set; }
  public string Error { get; internal set; }
  public string IntegritySid { get; internal set; }
  public string[] RestrictedSids { get; internal set; }
  public int? TokenType { get; internal set; }
  public bool? Elevated { get; internal set; }
  public System.Collections.Generic.Dictionary<string,string> FieldErrors { get; internal set; }

 }
 public sealed class ProcessObservation {
  public string Status { get; internal set; }
  public DateTime ObservedUtc { get; internal set; }
  public ProcessIdentity[] Processes { get; internal set; }
 }
 public static class Identity {
  [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)]
  struct ProcessEntry {
   public uint Size,Usage,Pid;
   public IntPtr Heap;
   public uint Module,Threads,Parent;
   public int Priority;
   public uint Flags;
   [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string Image;
  }
  [StructLayout(LayoutKind.Sequential)]
  struct WtsProcess {
   public uint Session,Pid;
   public IntPtr Name,Sid;
   public uint Threads,Handles,Pagefile,PeakPagefile,WorkingSet,PeakWorkingSet;
   public long UserTime,KernelTime;
  }
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool CloseHandle(IntPtr handle);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
  [DllImport("kernel32.dll",EntryPoint="Process32FirstW",SetLastError=true)]
  static extern bool First(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll",EntryPoint="Process32NextW",SetLastError=true)]
  static extern bool Next(IntPtr snapshot,ref ProcessEntry entry);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool GetProcessTimes(IntPtr handle,out long created,out long exited,out long kernel,out long user);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]
  static extern bool QueryFullProcessImageName(IntPtr handle,uint flags,StringBuilder image,ref uint length);
  [DllImport("wtsapi32.dll",EntryPoint="WTSEnumerateProcessesExW",SetLastError=true)]
  static extern bool Enumerate(IntPtr server,ref uint level,uint session,out IntPtr rows,out uint count);
  [DllImport("wtsapi32.dll",EntryPoint="WTSFreeMemoryExW")]
  static extern bool Free(uint type,IntPtr rows,uint count);

  [DllImport("advapi32.dll",SetLastError=true)]
  static extern bool OpenProcessToken(IntPtr process,uint access,out IntPtr token);
  [DllImport("advapi32.dll",SetLastError=true)]
  static extern bool GetTokenInformation(IntPtr token,int kind,IntPtr buffer,int size,out int needed);
  [StructLayout(LayoutKind.Sequential)] struct SidEntry { public IntPtr Sid; public uint Attributes; }
  static ProcessIdentity Failure(ProcessIdentity result,string code) {
   result.Error=code;
   foreach(var field in new[]{"ParentPid","CreatedFiletime","ParentCreatedFiletime","OwnerSid","Image","ImageSha256"})
    result.FieldErrors[field]=code;
   return result;
  }
  static void TokenObservations(IntPtr process,ProcessIdentity result) {
   var names=new[]{"IntegritySid","RestrictedSids","TokenType","Elevated"};
   var kinds=new[]{25,11,8,20};
   IntPtr token;
   if(!OpenProcessToken(process,8,out token)) {
    foreach(var name in names)result.FieldErrors[name]="ACCESS_DENIED";
    return;
   }
   try {
    for(int i=0;i<kinds.Length;i++) {
     int needed;
     GetTokenInformation(token,kinds[i],IntPtr.Zero,0,out needed);
     if(needed<=0 || needed>65536) {result.FieldErrors[names[i]]="NOT_FOUND";continue;}
     IntPtr buffer=Marshal.AllocHGlobal(needed);
     try {
      if(!GetTokenInformation(token,kinds[i],buffer,needed,out needed)) {result.FieldErrors[names[i]]="ACCESS_DENIED";continue;}
      if(kinds[i]==25)result.IntegritySid=new SecurityIdentifier(Marshal.ReadIntPtr(buffer)).Value;
      else if(kinds[i]==8)result.TokenType=Marshal.ReadInt32(buffer);
      else if(kinds[i]==20)result.Elevated=Marshal.ReadInt32(buffer)!=0;
      else {
       int count=Marshal.ReadInt32(buffer),offset=IntPtr.Size==8?8:4,size=Marshal.SizeOf(typeof(SidEntry));
       if(count<0 || count>256 || (long)offset+(long)count*size>needed) {result.FieldErrors[names[i]]="NOT_FOUND";continue;}
       var sids=new string[count];
       for(int n=0;n<count;n++) {
        var entry=(SidEntry)Marshal.PtrToStructure(IntPtr.Add(buffer,offset+n*size),typeof(SidEntry));
        sids[n]=new SecurityIdentifier(entry.Sid).Value;
       }
       result.RestrictedSids=sids;
      }
     } catch(ArgumentException) {result.FieldErrors[names[i]]="NOT_FOUND";}
     finally {Marshal.FreeHGlobal(buffer);}
    }
   }finally {CloseHandle(token);}
  }

  static int? Parent(int pid) {
   IntPtr snapshot=CreateToolhelp32Snapshot(2,0);
   if(snapshot==new IntPtr(-1)) return null;
   try {
    var row=new ProcessEntry { Size=(uint)Marshal.SizeOf(typeof(ProcessEntry)) };
    if(!First(snapshot,ref row)) return null;
    do { if(row.Pid==(uint)pid) return (int)row.Parent; } while(Next(snapshot,ref row));
    return null;
   } finally { CloseHandle(snapshot); }
  }
  static string Owner(int pid) {
   uint level=1,count;
   IntPtr rows;
   if(!Enumerate(IntPtr.Zero,ref level,0xffffffff,out rows,out count)) return null;
   try {
    int size=Marshal.SizeOf(typeof(WtsProcess));
    for(uint i=0;i<count;i++) {
     var row=(WtsProcess)Marshal.PtrToStructure(IntPtr.Add(rows,checked((int)i*size)),typeof(WtsProcess));
     if(row.Pid==(uint)pid) return row.Sid==IntPtr.Zero?null:new SecurityIdentifier(row.Sid).Value;
    }
    return null;
   } finally { Free(1,rows,count); }
  }
  static long? Created(int pid) {
   IntPtr handle=OpenProcess(0x1000,false,pid);
   if(handle==IntPtr.Zero) return null;
   try {
    long created,exited,kernel,user;
    return GetProcessTimes(handle,out created,out exited,out kernel,out user)?(long?)created:null;
   } finally { CloseHandle(handle); }
  }
  public static ProcessIdentity Collect(int pid,string expectedCreated) {
   return Collect(pid,expectedCreated,null);
  }
  // Native-object test seam only: no request field selects a callback. The normal
  // entry always passes null. Tests can inject a failure or stop their own child
  // between observations without querying an unrelated process.
  public static ProcessIdentity Collect(int pid,string expectedCreated,Action<string> checkpoint) {
   var result=new ProcessIdentity { Pid=pid,FieldErrors=new System.Collections.Generic.Dictionary<string,string>() };
   if(pid<=0 || String.IsNullOrEmpty(expectedCreated)) { return Failure(result,"NOT_FOUND"); }
   IntPtr process=OpenProcess(0x1000,false,pid);
   if(process==IntPtr.Zero) {
    return Failure(result,Marshal.GetLastWin32Error()==5?"ACCESS_DENIED":"NOT_FOUND");
   }
   try {
    long created,exited,kernel,user;
    if(!GetProcessTimes(process,out created,out exited,out kernel,out user)) { return Failure(result,"ACCESS_DENIED"); }
    if(exited!=0) return Failure(result,"EXITED");
    if(created.ToString(CultureInfo.InvariantCulture)!=expectedCreated) { return Failure(result,"PID_RACE"); }
    if(checkpoint!=null)checkpoint("opened");
    int? parent=Parent(pid);
    string owner=Owner(pid);
    if(!parent.HasValue || owner==null) { return Failure(result,"NOT_FOUND"); }
    long? parentCreated=Created(parent.Value);
    if(!parentCreated.HasValue) { return Failure(result,"NOT_FOUND"); }
    if(parentCreated.Value>created) { return Failure(result,"PID_RACE"); }
    var image=new StringBuilder(32768);
    uint length=(uint)image.Capacity;
    if(!QueryFullProcessImageName(process,0,image,ref length)) { return Failure(result,"ACCESS_DENIED"); }
    string path=image.ToString();
    string digest;
    using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite|FileShare.Delete))
    using(var sha=SHA256.Create()) digest=BitConverter.ToString(sha.ComputeHash(file)).Replace("-","");
    TokenObservations(process,result);
    if(checkpoint!=null)checkpoint("collected");
    long again;
    if(!GetProcessTimes(process,out again,out exited,out kernel,out user) || again!=created ||
       exited!=0 || Parent(pid)!=parent || Created(parent.Value)!=parentCreated) {
     result.IntegritySid=null;result.RestrictedSids=null;result.TokenType=null;result.Elevated=null;
     foreach(var field in new[]{"IntegritySid","RestrictedSids","TokenType","Elevated"})result.FieldErrors[field]="PID_RACE";
     return Failure(result,exited!=0?"EXITED":"PID_RACE");
    }
    result.ParentPid=parent;
    result.CreatedFiletime=expectedCreated;
    result.ParentCreatedFiletime=parentCreated.Value.ToString(CultureInfo.InvariantCulture);
    result.OwnerSid=owner;
    result.Image=path;
    result.ImageSha256=digest;
    return result;
   } catch(UnauthorizedAccessException) { return Failure(result,"ACCESS_DENIED"); }
   catch(IOException) { return Failure(result,"NOT_FOUND"); }
   finally { CloseHandle(process); }
  }
  public static Task<ProcessIdentity> Start(int pid,string expectedCreated) {
   return Task.Run(()=>Collect(pid,expectedCreated));
  }
  // Explicit candidates keep fixture tests confined to processes they created.
  // A vanished or reused candidate invalidates the observation; it is never
  // silently removed from the set and cannot establish an empty baseline.
  public static ProcessObservation Observe(int[] pids,string[] created) {
   var result=new ProcessObservation { Status="INCOMPLETE",ObservedUtc=DateTime.UtcNow,
    Processes=new ProcessIdentity[0] };
   if(pids==null || created==null || pids.Length!=created.Length || pids.Length>256) return result;
   var seen=new System.Collections.Generic.HashSet<int>();
   var rows=new System.Collections.Generic.List<ProcessIdentity>();
   bool complete=true;
   for(int i=0;i<pids.Length;i++) {
    if(pids[i]<=0 || !seen.Add(pids[i])) return result;
    var row=Collect(pids[i],created[i]);
    rows.Add(row);
    if(row.Error!=null) complete=false;
   }
   result.Processes=rows.ToArray();
   result.Status=complete?"OK":"INCOMPLETE";
   return result;
  }
  // Inventory-only discovery. This never opens command lines, changes a process,
  // or supplies termination authority. Execution requires the outer S2-C gate.
  public static ProcessObservation ObserveOwners(string[] ownerSids) {
   var result=new ProcessObservation { Status="INCOMPLETE",ObservedUtc=DateTime.UtcNow,
    Processes=new ProcessIdentity[0] };
   if(ownerSids==null || ownerSids.Length==0 || ownerSids.Length>8) return result;
   var owners=new System.Collections.Generic.HashSet<string>(StringComparer.Ordinal);
   foreach(var sid in ownerSids) {
    try { if(new SecurityIdentifier(sid).Value!=sid || !owners.Add(sid)) return result; }
    catch(ArgumentException) { return result; }
   }
   uint level=1,count;
   IntPtr rows;
   if(!Enumerate(IntPtr.Zero,ref level,0xffffffff,out rows,out count)) return result;
   var selected=new System.Collections.Generic.List<ProcessIdentity>();
   bool complete=true;
   try {
    int size=Marshal.SizeOf(typeof(WtsProcess));
    for(uint i=0;i<count;i++) {
     var row=(WtsProcess)Marshal.PtrToStructure(IntPtr.Add(rows,checked((int)i*size)),typeof(WtsProcess));
     if(row.Pid==0) continue;
     if(row.Sid==IntPtr.Zero) { complete=false; continue; }
     string owner=new SecurityIdentifier(row.Sid).Value;
     if(!owners.Contains(owner)) continue;
     if(row.Pid>Int32.MaxValue || selected.Count>=256) { complete=false; break; }
     long? created=Created((int)row.Pid);
     var identity=created.HasValue?Collect((int)row.Pid,created.Value.ToString(CultureInfo.InvariantCulture)):
      Failure(new ProcessIdentity { Pid=(int)row.Pid,
       FieldErrors=new System.Collections.Generic.Dictionary<string,string>() },"NOT_FOUND");
     if(identity.Error!=null || identity.OwnerSid!=owner) complete=false;
     selected.Add(identity);
    }
   } catch { complete=false; }
   finally { Free(1,rows,count); }
   result.Processes=selected.ToArray();
   result.Status=complete?"OK":"INCOMPLETE";
   return result;
  }
 }
}
'@
