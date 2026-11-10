"use client";
import {useRef,useState,useEffect} from "react";
export function UzbekVoice({answer,onText}:{answer:string;onText:(s:string)=>void}) {
  const recording=useRef<MediaRecorder|null>(null);
  const mounted=useRef(false);
  const [state,setState]=useState("idle"),[error,setError]=useState(""),[url,setUrl]=useState("");
  useEffect(()=>{mounted.current=true;return ()=>{mounted.current=false;recording.current?.stream.getTracks().forEach(t=>t.stop());};},[]);
  useEffect(()=>{setUrl("");},[answer]);
  useEffect(()=>()=>{if(url.startsWith("blob:")) URL.revokeObjectURL(url);},[url]);
  async function send(body:FormData|string) {
    setState("busy");
    try {
      const r=await fetch("/api/uzbek-voice",{method:"POST",headers:typeof body==="string"?{"Content-Type":"application/json"}:undefined,body});
      if(!r.ok) throw Error((await r.json()).error);
      if(r.headers.get("content-type")?.startsWith("audio/")) setUrl(URL.createObjectURL(await r.blob()));
      else {const data=await r.json();if(data.text) onText(data.text);else if(data.url)setUrl(data.url);else throw Error();}
    } catch(e){setError(e instanceof Error && e.message?e.message:"Qayta urinib ko‘ring.");}
    finally{setState("idle");}
  }
  async function mic(){
    setError("");
    if(recording.current?.state==="recording"){recording.current.stop();return;}
    setState("busy");
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      if(!mounted.current){stream.getTracks().forEach(t=>t.stop());return;}
      let rec:MediaRecorder;
      try{rec=new MediaRecorder(stream);}catch(e){stream.getTracks().forEach(t=>t.stop());throw e;}
      recording.current=rec;
      const chunks:Blob[]=[];
      rec.ondataavailable=e=>chunks.push(e.data);
      rec.onstop=()=>{stream.getTracks().forEach(t=>t.stop());if(!mounted.current)return;
        const form=new FormData();form.set("file",new Blob(chunks,{type:rec.mimeType}),rec.mimeType.includes("mp4")?"voice.mp4":"voice.webm");void send(form);};
      rec.start();setState("recording");window.setTimeout(()=>{if(rec.state==="recording")rec.stop();},30000);
    }catch{setState("idle");setError("Mikrofonga ruxsat bering yoki savolni yozing.");}
  }
  return <aside className="p-2 text-sm"><button type="button" disabled={state==="busy"} onClick={mic}>{state==="recording"?"■ To‘xtatish":"🎙 O‘zbekcha gapirish"}</button>{" "}{answer&&<button type="button" disabled={state!=="idle"} onClick={()=>{setError("");void send(JSON.stringify({text:answer.slice(0,3000)}));}}>Javobni tinglash</button>}{state==="busy"&&<small role="status"> Tayyorlanmoqda…</small>}{url&&<audio controls autoPlay src={url}/>}{error&&<p role="alert">{error}</p>}</aside>;
}