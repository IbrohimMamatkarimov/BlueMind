export const maxDuration = 120;
export async function POST(req: Request) {
 const language=req.headers.get("x-voice-language")==="en"?"en":"uz";
 const error=(message:string,status=502)=>Response.json({error:message},{status});
 if(![new URL(req.url).origin,"https://bluemind.uz","https://www.bluemind.uz"].includes(req.headers.get("origin")||""))return error("Forbidden",403);
 const key=process.env.MOHIRAI_API_KEY;
 if(!key)return error("Voice service is being configured.",503);
 const stt=req.headers.get("content-type")?.startsWith("multipart/form-data");
 if(language==="en")return error("Use your device English voice.",422);
 try{
  const headers=new Headers({Authorization:key});
  let body:FormData|string;
  if(stt){
   const incoming=await req.formData(),file=incoming.get("file");
   if(!(file instanceof File)||!file.type.startsWith("audio/")||file.size>2000000)return error("Yozuv juda katta yoki noto‘g‘ri.",400);
   const form=new FormData();
   form.set("file",file);form.set("language","uz");form.set("model","general");
   form.set("return_offsets","false");form.set("run_diarization","false");form.set("blocking","true");body=form;
  }else{
   const {text}=await req.json();
   if(typeof text!=="string"||!text.trim()||text.length>5000)return error("Matn uzunligini tekshiring.",400);
   headers.set("Content-Type","application/json");
   body=JSON.stringify({text,model:"lola",blocking:"true"});
  }
  const signal=AbortSignal.timeout(95000);
  let response=await fetch("https://uzbekvoice.ai/api/v1/"+(stt?"stt":"tts"),{method:"POST",headers,body,signal});
  if(!response.ok)return error(response.status===402?"Ovoz xizmati balansi yetarli emas.":"Ovoz xizmati so‘rovni bajarmadi. Qayta urinib ko‘ring.");
  let data=await response.json();
  while(!data.result && data.id && !["FAILURE","FAILED"].includes(String(data.status??data.state).toUpperCase())){
   await new Promise(resolve=>setTimeout(resolve,1500));
   response=await fetch("https://uzbekvoice.ai/api/v1/tasks?id="+encodeURIComponent(data.id),{headers:{Authorization:key},signal,cache:"no-store"});
   if(!response.ok)throw Error();
   data=await response.json();
  }
  if(stt&&typeof data.result?.text==="string")return Response.json({text:data.result.text});
  if(!stt&&typeof data.result?.url==="string"&&data.result.url.startsWith("https://"))return Response.json({url:data.result.url});
  throw Error();
 }catch{return error("Ovozga ishlov berilmadi. Qayta urinib ko‘ring.");}
}