# Windows PowerShell 5.1; local Add-Type only. No permissions or ACLs changed.
if (-not ('DyeJobs.Process' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Text;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using Microsoft.Win32.SafeHandles;
namespace DyeJobs {
 public class Inspection { public bool Known,Alive; public long Created; public int Error; }
 [StructLayout(LayoutKind.Sequential)] public struct IO_COUNTERS { public ulong a,b,c,d,e,f; }
 [StructLayout(LayoutKind.Sequential)] public struct BASIC { public long a,b; public uint flags; public UIntPtr min,max; public uint active; public UIntPtr affinity; public uint priority, scheduling; }
 [StructLayout(LayoutKind.Sequential)] public struct LIMITS { public BASIC basic; public IO_COUNTERS io; public UIntPtr a,b,c,d; }
 [StructLayout(LayoutKind.Sequential)] public struct SECURITY { public int size; public IntPtr descriptor; [MarshalAs(UnmanagedType.Bool)] public bool inherit; }
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct STARTUP {
  public int cb; public string reserved,desktop,title; public uint x,y,xs,ys,xc,yc,fill,flags;
  public short show,reserved2; public IntPtr reservedPtr,input,output,error;
 }
 [StructLayout(LayoutKind.Sequential)] public struct STARTUPEX { public STARTUP startup; public IntPtr list; }
 [StructLayout(LayoutKind.Sequential)] public struct PI { public IntPtr process,thread; public uint pid,tid; }
 public class Process : IDisposable {
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern IntPtr CreateJobObject(IntPtr a,string n);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetInformationJobObject(IntPtr j,int c,ref LIMITS l,uint s);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AssignProcessToJobObject(IntPtr j,IntPtr p);
  [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateProcessW(string app,StringBuilder cmd,IntPtr a,IntPtr b,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPEX startup,out PI pi);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool InitializeProcThreadAttributeList(IntPtr list,int count,uint flags,ref IntPtr size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool UpdateProcThreadAttribute(IntPtr list,uint flags,IntPtr key,IntPtr value,IntPtr size,IntPtr previous,IntPtr result);
  [DllImport("kernel32.dll")] static extern void DeleteProcThreadAttributeList(IntPtr list);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SECURITY sa,uint size);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool SetHandleInformation(IntPtr handle,uint mask,uint flags);
  [DllImport("kernel32.dll")] static extern uint ResumeThread(IntPtr thread);
  [DllImport("kernel32.dll")] static extern uint WaitForSingleObject(IntPtr handle,uint ms);
  [DllImport("kernel32.dll")] static extern bool GetExitCodeProcess(IntPtr p,out uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateProcess(IntPtr p,uint code);
  [DllImport("kernel32.dll")] static extern bool TerminateJobObject(IntPtr j,uint code);
  [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool QueryInformationJobObject(IntPtr j,int c,IntPtr data,uint size,IntPtr result);
  [DllImport("kernel32.dll",SetLastError=true)] static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool member);
  [DllImport("kernel32.dll")] static extern bool GetProcessTimes(IntPtr p,out long created,out long exited,out long kernel,out long user);
  public IntPtr Job { get; private set; }
  public PI Child;
  Task reader1,reader2;
  static Exception Error(string step) { return new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error(),step); }
  static void Require(bool ok,string step) { if(!ok) throw Error(step); }
  public static string Quote(string value) {
   if(value.IndexOf('\0')>=0 || value.IndexOf('\r')>=0 || value.IndexOf('\n')>=0) throw new ArgumentException("Invalid argument");
   var b=new StringBuilder("\""); int slashes=0;
   foreach(char c in value) { if(c=='\\') { slashes++; continue; } if(c=='\"') { b.Append('\\',slashes*2+1); b.Append(c); } else { b.Append('\\',slashes); b.Append(c); } slashes=0; }
   b.Append('\\',slashes*2); return b.Append('"').ToString();
  }
  static Task Drain(IntPtr h,string file) {
   return Task.Run(()=> { using(var stream=new FileStream(new SafeFileHandle(h,true),FileAccess.Read)) using(var output=new FileStream(file,FileMode.CreateNew,FileAccess.Write,FileShare.Read)) { stream.CopyTo(output); output.Flush(true); } });
  }
  public Process(string executable,string[] args,string cwd,string stdout,string stderr) : this(executable,args,cwd,stdout,stderr,false) {}
  public Process(string executable,string[] args,string cwd,string stdout,string stderr,bool testBreakaway) : this(executable,args,cwd,stdout,stderr,testBreakaway,0) {}
  public Process(string executable,string[] args,string cwd,string stdout,string stderr,bool testBreakaway,long outerJob) : this(executable,args,cwd,stdout,stderr,testBreakaway,outerJob,false) {}
  public Process(string executable,string[] args,string cwd,string stdout,string stderr,bool testBreakaway,long outerJob,bool testConsole) {
   Job=CreateJobObject(IntPtr.Zero,null); if(Job==IntPtr.Zero) throw Error("CreateJobObject");
   IntPtr read1=IntPtr.Zero,write1=IntPtr.Zero,read2=IntPtr.Zero,write2=IntPtr.Zero,list=IntPtr.Zero,handles=IntPtr.Zero;
   bool started=false;
   try {
    var limits=new LIMITS(); limits.basic.flags=0x2000; // KILL_ON_JOB_CLOSE; NO breakaway.
    Require(SetInformationJobObject(Job,9,ref limits,(uint)Marshal.SizeOf(limits)),"SetInformationJobObject");
    var sa=new SECURITY { size=Marshal.SizeOf(typeof(SECURITY)),inherit=true };
    Require(CreatePipe(out read1,out write1,ref sa,0),"stdout pipe");
    Require(CreatePipe(out read2,out write2,ref sa,0),"stderr pipe");
    Require(SetHandleInformation(read1,1,0),"stdout read noninherit");
    Require(SetHandleInformation(read2,1,0),"stderr read noninherit");
    IntPtr size=IntPtr.Zero; InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);
    list=Marshal.AllocHGlobal(size); Require(InitializeProcThreadAttributeList(list,1,0,ref size),"Initialize attribute list");
    handles=Marshal.AllocHGlobal(IntPtr.Size*2); Marshal.WriteIntPtr(handles,0,write1); Marshal.WriteIntPtr(handles,IntPtr.Size,write2);
    Require(UpdateProcThreadAttribute(list,0,new IntPtr(0x20002),handles,new IntPtr(IntPtr.Size*2),IntPtr.Zero,IntPtr.Zero),"Restrict inherited handles");
    var si=new STARTUPEX(); si.startup.cb=Marshal.SizeOf(si); si.startup.flags=0x100; si.startup.output=write1; si.startup.error=write2; si.startup.input=IntPtr.Zero; si.list=list;
    var cmd=new StringBuilder(Quote(executable)); foreach(var arg in args) cmd.Append(" ").Append(Quote(arg.Replace("__DYE_JOB_HANDLE__",Job.ToInt64().ToString())));
    Require(CreateProcessW(executable,cmd,IntPtr.Zero,IntPtr.Zero,true,0x80000|0x4|(testConsole ? 0x10u : 0x8000000u)|(testBreakaway ? 0x1000000u : 0u),IntPtr.Zero,cwd,ref si,out Child),"Create suspended child"); started=true;
    if(outerJob!=0) Require(AssignProcessToJobObject(new IntPtr(outerJob),Child.process),"Assign outer job before resume");
    Require(AssignProcessToJobObject(Job,Child.process),"Assign child before resume");
    reader1=Drain(read1,stdout); read1=IntPtr.Zero; reader2=Drain(read2,stderr); read2=IntPtr.Zero;
    if(ResumeThread(Child.thread)==0xffffffff) throw Error("ResumeThread");
   } catch { if(started) TerminateProcess(Child.process,98); Kill(); Dispose(); throw; }
   finally {
    foreach(var h in new[]{read1,read2,write1,write2}) if(h!=IntPtr.Zero) CloseHandle(h);
    if(list!=IntPtr.Zero) { DeleteProcThreadAttributeList(list); Marshal.FreeHGlobal(list); }
    if(handles!=IntPtr.Zero) Marshal.FreeHGlobal(handles);
   }
  }
  public int Pid { get { return (int)Child.pid; } }
  public long Created { get { long c,e,k,u; if(!GetProcessTimes(Child.process,out c,out e,out k,out u)) throw Error("Child creation time"); return c; } }
  public bool Exited { get { return WaitForSingleObject(Child.process,0)==0; } }
  public int ExitCode { get { uint c; GetExitCodeProcess(Child.process,out c); return (int)c; } }
  public void Kill() { if(Job!=IntPtr.Zero) TerminateJobObject(Job,99); }
  public static long CreationTime(int pid) {
   IntPtr p=OpenProcess(0x100000|0x1000,false,pid); if(p==IntPtr.Zero) throw Error("Open parent");
   try { long c,e,k,u; if(!GetProcessTimes(p,out c,out e,out k,out u)) throw Error("Parent creation time"); return c; } finally { CloseHandle(p); }
  }
  public static bool ParentAlive(int pid,long expected) {
   IntPtr p=OpenProcess(0x100000|0x1000,false,pid); if(p==IntPtr.Zero) return false;
   try { long c,e,k,u; return WaitForSingleObject(p,0)!=0 && GetProcessTimes(p,out c,out e,out k,out u) && c==expected; }
   finally { CloseHandle(p); }
  }
  public static Inspection Inspect(int pid) {
   var r=new Inspection(); IntPtr p=OpenProcess(0x100000|0x1000,false,pid);
   if(p==IntPtr.Zero) { r.Error=Marshal.GetLastWin32Error(); r.Known=r.Error==87 || r.Error==1168; return r; }
   try { long c,e,k,u; uint wait=WaitForSingleObject(p,0); if(wait==0) {r.Known=true;return r;}
    if(wait==0xffffffff || !GetProcessTimes(p,out c,out e,out k,out u)) {r.Error=Marshal.GetLastWin32Error();return r;}
    r.Known=true;r.Alive=true;r.Created=c;return r;
   } finally {CloseHandle(p);}
  }
  public static bool KillVerified(int pid,long expected) {
   IntPtr p=OpenProcess(0x100000|0x1000|1,false,pid); if(p==IntPtr.Zero) return Inspect(pid).Known && !Inspect(pid).Alive;
   try {long c,e,k,u; if(WaitForSingleObject(p,0)==0)return true;
    if(!GetProcessTimes(p,out c,out e,out k,out u) || c!=expected)return false;
    return TerminateProcess(p,99) && WaitForSingleObject(p,2000)==0;
   } finally {CloseHandle(p);}
  }
  public static bool Member(int pid,long job) {
   IntPtr p=OpenProcess(0x1000,false,pid); if(p==IntPtr.Zero)throw Error("Membership process");
   try {bool member;Require(IsProcessInJob(p,new IntPtr(job),out member),"Job membership");return member;} finally {CloseHandle(p);}
  }
  public static volatile bool OwnerStop;
  public static volatile bool ConsoleClosing;
  static readonly System.Threading.ManualResetEventSlim consoleStopped = new System.Threading.ManualResetEventSlim(false);
  static long consoleCloseTick;
  public static double ConsoleCloseRemainingMs() {
   return ConsoleClosing ? Math.Max(0,4000-(System.Diagnostics.Stopwatch.GetTimestamp()-System.Threading.Interlocked.Read(ref consoleCloseTick))*1000.0/System.Diagnostics.Stopwatch.Frequency) : 4000;
  }
  public static void CompleteConsoleStop() { consoleStopped.Set(); }
  delegate bool ConsoleHandler(uint kind);
  static ConsoleHandler consoleHandler;
  [DllImport("kernel32.dll")] static extern bool SetConsoleCtrlHandler(ConsoleHandler handler,bool add);
  [DllImport("kernel32.dll")] static extern IntPtr GetConsoleWindow();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool FreeConsole();
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool AttachConsole(uint pid);
  [DllImport("kernel32.dll",SetLastError=true)] static extern bool GenerateConsoleCtrlEvent(uint kind,uint group);
  [DllImport("user32.dll",SetLastError=true)] static extern bool PostMessage(IntPtr window,uint message,IntPtr w,IntPtr l);
  [DllImport("user32.dll",SetLastError=true)] static extern uint GetWindowThreadProcessId(IntPtr window,out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindow(IntPtr window);
  [DllImport("kernel32.dll",SetLastError=true)] static extern uint GetConsoleProcessList([Out] uint[] processes,uint count);
  public static long ConsoleWindow() {return GetConsoleWindow().ToInt64();}
  // The seam below is used only by deterministic tests of this test-signal helper.
  // Operator requests cannot select an API: the public native entry point fixes it.
  public abstract class OwnedConsoleApi {
   public abstract Inspection Identity(int pid);
   public abstract bool InJob(int pid,long job);
   public abstract void Detach();
   public abstract void Attach(int pid);
   public abstract long Window();
   public abstract int[] Clients();
   public abstract bool WindowExists(long window);
   public abstract uint WindowOwner(long window);
   public abstract void PostClose(long window);
  }
  sealed class NativeOwnedConsoleApi : OwnedConsoleApi {
   public override Inspection Identity(int pid) {return Inspect(pid);}
   public override bool InJob(int pid,long job) {return Member(pid,job);}
   public override void Detach() {
    FreeConsole();
    if(GetConsoleWindow()!=IntPtr.Zero)throw new InvalidOperationException("Signalling helper is still attached");
   }
   public override void Attach(int pid) {Require(AttachConsole((uint)pid),"Attach test-created console");}
   public override long Window() {return ConsoleWindow();}
   public override int[] Clients() {
    uint[] values=new uint[16];uint count=GetConsoleProcessList(values,(uint)values.Length);
    if(count==0)throw Error("Inspect test console clients");
    if(count>values.Length) {
     if(count>4096)throw new InvalidOperationException("Unexpected test console client count");
     values=new uint[count];count=GetConsoleProcessList(values,(uint)values.Length);
     if(count==0 || count>values.Length)throw new InvalidOperationException("Test console clients changed during inspection");
    }
    int[] result=new int[count];for(int i=0;i<count;i++)result[i]=checked((int)values[i]);return result;
   }
   public override bool WindowExists(long window) {return IsWindow(new IntPtr(window));}
   public override uint WindowOwner(long window) {uint pid;GetWindowThreadProcessId(new IntPtr(window),out pid);return pid;}
   public override void PostClose(long window) {Require(PostMessage(new IntPtr(window),0x10,IntPtr.Zero,IntPtr.Zero),"Close owned classic console");}
  }
  public class ConsoleCloseTrace {
   public string Phase="not_attempted",ValidatedAtUtc,PostedAtUtc;
   public bool Detached,PostAttempted,Posted;
   public int AttachedChecks;
   public uint ObservedWindowOwner;
   public int[] Clients;
  }
  static void CheckCloseIdentity(OwnedConsoleApi api,int hostPid,long hostCreated,int launcherPid,long launcherCreated,long window,long job) {
   var host=api.Identity(hostPid);var launcher=api.Identity(launcherPid);
   if(hostPid<=0 || launcherPid<=0 || hostPid==launcherPid || job==0 || !host.Known || !host.Alive || host.Created!=hostCreated || !launcher.Known || !launcher.Alive || launcher.Created!=launcherCreated || window==0)
    throw new InvalidOperationException("Classic test console identity unverified");
   if(!api.InJob(launcherPid,job))throw new InvalidOperationException("Launcher is not in test-owned conhost job");
   if(!api.WindowExists(window))throw new InvalidOperationException("Test console window is gone");
  }
  public static void CloseOwnedClassicConsole(int hostPid,long hostCreated,int launcherPid,long launcherCreated,long window,long job,ConsoleCloseTrace trace) {
   CloseOwnedClassicConsole(hostPid,hostCreated,launcherPid,launcherCreated,window,job,trace,new NativeOwnedConsoleApi());
  }
  public static void CloseOwnedClassicConsole(int hostPid,long hostCreated,int launcherPid,long launcherCreated,long window,long job,ConsoleCloseTrace trace,OwnedConsoleApi api) {
   trace.Phase="validating";
   CheckCloseIdentity(api,hostPid,hostCreated,launcherPid,launcherCreated,window,job);
   // This dedicated helper detaches itself, never the operator's console process.
   api.Detach();trace.Detached=true;
   try {
    api.Attach(launcherPid);trace.Detached=false;
    // Repeat all attached identity checks immediately before detaching to signal.
    for(int pass=0;pass<2;pass++) {
     CheckCloseIdentity(api,hostPid,hostCreated,launcherPid,launcherCreated,window,job);
     if(api.Window()!=window)throw new InvalidOperationException("Attached console window changed");
     var clients=api.Clients();bool found=false;foreach(int pid in clients)if(pid==launcherPid)found=true;
     if(!found)throw new InvalidOperationException("Launcher is not a client of attached console");
     trace.Clients=clients;trace.AttachedChecks++;trace.ObservedWindowOwner=api.WindowOwner(window);
    }
   } finally {api.Detach();trace.Detached=true;}
   // Attached-window/client checks must precede FreeConsole; process/job/window
   // identities are checked again after it, immediately before the only PostMessage.
   CheckCloseIdentity(api,hostPid,hostCreated,launcherPid,launcherCreated,window,job);
   trace.ValidatedAtUtc=DateTime.UtcNow.ToString("o");trace.Phase="validated_detached";
   trace.PostAttempted=true;api.PostClose(window);trace.Posted=true;
   trace.PostedAtUtc=DateTime.UtcNow.ToString("o");trace.Phase="posted";
  }
  public static void SignalOwnedConsole(int pid,long created,long window,bool close) {
   var info=Inspect(pid);if(!info.Known || !info.Alive || info.Created!=created || window==0)throw new InvalidOperationException("Test console identity unverified");
   // Detaches this helper only. The operator's console/window is never closed.
   FreeConsole();Require(AttachConsole((uint)pid),"Attach test-created console");
   try {
    if(GetConsoleWindow().ToInt64()!=window)throw new InvalidOperationException("Console window changed");
    if(close){FreeConsole();Require(PostMessage(new IntPtr(window),0x10,IntPtr.Zero,IntPtr.Zero),"Close test-created console");}
    else {Require(SetConsoleCtrlHandler(null,true),"Ignore Ctrl+C in helper");Require(GenerateConsoleCtrlEvent(0,0),"Signal test-created console");}
   }finally{FreeConsole();}
  }
  public static void WatchConsole(string eventPath) {
   OwnerStop=false;ConsoleClosing=false;System.Threading.Interlocked.Exchange(ref consoleCloseTick,0);consoleStopped.Reset();
   consoleHandler=kind=>{
    if(kind==0 || kind==1) {OwnerStop=true;return true;}
    if(kind==2 || kind==5 || kind==6) {
     System.Threading.Interlocked.CompareExchange(ref consoleCloseTick,System.Diagnostics.Stopwatch.GetTimestamp(),0);
     ConsoleClosing=true;OwnerStop=true;
     try {
      using(var file=new FileStream(eventPath,FileMode.CreateNew,FileAccess.Write,FileShare.Read))
      using(var writer=new StreamWriter(file,new UTF8Encoding(false))) {
       writer.Write("{\"kind\":"+kind+",\"at\":\""+DateTime.UtcNow.ToString("o",System.Globalization.CultureInfo.InvariantCulture)+"\"}");writer.Flush();file.Flush(true);
      }
     } catch(Exception error) { Console.Error.WriteLine("Console event record failed: "+error.Message); }
     // Returning TRUE for close/logoff/shutdown terminates this process. Keep
     // this native handler alive until the PowerShell loop records containment.
     consoleStopped.Wait((int)ConsoleCloseRemainingMs());return true;
    }
    return false;
   };
   if(!SetConsoleCtrlHandler(consoleHandler,true))throw Error("Console handler");
  }
  public static bool IsJobHandle(long handle) {
   IntPtr data=Marshal.AllocHGlobal(48); try { return QueryInformationJobObject(new IntPtr(handle),1,data,48,IntPtr.Zero); } finally { Marshal.FreeHGlobal(data); }
  }
  public bool IsEmpty() {
   IntPtr data=Marshal.AllocHGlobal(48);
   try { Require(QueryInformationJobObject(Job,1,data,48,IntPtr.Zero),"Query job accounting"); return Marshal.ReadInt32(data,40)==0; }
   finally { Marshal.FreeHGlobal(data); }
  }
  public void Dispose() {
   if(Job!=IntPtr.Zero) { CloseHandle(Job); Job=IntPtr.Zero; }
   if(Child.thread!=IntPtr.Zero) { CloseHandle(Child.thread); Child.thread=IntPtr.Zero; }
   if(Child.process!=IntPtr.Zero) { CloseHandle(Child.process); Child.process=IntPtr.Zero; }
   try { if(reader1!=null) reader1.Wait(2000); if(reader2!=null) reader2.Wait(2000); } catch { }
  }
 }
}
'@
}

function Read-FakeSpec([string]$SpecPath, [switch]$TestHarness) {
    $spec = Get-Content -LiteralPath $SpecPath -Raw | ConvertFrom-Json
    if ($spec.kind -ne 'fake' -or -not $TestHarness -or $env:DYE_SUPERVISOR_TEST -ne '1') {
        throw 'NOT_APPROVED: Phase A wrappers accept only the explicit fake test harness.'
    }
    if (-not [IO.Path]::IsPathRooted($spec.executable) -or -not [IO.Path]::IsPathRooted($spec.cwd)) { throw 'Absolute paths required' }
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { $fixtureHash = [BitConverter]::ToString($hasher.ComputeHash([IO.File]::ReadAllBytes($spec.fixture))).Replace('-','') }
    finally { $hasher.Dispose() }
    if ($spec.fixtureHash -ne $fixtureHash) { throw 'Fixture hash mismatch' }
    if ([IO.Path]::GetFileName($spec.executable) -notin @('node.exe','powershell.exe')) { throw 'Only fake-fixture runtimes are allowed' }
    if ([IO.Path]::GetFileName($spec.fixture) -notin @('fake-process-tree.js','fake-job-probe.ps1','fake-agent.js','coordinator.js','validate-release.js','release-sanity-check.js')) { throw 'Unapproved Phase A target' }
    if ($spec.args -notcontains $spec.fixture) { throw 'Fixture argument missing' }
    return $spec
}

function Write-JobRecord([string]$Path, $Record) {
    if (Test-Path -LiteralPath $Path) { throw 'Refusing to overwrite job evidence' }
    $Record | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $Path -Encoding UTF8 -ErrorAction Stop
}
