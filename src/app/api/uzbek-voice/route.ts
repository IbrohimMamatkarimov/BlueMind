export async function POST(req: Request) {
  const language = req.headers.get("x-voice-language") === "en" ? "en" : "uz";
  const key = process.env.VOICELAB_API_KEY;
  if (!key) return Response.json({error:"Ovoz xizmati hali ulanmagan."},{status:503});
  if (req.headers.get("origin") !== new URL(req.url).origin) return new Response(null,{status:403});
  const size = Number(req.headers.get("content-length"));
  if (!size || size > 2000000) return new Response(null,{status:413});
  const stt = req.headers.get("content-type")?.startsWith("multipart/form-data");
  try {
    let body: FormData | string;
    const headers = new Headers({Authorization:"Bearer "+key});
    if (stt) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File) || !file.type.startsWith("audio/")) return new Response(null,{status:400});
      const form = new FormData();
      form.set("audio",file); form.set("language",language); form.set("include_speakers","false");
      body = form;
    } else {
      const {text} = await req.json();
      if (typeof text !== "string" || !text.trim() || text.length > 5000) return new Response(null,{status:400});
      headers.set("Content-Type","application/json");
      const catalog = await fetch("https://api.voicelab.uz/v1/voices?language="+language+"&model_id=lison",{headers,signal:AbortSignal.timeout(8000)});
      const voice = (await catalog.json()).data?.[0]?.id;
      if (!voice) throw Error();
      body = JSON.stringify({text,language,voice_id:voice});
    }
    headers.set("Idempotency-Key",crypto.randomUUID());
    const response = await fetch("https://api.voicelab.uz/v1/"+(stt?"stt":"tts"),{method:"POST",headers,body,signal:AbortSignal.timeout(45000)});
    if (!response.ok) throw Error();
    if (!stt && response.headers.get("content-type")?.startsWith("audio/")) return new Response(response.body,{headers:{"Content-Type":response.headers.get("content-type")!}});
    const job = await response.json();
    if (!job.id) throw Error();
    const path = stt ? "stt/transcriptions/" : "tts/generations/";
    const signal = AbortSignal.timeout(40000);
    while (!signal.aborted) {
      await new Promise(resolve=>setTimeout(resolve,1200));
      const poll = await fetch("https://api.voicelab.uz/v1/"+path+encodeURIComponent(job.id),{headers,signal,cache:"no-store"});
      if (!poll.ok) throw Error();
      const result = await poll.json();
      if (result.status==="failed") throw Error();
      if (result.status==="completed") {
        if(stt && typeof result.transcript==="string") return Response.json({text:result.transcript});
        if(!stt && typeof result.audio_url==="string") return Response.json({url:new URL(result.audio_url,"https://api.voicelab.uz").href});
        throw Error();
      }
    }
    throw Error();
  } catch { return Response.json({error:"Ovozga ishlov berilmadi. Qayta urinib ko‘ring."},{status:502}); }
}