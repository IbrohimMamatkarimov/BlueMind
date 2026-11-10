"use client";
import {useEffect,useRef,useState} from "react";
import {ArrowUpRight,GraduationCap,Sparkles,Users,X} from "lucide-react";

export function CreatorTeam({brand,accent}:{brand:string;accent:string}){
 const dialog=useRef<HTMLDialogElement>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 const [english,setEnglish]=useState(false);
 useEffect(()=>{
  const read=()=>setEnglish(document.documentElement.lang.startsWith("en"));
  read();const observer=new MutationObserver(read);
  observer.observe(document.documentElement,{attributes:true,attributeFilter:["lang"]});
  return ()=>observer.disconnect();
 },[]);
 const close=()=>{dialog.current?.close();trigger.current?.focus();};
 return <>
  <div className="creator-team-entry" style={{"--creator-accent":accent} as React.CSSProperties}>
   <button ref={trigger} type="button" onClick={()=>dialog.current?.showModal()} aria-haspopup="dialog"><Users size={15}/>{english?"Meet the creator":"Jamoa"}<ArrowUpRight size={14}/></button>
  </div>
  <dialog ref={dialog} className="creator-team-dialog" style={{"--creator-accent":accent} as React.CSSProperties} aria-labelledby="creator-team-name" onClick={event=>{if(event.target===event.currentTarget){const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)close();}}} onClose={()=>trigger.current?.focus()}>
   <div className="creator-team-cover"><span className="creator-team-orbit"/><span className="creator-team-orbit second"/><span className="creator-team-wordmark">{brand}</span><button type="button" onClick={close} aria-label={english?"Close":"Yopish"} className="creator-team-close"><X size={20}/></button><div className="creator-team-monogram" aria-hidden="true">IM<span>✦</span></div></div>
   <div className="creator-team-content">
    <p className="creator-team-eyebrow">{english?"THE PERSON BEHIND "+brand.toUpperCase():brand.toUpperCase()+" YARATUVCHISI"}</p>
    <h2 id="creator-team-name">Ibrohim<br/>Mamatkarimov<span>.</span></h2>
    <p className="creator-team-intro">{english?"18-year-old CAU student pursuing a career in AI engineering.":"18 yosh. CAU talabasi. AI muhandisligi yo‘nalishida bilim va ko‘nikmalarini rivojlantirmoqda."}</p>
    <div className="creator-team-details"><span><GraduationCap size={18}/>{english?"Studies at CAU":"CAU talabasi"}</span><span><Sparkles size={18}/>{english?"Aspiring AI engineer":"Bo‘lajak AI muhandisi"}</span></div>
    <a className="creator-team-contact" href="https://t.me/ibrohimmamatkarimov" target="_blank" rel="noopener noreferrer"><span><small>{english?"LET’S CONNECT":"BOG‘LANISH UCHUN"}</small><strong>@ibrohimmamatkarimov</strong></span><ArrowUpRight size={22}/></a>
   </div>
  </dialog>
  <style>{`
.creator-team-entry{display:flex;justify-content:flex-end;position:relative;padding:6px 20px;background:var(--surface,#fff);border-bottom:1px solid #8c92931c}
.creator-team-entry button{display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border:1px solid #8c929333;border-radius:100px;font:600 12px/1.3 inherit;color:var(--creator-accent);background:transparent;cursor:pointer;transition:background .2s,transform .2s}
.creator-team-entry button:hover{background:color-mix(in srgb,var(--creator-accent) 8%,transparent);transform:translateY(-1px)}
.creator-team-dialog{padding:0;border:1px solid #ffffff44;border-radius:28px;width:min(440px,calc(100vw - 28px));max-height:calc(100dvh - 28px);overflow-y:auto;background:#fff;color:#202b31;margin:auto;box-shadow:0 30px 100px #102a3255;font-family:inherit}
.creator-team-dialog::backdrop{background:#0b192b99;backdrop-filter:blur(7px)}
.creator-team-dialog[open]{animation:creator-team-in .28s cubic-bezier(.2,.8,.2,1) both}
.creator-team-cover{position:relative;isolation:isolate;overflow:hidden;height:160px;background:linear-gradient(125deg,#102b31,var(--creator-accent));padding:22px 26px}
.creator-team-wordmark{position:relative;color:#fff;font-size:13px;font-weight:700;letter-spacing:.02em}
.creator-team-close{position:absolute;right:16px;top:16px;display:grid;place-items:center;width:36px;height:36px;border:1px solid #ffffff38;border-radius:50%;color:#fff;background:#ffffff12;cursor:pointer;z-index:2}
.creator-team-orbit{position:absolute;width:260px;height:260px;right:-25px;top:-160px;border:1px solid #ffffff28;border-radius:50%;animation:creator-team-drift 12s ease-in-out infinite alternate}
.creator-team-orbit.second{width:340px;height:340px;top:-125px;right:-145px;animation-delay:-6s}
.creator-team-monogram{position:absolute;bottom:20px;left:26px;font-size:60px;font-weight:750;line-height:1;letter-spacing:-6px;color:#fff}
.creator-team-monogram span{font-size:25px;letter-spacing:0;display:inline-block;margin-left:14px;color:#e9d6a0;animation:creator-team-star 8s ease-in-out infinite}
.creator-team-content{padding:26px}
.creator-team-eyebrow{font-size:10px;font-weight:700;letter-spacing:.14em;color:var(--creator-accent);margin:0 0 12px}
.creator-team-content h2{font-size:clamp(30px,7vw,38px);line-height:1.08;font-weight:750;letter-spacing:-.045em;margin:0;color:#202b31}
.creator-team-content h2 span{color:var(--creator-accent)}
.creator-team-intro{font-size:14px;line-height:1.75;color:#59666c;margin:18px 0}
.creator-team-details{display:flex;flex-wrap:wrap;gap:10px 18px;border-top:1px solid #e8eded;padding:16px 0 20px}
.creator-team-details>span{display:flex;align-items:center;gap:7px;font-size:12px;color:#42545c}
.creator-team-details svg{color:var(--creator-accent)}
.creator-team-contact{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:16px;border-radius:16px;background:var(--creator-accent);color:#fff;text-decoration:none;transition:transform .2s,box-shadow .2s}
.creator-team-contact:hover{transform:translateY(-2px);box-shadow:0 8px 20px #142c3226}
.creator-team-contact small{display:block;font-size:9px;letter-spacing:.13em;opacity:.75;margin-bottom:5px}
.creator-team-contact strong{font-size:14px;overflow-wrap:anywhere}
.creator-team-entry button:focus-visible,.creator-team-dialog button:focus-visible,.creator-team-dialog a:focus-visible{outline:3px solid #83c5d8;outline-offset:3px}
@keyframes creator-team-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
@keyframes creator-team-drift{to{transform:translate(-20px,20px)}}
@keyframes creator-team-star{50%{transform:rotate(25deg)}}
@media(prefers-reduced-motion:reduce){.creator-team-dialog[open],.creator-team-orbit,.creator-team-monogram span{animation:none}.creator-team-entry button,.creator-team-contact{transition:none}}
`}</style>
 </>;
}
