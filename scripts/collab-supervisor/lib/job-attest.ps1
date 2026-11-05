if ('DyeStage2.JobAttest' -as [type]) { throw 'JOB_ATTEST_PRELOADED' }

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;

namespace DyeStage2 {
 public sealed class JobSample {
  public DateTime StartUtc { get; internal set; }
  public DateTime EndUtc { get; internal set; }
  public int ActiveProcesses { get; internal set; }
  public string Status { get; internal set; }
  public string Reason { get; internal set; }
  public JobMember[] Members { get; internal set; }
 }
 public sealed class JobMember {
  public int Pid { get; internal set; }
  public string CreatedFiletime { get; internal set; }
 }
 public static class JobAttest {
  const int Limit=256;
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool QueryInformationJobObject(IntPtr job,int kind,IntPtr info,int bytes,IntPtr length);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern IntPtr OpenProcess(uint access,bool inherit,int pid);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool IsProcessInJob(IntPtr process,IntPtr job,out bool member);
  [DllImport("kernel32.dll",SetLastError=true)]
  static extern bool GetProcessTimes(IntPtr process,out long created,out long exited,out long kernel,out long user);
  [DllImport("kernel32.dll")]
  static extern bool CloseHandle(IntPtr handle);

  public static Task<JobSample> Start(long ownerJob) {
   // The caller keeps this owner-side handle alive while collecting a sample.
   return Task.Run(()=>Read(new IntPtr(ownerJob)));
  }
  public sealed class Recorder : IDisposable {
   readonly BlockingCollection<string> requests=new BlockingCollection<string>(32);
   readonly Timer timer;
   readonly Task worker;
   readonly IntPtr job;
   int stopped;
   long terminationTicks;
   public bool Faulted { get; private set; }
   public Recorder(long ownerJob,string path,string name,string nonce) {
    job=new IntPtr(ownerJob);
    worker=Task.Run(()=>Run(path,name,nonce));
    requests.TryAdd("initial");
    timer=new Timer(unused=>Request("periodic"),null,500,500);
   }
   static string Quote(string value) {
    if(value==null) return "null";
    return "\""+value.Replace("\\","\\\\").Replace("\"","\\\"")+"\"";
   }
   void Run(string path,string name,string nonce) {
    try {
     if((name!="J0" && name!="J1") || !System.Text.RegularExpressions.Regex.IsMatch(nonce,"^dye-live-[a-f0-9-]{36}$")) throw new ArgumentException();
     using(var file=new FileStream(path,FileMode.CreateNew,FileAccess.Write,FileShare.Read)) {
      string previous=new string('0',64);
      int seq=0;
      foreach(var phase in requests.GetConsumingEnumerable()) {
       var sample=Read(job);
       long boundary=Interlocked.Read(ref terminationTicks);
       if(phase=="pre-terminate" && boundary!=0 && sample.EndUtc.Ticks>=boundary) {
        sample.Status="INCOMPLETE";
        sample.Reason="TERMINATION_RACE";
        sample.Members=new JobMember[0];
       }
       var members=new List<string>();
       foreach(var member in sample.Members) members.Add("{\"pid\":"+member.Pid+",\"createdFiletime\":"+Quote(member.CreatedFiletime)+"}");
       string details="{\"startUtc\":"+Quote(sample.StartUtc.ToString("o"))+",\"endUtc\":"+Quote(sample.EndUtc.ToString("o"))+
        ",\"activeProcesses\":"+sample.ActiveProcesses+",\"members\":["+String.Join(",",members)+"],\"reason\":"+Quote(sample.Reason)+"}";
       string record="{\"job\":"+Quote(name)+",\"runNonce\":"+Quote(nonce)+",\"seq\":"+seq+",\"phase\":"+Quote(phase)+
        ",\"previous\":"+Quote(previous)+",\"status\":"+Quote(sample.Status)+",\"sample\":"+details+"}";
       using(var sha=SHA256.Create()) previous=BitConverter.ToString(sha.ComputeHash(Encoding.UTF8.GetBytes(record))).Replace("-","");
       var bytes=Encoding.UTF8.GetBytes("{\"record\":"+record+",\"hash\":"+Quote(previous)+"}\n");
       file.Write(bytes,0,bytes.Length);
       file.Flush(true);
       seq++;
      }
     }
    } catch { Faulted=true; }
   }
   public void Request(string phase) {
    try {
     if(Volatile.Read(ref stopped)!=0 || (phase!="periodic" && phase!="pre-terminate")) return;
     if(!requests.TryAdd(phase)) Faulted=true;
    } catch { Faulted=true; }
   }
   public bool Finish(int milliseconds) {
    try {
     if(Interlocked.Exchange(ref stopped,1)==0) {
      timer.Dispose();
      if(!requests.TryAdd("final")) Faulted=true;
      requests.CompleteAdding();
     }
     return worker.Wait(milliseconds) && !Faulted;
    } catch { Faulted=true; return false; }
   }
   public void TerminationStarting() { Interlocked.Exchange(ref terminationTicks,DateTime.UtcNow.Ticks); }
   public void Dispose() {
    try { if(Interlocked.Exchange(ref stopped,1)==0) { timer.Dispose(); requests.CompleteAdding(); } }
    catch { Faulted=true; }
   }
  }
  public sealed class Periodic : IDisposable {
   readonly ConcurrentQueue<JobSample> samples=new ConcurrentQueue<JobSample>();
   readonly Timer timer;
   readonly IntPtr job;
   int active,stopped;
   public Periodic(long ownerJob) {
    job=new IntPtr(ownerJob);
    timer=new Timer(Tick,null,500,500);
   }
   void Tick(object unused) {
    if(Volatile.Read(ref stopped)!=0 || Interlocked.CompareExchange(ref active,1,0)!=0) return;
    try {
     if(Volatile.Read(ref stopped)==0 && samples.Count<512) {
      var sample=Read(job);
      if(Volatile.Read(ref stopped)==0) samples.Enqueue(sample);
     }
    } catch {
     samples.Enqueue(new JobSample { StartUtc=DateTime.UtcNow,EndUtc=DateTime.UtcNow,
      Status="INCOMPLETE",Reason="TIMER_FAULT",Members=new JobMember[0] });
    } finally { Volatile.Write(ref active,0); }
   }
   public JobSample[] Samples { get { return samples.ToArray(); } }
   public void Dispose() {
    Interlocked.Exchange(ref stopped,1);
    timer.Dispose();
   }
  }
  static JobSample Read(IntPtr job) {
   var result=new JobSample { StartUtc=DateTime.UtcNow, Status="INCOMPLETE", Members=new JobMember[0] };
   var elapsed=Stopwatch.StartNew();
   IntPtr list=IntPtr.Zero,accounting=IntPtr.Zero;
   try {
    int size=8+Limit*IntPtr.Size;
    list=Marshal.AllocHGlobal(size);
    accounting=Marshal.AllocHGlobal(48);
    result.Reason="PROCESS_LIST";
    if(!QueryInformationJobObject(job,3,list,size,IntPtr.Zero)) { result.Reason+=":"+Marshal.GetLastWin32Error(); return result; }
    int count=Marshal.ReadInt32(list,4);
    if(count<0||count>Limit||count!=Marshal.ReadInt32(list,0)) return result;
    var members=new List<JobMember>(count);
    for(int i=0;i<count;i++) {
     if(elapsed.ElapsedMilliseconds>=100) return result;
     long pid=Marshal.ReadIntPtr(list,8+i*IntPtr.Size).ToInt64();
     if(pid<=0||pid>Int32.MaxValue) return result;
     result.Reason="OPEN_PROCESS";
     IntPtr process=OpenProcess(0x1000,false,(int)pid);
     if(process==IntPtr.Zero) { result.Reason+=":"+Marshal.GetLastWin32Error(); return result; }
     try {
      bool member;
      long created,exited,kernel,user;
      result.Reason="MEMBER_IDENTITY";
      if(!IsProcessInJob(process,job,out member)||!member||
         !GetProcessTimes(process,out created,out exited,out kernel,out user)||created<=0||exited!=0) return result;
      members.Add(new JobMember { Pid=(int)pid,CreatedFiletime=created.ToString(System.Globalization.CultureInfo.InvariantCulture) });
     } finally { CloseHandle(process); }
    }
    result.Reason="ACCOUNTING";
    if(!QueryInformationJobObject(job,1,accounting,48,IntPtr.Zero)) return result;
    result.ActiveProcesses=Marshal.ReadInt32(accounting,40);
    if(result.ActiveProcesses!=count||elapsed.ElapsedMilliseconds>=100) return result;
    result.Members=members.ToArray();
    result.Status="OK";
    result.Reason=null;
    return result;
   } catch { return result; }
   finally {
    if(list!=IntPtr.Zero) Marshal.FreeHGlobal(list);
    if(accounting!=IntPtr.Zero) Marshal.FreeHGlobal(accounting);
    result.EndUtc=DateTime.UtcNow;
   }
  }
 }
}
'@

