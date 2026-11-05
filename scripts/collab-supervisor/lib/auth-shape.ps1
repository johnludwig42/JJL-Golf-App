if ('DyeStage2.AuthShape' -as [type]) { throw 'AUTH_SHAPE_PRELOADED' }

Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Text;

namespace DyeStage2 {
 public sealed class AuthShape {
  sealed class TokenHit : Exception {
   public readonly string HitClass;
   public readonly int Line;
   public TokenHit(string hitClass,int line) { HitClass=hitClass;Line=line; }
  }
  static readonly string[] Keys = {
   "loggedIn", "authenticated", "mode", "authMethod", "apiProvider", "subscriptionType",
   "email", "orgId", "orgName", "accountId"
  };
  static readonly string[] Words = {
   "logged", "in", "not", "using", "ChatGPT", "chatgpt", "API", "api", "key", "apiKey",
   "oauth", "subscription", "claude.ai", "console", "firstParty", "pro", "max", "team",
   "enterprise", "free", "plus", "none"
  };
  static readonly string[] SensitivePrefixes = {
   "sk-", "Bearer ", "-----BEGIN", "WP-AUTO-02-SENTINEL-", "eyJ"
  };
  static readonly UTF8Encoding Utf8 = new UTF8Encoding(false,true);
  readonly char[] input;
  readonly Stopwatch elapsed;
  int position;

  AuthShape(char[] input, Stopwatch elapsed) { this.input=input; this.elapsed=elapsed; }

