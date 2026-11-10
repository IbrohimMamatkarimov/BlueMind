export async function POST(req: Request) {
  const key = process.env.UZBEKVOICE_API_KEY;
  if (!key) return Response.json({error:"Ovoz xizmati hali ulanmagan."},{status:503});
  if (req.headers.get("origin") !== new URL(req.url).origin) return new Response(null,{status:403});
  const size = Number(req.headers.get("content-length"));
  if (!size || size > 2000000) return new Response(null,{status:413});
  const stt = req.headers.get("content-type")?.startsWith("multipart/form-data");
  try {
    let body: FormData | string;
    const headers = new Headers({Authorization:key});
    if (stt) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File) || !file.type.startsWith("audio/")) return new Response(null,{status:400});
      const form = new FormData();
      form.set("file",file); form.set("language","uz"); form.set("model","general");
      form.set("blocking","true"); form.set("return_offsets","false"); form.set("run_diarization","false");
      body = form;
    } else {
      const {text} = await req.json();
      if (typeof text !== "string" || !text.trim() || text.length > 3000) return new Response(null,{status:400});
      headers.set("Content-Type","application/json");
      body = JSON.stringify({text,model:"sevinch",blocking:"true"});
    }
    const response = await fetch("https://uzbekvoice.ai/api/v1/"+(stt?"stt":"tts"),{method:"POST",headers,body,signal:AbortSignal.timeout(45000)});
    if (!response.ok) throw Error();
    if (!stt && response.headers.get("content-type")?.startsWith("audio/")) return new Response(response.body,{headers:{"Content-Type":response.headers.get("content-type")!}});
    const {result} = await response.json();
    if (stt && typeof result?.text === "string") return Response.json({text:result.text});
    const url = result?.url ?? result?.audio_url ?? result;
    if (!stt && typeof url === "string" && url.startsWith("https://")) return Response.json({url});
    throw Error();
  } catch { return Response.json({error:"Ovozga ishlov berilmadi. Qayta urinib ko‘ring."},{status:502}); }
}