#pragma warning(disable:4505)
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <tlhelp32.h>
#include <bcrypt.h>
#include <stdint.h>
#include <stdio.h>
#include <string>
#include <vector>
#include <algorithm>
#include <set>
#pragma comment(lib,"bcrypt.lib")

// Read-only research helper. Inherits its caller's rights; no elevation, injection,
// privilege changes, writes to the game, hooks or server communication.
static const wchar_t* ExpectedPath=L"C:\\Games\\TERA Asura\\TERA\\Binaries\\TERA.exe";
static const char* ExpectedHash="c778f923f2a495d7b1624c1e1ac944aae29819af7bdc25ad61f9cb8632cec491";
struct Handle { HANDLE h; explicit Handle(HANDLE v):h(v){} ~Handle(){if(h&&h!=INVALID_HANDLE_VALUE)CloseHandle(h);} };
struct Hit { std::string name,encoding,context; DWORD rva,matchRva; };
struct Ref { DWORD rva,target,start,end; };
struct Function { DWORD start,end; };
struct Table { DWORD anchor,slot; std::vector<DWORD> entries; DWORD start; };
struct Binding { DWORD action,modifier,key,alternateModifier,alternateKey; };
struct KeyMap { uintptr_t address; DWORD num,active; std::vector<Binding> bindings; };
static std::string Hex(const unsigned char* b,size_t n){static const char* h="0123456789abcdef";std::string out;out.reserve(n*2);for(size_t i=0;i<n;i++){out+=h[b[i]>>4];out+=h[b[i]&15];}return out;}
static std::string Quote(const std::string& s){std::string out="\"";for(unsigned char c:s){if(c=='"'||c=='\\'){out+='\\';out+=(char)c;}else if(c>=32&&c<127)out+=(char)c;else{char b[8];sprintf_s(b,"\\u%04x",c);out+=b;}}return out+'"';}
static int Error(const char* reason,DWORD code=0){printf("{\"format\":\"controls-image-inspect-v1\",\"ok\":false,\"reason\":%s,\"errorCode\":%lu}\n",Quote(reason).c_str(),code);return 1;}
static std::string HashFile(const wchar_t* path){
 Handle f(CreateFileW(path,GENERIC_READ,FILE_SHARE_READ|FILE_SHARE_DELETE,nullptr,OPEN_EXISTING,FILE_ATTRIBUTE_NORMAL,nullptr));
 if(f.h==INVALID_HANDLE_VALUE)return "";LARGE_INTEGER size={};if(!GetFileSizeEx(f.h,&size)||size.QuadPart<1000000||size.QuadPart>256*1024*1024)return "";
 BCRYPT_ALG_HANDLE alg=nullptr;BCRYPT_HASH_HANDLE hash=nullptr;DWORD len=0,got=0;std::string result;
 if(BCryptOpenAlgorithmProvider(&alg,BCRYPT_SHA256_ALGORITHM,nullptr,0)<0)return "";
 if(BCryptGetProperty(alg,BCRYPT_OBJECT_LENGTH,(PUCHAR)&len,sizeof(len),&got,0)>=0){std::vector<unsigned char> object(len);
  if(BCryptCreateHash(alg,&hash,object.data(),len,nullptr,0,0)>=0){unsigned char bytes[65536];DWORD read=0;bool ok=true;while(ReadFile(f.h,bytes,sizeof(bytes),&read,nullptr)&&read){if(BCryptHashData(hash,bytes,read,0)<0){ok=false;break;}}unsigned char digest[32];if(ok&&BCryptFinishHash(hash,digest,sizeof(digest),0)>=0)result=Hex(digest,sizeof(digest));BCryptDestroyHash(hash);}
 }BCryptCloseAlgorithmProvider(alg,0);return result;
}
static bool ExactRead(HANDLE process,uintptr_t address,void* out,size_t length){SIZE_T read=0;return ReadProcessMemory(process,(void*)address,out,length,&read)&&read==length;}
static bool KeySnapshot(HANDLE process,uintptr_t base,uintptr_t object,KeyMap& result,std::vector<unsigned char>& raw){
 uintptr_t v[2]={};if(!ExactRead(process,object,v,sizeof(v))||v[0]!=base+0x24bdc78||v[1]!=base+0x24bdca8)return false;
 unsigned char header[72]={};if(!ExactRead(process,object+16,header,sizeof(header)))return false;
 uintptr_t data=0,flags=0;int num=0,max=0,bits=0,capacity=0,freeCount=0;
 memcpy(&data,header,8);memcpy(&num,header+8,4);memcpy(&max,header+12,4);memcpy(&flags,header+32,8);memcpy(&bits,header+40,4);memcpy(&capacity,header+44,4);memcpy(&freeCount,header+52,4);
 if(num<1||num>512||max<num||max>2048||bits!=num||capacity<bits||capacity>2048||freeCount<0||freeCount>=num||!data)return false;
 std::vector<unsigned char> records((size_t)num*28),mask(((size_t)bits+31)/32*4);
 if(!ExactRead(process,data,records.data(),records.size()))return false;
 if(flags){if(!ExactRead(process,flags,mask.data(),mask.size()))return false;}else{if(mask.size()>16)return false;memcpy(mask.data(),header+16,mask.size());}
 std::set<DWORD> actions;std::vector<Binding> bindings;
 for(int i=0;i<num;i++){DWORD word=0;memcpy(&word,mask.data()+(i/32)*4,4);if(!(word&(1u<<(i%32))))continue;Binding b={};memcpy(&b,records.data()+(size_t)i*28,20);
  if(!b.action||b.action>10000||b.modifier>65535||b.alternateModifier>65535||b.key>65535||b.alternateKey>65535||!actions.insert(b.action).second)return false;bindings.push_back(b);
 }if(bindings.size()!=(size_t)(num-freeCount))return false;
 raw.assign(header,header+72);raw.insert(raw.end(),mask.begin(),mask.end());raw.insert(raw.end(),records.begin(),records.end());result={object,(DWORD)num,(DWORD)bindings.size(),bindings};return true;
}
static bool StableKeyMap(HANDLE process,uintptr_t base,uintptr_t object,KeyMap& result){
 KeyMap first,second;std::vector<unsigned char>a,b;if(!KeySnapshot(process,base,object,first,a)||!KeySnapshot(process,base,object,second,b)||a!=b)return false;result=second;return true;
}
static bool ImageRange(HANDLE process,uintptr_t base,DWORD imageSize,DWORD rva,DWORD length,std::vector<unsigned char>& out){
 if(!length||length>32*1024*1024||rva>=imageSize||length>imageSize-rva)return false;
 out.assign(length,0);size_t offset=0,total=0;
 while(offset<length){MEMORY_BASIC_INFORMATION m={};uintptr_t at=base+rva+offset;if(!VirtualQueryEx(process,(void*)at,&m,sizeof(m)))break;
  uintptr_t end=(uintptr_t)m.BaseAddress+m.RegionSize;if(end<=at)break;size_t count=std::min((size_t)(end-at),(size_t)length-offset);
  if(m.State==MEM_COMMIT&&m.Type==MEM_IMAGE&&!(m.Protect&(PAGE_GUARD|PAGE_NOACCESS))){SIZE_T read=0;if(ReadProcessMemory(process,(void*)at,out.data()+offset,count,&read))total+=read;}
  offset+=count;
 }return total>0;
}
static std::vector<Hit> FindNames(const std::vector<unsigned char>& bytes,DWORD rva){
 const char* names[]={"EpPerk","EPPerk","EpWindow","EpData","EPData","EP_","EPCore","C_LEARN_EP_PERK","ToGame_EpWindow_Enter","ToGame_EpWindow_Init","PerkData","EpCondition"};std::vector<Hit> hits;
 for(const char* name:names)for(int wide=0;wide<2;wide++){std::vector<unsigned char> needle;for(const char* p=name;*p;p++){needle.push_back(*p);if(wide)needle.push_back(0);}auto begin=bytes.begin();int count=0;
  while(begin!=bytes.end()&&count<16){auto it=std::search(begin,bytes.end(),needle.begin(),needle.end());if(it==bytes.end())break;size_t match=it-bytes.begin(),first=match,step=wide?2:1;
   for(int back=0;back<160&&first>=step;back++){unsigned value=bytes[first-step];if(wide)value|=(unsigned)bytes[first-step+1]<<8;if(value<32||value>126)break;first-=step;}
   std::string context;for(size_t pos=first;pos+step<=bytes.size()&&context.size()<240;pos+=step){unsigned value=bytes[pos];if(wide)value|=(unsigned)bytes[pos+1]<<8;if(value<32||value>126)break;context+=(char)value;}
   hits.push_back({name,wide?"utf16le":"ascii",context,rva+(DWORD)first,rva+(DWORD)match});begin=it+1;count++;}
 }return hits;
}
static std::vector<Ref> FindRefs(const std::vector<unsigned char>& bytes,DWORD rva,const std::vector<Hit>& hits,const std::vector<Function>& functions){
 std::vector<Ref> refs;
 for(size_t i=0;i+7<=bytes.size()&&refs.size()<240;i++){
  if((bytes[i]!=0x48&&bytes[i]!=0x4c)||(bytes[i+1]!=0x8d&&bytes[i+1]!=0x8b)||(bytes[i+2]&0xc7)!=0x05)continue;
  int32_t disp=0;memcpy(&disp,bytes.data()+i+3,4);int64_t target=(int64_t)rva+i+7+disp;if(target<0||target>0xffffffff)continue;
  if(std::none_of(hits.begin(),hits.end(),[&](const Hit& h){return h.rva==(DWORD)target;}))continue;
  DWORD at=rva+(DWORD)i;Function fn={at>64?at-64:at,at+256};auto it=std::upper_bound(functions.begin(),functions.end(),at,[](DWORD value,const Function& f){return value<f.start;});
  if(it!=functions.begin()){--it;if(it->start<=at&&at<it->end)fn=*it;}
  if(fn.end-fn.start>12000)fn={at>64?at-64:at,at+256};refs.push_back({at,(DWORD)target,fn.start,fn.end});
 }return refs;
}
static std::vector<Table> FindTables(const std::vector<unsigned char>& bytes,DWORD rva,uintptr_t base,DWORD imageSize,const std::vector<DWORD>& anchors){
 std::vector<Table> tables;
 for(size_t i=0;i+8<=bytes.size()&&tables.size()<24;i+=8){uintptr_t value=0;memcpy(&value,bytes.data()+i,8);if(value<base||value-base>=imageSize)continue;DWORD target=(DWORD)(value-base);
  if(std::find(anchors.begin(),anchors.end(),target)==anchors.end())continue;
  size_t first=i>=12*8?i-12*8:0,stop=std::min(i+24*8,bytes.size());Table table={target,rva+(DWORD)i,{},rva+(DWORD)first};
  for(size_t p=first;p+8<=stop;p+=8){uintptr_t v=0;memcpy(&v,bytes.data()+p,8);table.entries.push_back(v>=base&&v-base<imageSize?(DWORD)(v-base):0);}
  tables.push_back(table);
 }return tables;
}
static std::vector<Ref> FindCalls(const std::vector<unsigned char>& bytes,DWORD rva,const std::vector<Ref>& targets,const std::vector<Function>& functions){
 std::vector<Ref> out;for(size_t i=0;i+5<=bytes.size()&&out.size()<32;i++){if(bytes[i]!=0xe8&&bytes[i]!=0xe9)continue;int32_t disp=0;memcpy(&disp,bytes.data()+i+1,4);int64_t dest=(int64_t)rva+i+5+disp;
  if(dest<0||dest>0xffffffff||std::none_of(targets.begin(),targets.end(),[&](const Ref& r){return r.start==(DWORD)dest;}))continue;
  DWORD at=rva+(DWORD)i;auto it=std::upper_bound(functions.begin(),functions.end(),at,[](DWORD n,const Function& f){return n<f.start;});
  if(it==functions.begin())continue;--it;if(at>=it->end)continue;out.push_back({at,(DWORD)dest,it->start,std::min(it->end,it->start+12000)});
 }return out;
}
static int SelfTest(){
 std::vector<unsigned char> text(200,0);std::string name="EpData";memcpy(text.data()+20,name.data(),name.size());auto hits=FindNames(text,0x1000);if(hits.size()!=1||hits[0].rva!=0x1014)return Error("self-test-name");
 std::vector<unsigned char> code(40,0);code[5]=0x48;code[6]=0x8d;code[7]=0x0d;int32_t disp=0x1014-(0x2000+5+7);memcpy(code.data()+8,&disp,4);
 std::vector<Function> functions={{0x2000,0x2028}};auto refs=FindRefs(code,0x2000,hits,functions);if(refs.size()!=1||refs[0].start!=0x2000||refs[0].target!=0x1014)return Error("self-test-ref");
 code[7]=0x09;if(!FindRefs(code,0x2000,hits,functions).empty())return Error("self-test-modrm");
 if(Quote("a\\\"b")!="\"a\\\\\\\"b\"")return Error("self-test-quote");
 std::vector<unsigned char> data(512,0);uintptr_t value=0x140002000;memcpy(data.data()+120,&value,8);auto tables=FindTables(data,0x4000,0x140000000,0x10000,{0x2000});if(tables.size()!=1||tables[0].slot!=0x4078||tables[0].entries[12]!=0x2000)return Error("self-test-table");
 std::vector<unsigned char> callCode(40,0);callCode[8]=0xe8;int32_t cd=0x3000-(0x2000+8+5);memcpy(callCode.data()+9,&cd,4);auto calls=FindCalls(callCode,0x2000,{{0,0,0x3000,0x3010}},functions);if(calls.size()!=1||calls[0].rva!=0x2008)return Error("self-test-call");
 unsigned char object[92]={},header[72]={};uintptr_t v0=0x140000000+0x24bdc78,v1=0x140000000+0x24bdca8;memcpy(object,&v0,8);memcpy(object+8,&v1,8);
 unsigned char rec[28]={};Binding expected={73,0,187,0,0};memcpy(rec,&expected,20);uintptr_t dp=(uintptr_t)rec;int one=1;memcpy(header,&dp,8);memcpy(header+8,&one,4);memcpy(header+12,&one,4);memcpy(header+16,&one,4);memcpy(header+40,&one,4);memcpy(header+44,&one,4);memcpy(object+16,header,72);KeyMap map;
 if(!StableKeyMap(GetCurrentProcess(),0x140000000,(uintptr_t)object,map)||map.bindings.size()!=1||map.bindings[0].key!=187)return Error("self-test-key-map");object[0]=0;if(StableKeyMap(GetCurrentProcess(),0x140000000,(uintptr_t)object,map))return Error("self-test-key-vtable");
 printf("{\"ok\":true,\"selfTest\":true,\"checks\":8}\n");return 0;
}
int wmain(int argc,wchar_t** argv){
 if(argc==2&&!wcscmp(argv[1],L"--self-test"))return SelfTest();
 if(argc!=3||wcscmp(argv[1],L"--pid"))return Error("usage");
 wchar_t* end=nullptr;unsigned long pid=wcstoul(argv[2],&end,10);if(!pid||pid==4||*end||pid>0xffffffff)return Error("invalid-pid");
 Handle process(OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ,FALSE,pid));if(!process.h)return Error("read-access-denied",GetLastError());
 wchar_t exe[32768];DWORD length=32768;if(!QueryFullProcessImageNameW(process.h,0,exe,&length))return Error("path-unavailable",GetLastError());
 const auto actualHash=HashFile(exe); const bool knownAsura=!_wcsicmp(exe,ExpectedPath)&&actualHash==ExpectedHash; const bool knownAstrix=!_wcsicmp(exe,L"H:\\Games\\Tera Astrix\\Binaries\\TERA.exe")&&actualHash=="7c7165109b5893b0f5f0130a70c14c2f8ea3d3ef5cea4185f361e7ca15e1ba8d"; if(!knownAsura&&!knownAstrix)return Error("unsupported-executable");
 Handle snapshot(CreateToolhelp32Snapshot(TH32CS_SNAPMODULE|TH32CS_SNAPMODULE32,pid));if(snapshot.h==INVALID_HANDLE_VALUE)return Error("module-unavailable",GetLastError());
 MODULEENTRY32W module={};module.dwSize=sizeof(module);if(!Module32FirstW(snapshot.h,&module)||_wcsicmp(module.szExePath,exe))return Error("module-path-mismatch");
 uintptr_t base=(uintptr_t)module.modBaseAddr;IMAGE_DOS_HEADER dos={};IMAGE_NT_HEADERS64 nt={};
 if(!ExactRead(process.h,base,&dos,sizeof(dos))||dos.e_magic!=IMAGE_DOS_SIGNATURE||dos.e_lfanew<64||dos.e_lfanew>4096||
    !ExactRead(process.h,base+dos.e_lfanew,&nt,sizeof(nt))||nt.Signature!=IMAGE_NT_SIGNATURE||nt.FileHeader.Machine!=IMAGE_FILE_MACHINE_AMD64||nt.OptionalHeader.SizeOfImage!=module.modBaseSize||
    nt.OptionalHeader.SizeOfImage<32*1024*1024||nt.OptionalHeader.SizeOfImage>96*1024*1024||nt.FileHeader.NumberOfSections>32)return Error("image-header-mismatch");
 std::vector<IMAGE_SECTION_HEADER> sections(nt.FileHeader.NumberOfSections);
 if(!ExactRead(process.h,base+dos.e_lfanew+24+nt.FileHeader.SizeOfOptionalHeader,sections.data(),sections.size()*sizeof(IMAGE_SECTION_HEADER)))return Error("sections-unavailable");
 std::vector<Hit> hits;std::vector<unsigned char> code;DWORD codeRva=0;
 for(const auto& section:sections){DWORD rva=section.VirtualAddress,size=section.Misc.VirtualSize;if(rva>=0x3203000||!size||rva>=nt.OptionalHeader.SizeOfImage||size>nt.OptionalHeader.SizeOfImage-rva)continue;
  if(section.Characteristics&IMAGE_SCN_MEM_WRITE)continue;
  if(!(section.Characteristics&IMAGE_SCN_MEM_READ))continue;std::vector<unsigned char> bytes;
  if(!ImageRange(process.h,base,module.modBaseSize,rva,size,bytes))continue;
  auto found=FindNames(bytes,rva);hits.insert(hits.end(),found.begin(),found.end());
  if((section.Characteristics&IMAGE_SCN_MEM_EXECUTE)&&rva==0x1000){code.swap(bytes);codeRva=rva;}
 }
 std::vector<Function> functions;const auto& ex=nt.OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXCEPTION];
 if(ex.VirtualAddress&&ex.Size&&ex.Size<3*1024*1024){std::vector<unsigned char> bytes;if(ImageRange(process.h,base,module.modBaseSize,ex.VirtualAddress,ex.Size,bytes)){
   for(size_t i=0;i+12<=bytes.size();i+=12){DWORD start=0,stop=0;memcpy(&start,bytes.data()+i,4);memcpy(&stop,bytes.data()+i+4,4);if(start>=codeRva&&stop>start&&stop<=codeRva+code.size())functions.push_back({start,stop});}
  }}std::sort(functions.begin(),functions.end(),[](const Function& a,const Function& b){return a.start<b.start;});
 auto refs=FindRefs(code,codeRva,hits,functions);

 // EP callbacks and confirmation callee identified in captured code. Read-only bounded call graph.
 std::vector<DWORD> graph;for(size_t i=0;i+4<=code.size()&&graph.size()<8;i++){DWORD header=0;memcpy(&header,code.data()+i,4);if(header!=0x51680010&&header!=0x51680008&&header!=0x5168000c)continue;DWORD at=codeRva+(DWORD)i;auto it=std::upper_bound(functions.begin(),functions.end(),at,[](DWORD v,const Function& f){return v<f.start;});if(it!=functions.begin()){--it;if(at<it->end)graph.push_back(it->start);}}std::set<DWORD> seen;for(int depth=0;depth<3;depth++){std::vector<DWORD> next;for(DWORD at:graph){if(seen.size()>=30||!seen.insert(at).second)continue;auto it=std::lower_bound(functions.begin(),functions.end(),at,[](const Function& f,DWORD v){return f.start<v;});if(it==functions.end()||it->start!=at||it->end-it->start>24000||it->start<codeRva||it->end>codeRva+code.size())continue;refs.push_back({at,at,it->start,it->end});for(DWORD i=it->start;i+5<it->end;i++){if(code[i-codeRva]!=0xe8)continue;int32_t delta=0;memcpy(&delta,code.data()+i-codeRva+1,4);int64_t target=(int64_t)i+5+delta;if(target<0x900000||target>=0x1d00000)continue;auto callee=std::lower_bound(functions.begin(),functions.end(),(DWORD)target,[](const Function& f,DWORD v){return f.start<v;});if(callee!=functions.end()&&callee->start==(DWORD)target&&!seen.count((DWORD)target))next.push_back((DWORD)target);}}graph.swap(next);}
 for(auto&r:refs)if(r.end-r.start<128&&r.start+512<=codeRva+code.size())r.end=r.start+512;

 printf("{\"format\":\"controls-ep-native-v1\",\"sha256\":\"%s\",\"ok\":true,\"pid\":%lu,\"imageBase\":\"%llx\",\"hits\":[",actualHash.c_str(),pid,(unsigned long long)base);
 for(size_t i=0;i<hits.size();i++){if(i)printf(",");printf("{\"name\":%s,\"encoding\":%s,\"context\":%s,\"rva\":%lu}",Quote(hits[i].name).c_str(),Quote(hits[i].encoding).c_str(),Quote(hits[i].context).c_str(),hits[i].rva);}printf("],\"refs\":[");
 for(size_t i=0;i<refs.size();i++){if(i)printf(",");auto&r=refs[i];printf("{\"rva\":%lu,\"target\":%lu,\"start\":%lu,\"end\":%lu}",r.rva,r.target,r.start,r.end);}printf("],\"functions\":[");
 std::set<DWORD> printed;size_t total=0;bool first=true;for(const auto&r:refs){if(r.end<=r.start||r.start<codeRva||r.end>codeRva+code.size()||r.end-r.start>24000||printed.size()>=80||total+r.end-r.start>500000||!printed.insert(r.start).second)continue;if(!first)printf(",");first=false;printf("{\"start\":%lu,\"end\":%lu,\"hex\":%s}",r.start,r.end,Quote(Hex(code.data()+r.start-codeRva,r.end-r.start)).c_str());total+=r.end-r.start;}printf("]}\n");return 0;
}
