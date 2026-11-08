"use client";
import { useEffect, useState } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
// Published SAT weekend dates, verified against College Board on 8 Nov 2026.
const dates=["2026-12-05","2027-03-06","2027-05-01","2027-06-05"];
const source="https://satsuite.collegeboard.org/sat/dates-deadlines";
export function SatCountdown(){
 const [now,setNow]=useState<number|null>(null);
 useEffect(()=>{const update=()=>setNow(Date.now());update();const timer=window.setInterval(()=>{if(!document.hidden)update();},1000);document.addEventListener("visibilitychange",update);return()=>{clearInterval(timer);document.removeEventListener("visibilitychange",update);};},[]);
 const day=now===null?null:dates.find(date=>new Date(date+"T00:00:00").getTime()>now);
 if(now===null)return <div className="sat-countdown" aria-label="Loading next SAT date"><CalendarDays size={25}/><span>Finding your next SAT…</span></div>;
 if(!day)return <a className="sat-countdown sat-countdown--link" href={source} target="_blank" rel="noreferrer"><CalendarDays size={25}/><span>Find upcoming SAT dates</span><ArrowUpRight size={15}/></a>;
 const target=new Date(day+"T00:00:00");const seconds=Math.max(0,Math.floor((target.getTime()-now)/1000));
 const days=Math.floor(seconds/86400);const hours=Math.floor(seconds%86400/3600);const minutes=Math.floor(seconds%3600/60);const secs=seconds%60;
 const month=target.toLocaleDateString("en-US",{month:"short"});
 return <aside className="sat-countdown" aria-label={"Next SAT: "+target.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}>
 <div className="sat-calendar" aria-hidden="true"><span>{month}</span><strong>{target.getDate()}</strong></div>
 <div className="sat-countdown__label"><span>NEXT SAT</span><strong>{target.toLocaleDateString("en-US",{month:"long",day:"numeric"})}</strong><a href={source} target="_blank" rel="noreferrer">Official dates <ArrowUpRight size={11}/></a></div>
 <div className="sat-countdown__clock" role="timer" aria-live="off" aria-label={days+" days, "+hours+" hours, "+minutes+" minutes until test day"}>
 <div className="sat-countdown__days"><strong key={days}>{days}</strong><span>days</span></div>
 <div className="sat-countdown__ticks"><div>{[hours,minutes,secs].map((value,i)=><span key={i}><b key={value}>{String(value).padStart(2,"0")}</b>{i<2&&<i>:</i>}</span>)}</div><small>hrs · min · sec</small></div>
 </div><span className="sat-countdown__note">Until test day · local time</span>
 </aside>;
}