  void CheckBudget() {
   if(elapsed.ElapsedMilliseconds >= 250) throw new InvalidOperationException("EXTRACT_BUDGET");
  }
  static bool Match(char[] data,int at,int limit,string word) {
   if(limit-at<word.Length) return false;
   for(int i=0;i<word.Length;i++) if(data[at+i]!=word[i]) return false;
   return true;
  }
  void Scan(char[] data,int start,int count) {
   int tokenLength=0,end=start+count,line=1;
   for(int i=start;i<end;i++) {
    CheckBudget();
    char c=data[i];
    if(c=='\n') line++;
    tokenLength=(c>='A'&&c<='Z'||c>='a'&&c<='z'||c>='0'&&c<='9'||c=='+'||c=='/') ? tokenLength+1 : 0;
    if(tokenLength>=32) throw new TokenHit("LONG_ENCODED_RUN",line);
    for(int prefix=0;prefix<SensitivePrefixes.Length;prefix++)
     if(Match(data,i,end,SensitivePrefixes[prefix]))
      throw new TokenHit(new[]{"SECRET_PREFIX","BEARER","PEM","SENTINEL","JWT_LIKE"}[prefix],line);
   }
  }
  static string Retain(char[] data,int start,int length,string[] vocabulary,string kind) {
   foreach(string word in vocabulary)
    if(length==word.Length && Match(data,start,start+length,word)) return word;
   string category="other";
   bool alnum=length>0,uuid=length==36,email=false;
   for(int i=0;i<length;i++) {
    char c=data[start+i];
    if(c=='@' && i>0 && i<length-1) email=true;
    if(!Char.IsLetterOrDigit(c)) alnum=false;
    bool hyphen=i==8||i==13||i==18||i==23;
    if(uuid && (hyphen?c!='-':!(Digit(c)||c>='a'&&c<='f'||c>='A'&&c<='F'))) uuid=false;
   }
   if(email) category="email-like";
   else if(Match(data,start,start+length,"https://")||Match(data,start,start+length,"http://")) category="url-like";
   else if(uuid) category="uuid-like";
   else if(alnum) category="alnum";
   return "<"+kind+":len="+length.ToString(CultureInfo.InvariantCulture)+",class="+category+">";
  }
  static string Quote(string safe) { return "\""+safe+"\""; }
  public static string Vocabulary() { return "{\"keys\":["+String.Join(",",Array.ConvertAll(Keys,Quote))+"],\"words\":["+String.Join(",",Array.ConvertAll(Words,Quote))+"]}"; }
  static string ArrayJson(List<string> safe) { return "["+String.Join(",",safe)+"]"; }
  static void Invalid() { throw new InvalidOperationException("NOT_JSON"); }
  char Peek() { return position<input.Length ? input[position] : '\0'; }
  bool Take(char c) { if(position>=input.Length || input[position]!=c) return false; position++; return true; }
  void Space() {
   while(Peek()==' '||Peek()=='\r'||Peek()=='\n'||Peek()=='\t') { CheckBudget(); position++; }
  }
  static bool Digit(char c) { return c>='0' && c<='9'; }
  char Escape() {
   if(position==input.Length) Invalid();
   switch(input[position++]) {
    case '"': return '"';
    case '\\': return '\\';
    case '/': return '/';
    case 'b': return '\b';
    case 'f': return '\f';
    case 'n': return '\n';
    case 'r': return '\r';
    case 't': return '\t';
    case 'u':
     int value=0;
     for(int i=0;i<4;i++) {
      char c=Peek();
      int digit=Digit(c)?c-'0':c>='a'&&c<='f'?c-'a'+10:c>='A'&&c<='F'?c-'A'+10:-1;
      if(digit<0) Invalid();
      position++; value=value*16+digit;
     }
     return (char)value;
    default: Invalid(); return '\0';
   }
  }
  string StringToken(bool key,HashSet<string> seen) {
   if(!Take('"')) Invalid();
   var decoded=new char[input.Length-position];
   int length=0;
   try {
    while(!Take('"')) {
     CheckBudget();
     char c=Peek();
     if(c<' ') Invalid();
     position++;
     decoded[length++]=c=='\\' ? Escape() : c;
    }
    Scan(decoded,0,length);
    if(seen!=null) {
     // The comparison digest is local to the parser and never enters evidence.
     byte[] bytes=Utf8.GetBytes(decoded,0,length);
     try {
      using(var digest=System.Security.Cryptography.SHA256.Create()) {
       if(!seen.Add(Convert.ToBase64String(digest.ComputeHash(bytes)))) Invalid();
      }
     } finally { System.Array.Clear(bytes,0,bytes.Length); }
    }
    return Retain(decoded,0,length,key?Keys:Words,key?"key":"redacted");
   } finally { System.Array.Clear(decoded,0,length); }
  }
  string Number() {
   int start=position;
   Take('-');
   if(!Take('0')) {
    if(!Digit(Peek())) Invalid();
    while(Digit(Peek())) { CheckBudget(); position++; }
   }
   if(Take('.')) {
    if(!Digit(Peek())) Invalid();
    while(Digit(Peek())) { CheckBudget(); position++; }
   }
   if(Take('e')||Take('E')) {
    if(!Take('+')) Take('-');
    if(!Digit(Peek())) Invalid();
    while(Digit(Peek())) { CheckBudget(); position++; }
   }
   return position-start==1 && Digit(input[start]) ? ((int)(input[start]-'0')).ToString(CultureInfo.InvariantCulture) : Quote("<number>");
  }
  string Value(int depth) {
   CheckBudget();
   if(depth>32) Invalid();
   Space();
   if(Take('{')) {
    var fields=new List<string>();
    var seen=new HashSet<string>(StringComparer.Ordinal);
    Space();
    if(!Take('}')) {
     do {
      Space();
      string key=StringToken(true,seen);
      Space();
      if(!Take(':')) Invalid();
      fields.Add("["+Quote(key)+","+Value(depth+1)+"]");
      Space();
     } while(Take(','));
     if(!Take('}')) Invalid();
    }
    fields.Sort(StringComparer.Ordinal);
    return "{\"fields\":"+ArrayJson(fields)+"}";
   }
   if(Take('[')) {
    var items=new List<string>();
    Space();
    if(!Take(']')) {
     do { items.Add(Value(depth+1)); Space(); } while(Take(','));
     if(!Take(']')) Invalid();
    }
    return ArrayJson(items);
   }
   if(Peek()=='"') return Quote(StringToken(false,null));
   foreach(string literal in new[]{"true","false","null"}) {
    if(Match(input,position,input.Length,literal)) { position+=literal.Length; return literal; }
   }
   return Number();
  }
  string Text() {
   var lines=new List<string>();
   var words=new List<string>();
   while(position<input.Length) {
    CheckBudget();
    char c=input[position];
    if(c=='\r'||c=='\n') {
     position++;
     if(c=='\r') Take('\n');
     lines.Add(ArrayJson(words)); words.Clear();
    } else if(Char.IsWhiteSpace(c)) position++;
    else {
     int start=position;
     while(position<input.Length&&!Char.IsWhiteSpace(input[position])) { CheckBudget(); position++; }
     bool digits=true;
     for(int i=start;i<position;i++) if(!Digit(input[i])) digits=false;
     words.Add(Quote(digits?"<digits:"+(position-start).ToString(CultureInfo.InvariantCulture)+">":Retain(input,start,position-start,Words,"redacted")));
    }
   }
   if(words.Count>0) lines.Add(ArrayJson(words));
   return ArrayJson(lines);
  }
  static string Extract(byte[] bytes,int length,bool json,bool scanOnly,Stopwatch elapsed) {
   char[] chars=null;
   try {
    chars=Utf8.GetChars(bytes,0,length);
    var parser=new AuthShape(chars,elapsed);
    parser.Scan(chars,0,chars.Length);
    if(scanOnly) return null;
    if(!json) return parser.Text();
    parser.Space();
    if(parser.Peek()!='{') Invalid();
    string value=parser.Value(0);
    parser.Space();
    if(parser.position!=chars.Length) Invalid();
    return value;
   } finally { if(chars!=null) System.Array.Clear(chars,0,chars.Length); }
  }
  static string Consume(object capture,Func<byte[],int,string> extract) {
   try { return (string)capture.GetType().GetMethod("Consume").Invoke(capture,new object[]{extract}); }
   catch(System.Reflection.TargetInvocationException e) { throw e.InnerException; }
  }
  public static string Project(object output,object errors,bool json) {
   var elapsed=Stopwatch.StartNew();
   try {
    Consume(errors,(bytes,length)=>Extract(bytes,length,false,true,elapsed));
    string shape=Consume(output,(bytes,length)=>Extract(bytes,length,json,false,elapsed));
    if(elapsed.ElapsedMilliseconds>=250) return "{\"stop\":\"EXTRACT_BUDGET\"}";
    return "{\"authMode\":\"UNVERIFIED (bootstrap)\",\"loggedIn\":\"UNVERIFIED (bootstrap)\",\"schema\":null,\"shape\":"+shape+"}";
   } catch(TokenHit e) {
    return "{\"stop\":\"TOKEN_LIKE\",\"hitClass\":"+Quote(e.HitClass)+",\"jsonPathOrLineNo\":"+e.Line.ToString(CultureInfo.InvariantCulture)+"}";
   } catch(DecoderFallbackException) { return "{\"stop\":\"NON_UTF8\"}"; }
   catch(InvalidOperationException e) {
    foreach(string code in new[]{"NOT_JSON","TOKEN_LIKE","EXTRACT_BUDGET","CAPTURE_UNAVAILABLE"})
     if(e.Message==code) return "{\"stop\":"+Quote(code)+"}";
    return "{\"stop\":\"EXTRACT_FAULT\"}";
   } catch { return "{\"stop\":\"EXTRACT_FAULT\"}"; }
   finally {
    output.GetType().GetMethod("Abandon").Invoke(output,null);
    errors.GetType().GetMethod("Abandon").Invoke(errors,null);
   }
  }
 }
}
'@