function Write-DyeJobAttestation([string]$Path,[string]$Job,[string]$Nonce,$Initial,$Final,$Periodic=$null) {
    $previous='0'*64
    $lines=@()
    $entries=@(@{phase='initial';task=$Initial})
    if($Periodic){$entries+=@($Periodic.Samples | ForEach-Object {@{phase='periodic';sample=$_}})}
    $entries+=@(@{phase='final';task=$Final})
    foreach($entry in $entries){
        $task=$entry.task
        $sample=$entry.sample
        if($null -ne $task -and $task.Status -eq [Threading.Tasks.TaskStatus]::RanToCompletion){$sample=$task.Result}
        $details=$null
        if($sample){
            $members=@($sample.Members | ForEach-Object {[ordered]@{pid=$_.Pid;createdFiletime=$_.CreatedFiletime}})
            $details=[ordered]@{startUtc=$sample.StartUtc.ToString('o');endUtc=$sample.EndUtc.ToString('o');
                activeProcesses=$sample.ActiveProcesses;members=$members;reason=$sample.Reason}
        }
        $record=[ordered]@{job=$Job;runNonce=$Nonce;seq=$lines.Count;phase=$entry.phase;previous=$previous;
            status=$(if($sample){$sample.Status}else{'INCOMPLETE'});sample=$details}
        $canonical=ConvertTo-Json -InputObject $record -Compress -Depth 8
        $sha=[Security.Cryptography.SHA256]::Create()
        try{$previous=[BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical))).Replace('-','')}
        finally{$sha.Dispose()}
        $lines+=(ConvertTo-Json -InputObject ([ordered]@{record=$record;hash=$previous}) -Compress -Depth 9)
    }
    Write-DyeLiveRecord $Path ($lines -join "`n")
}
