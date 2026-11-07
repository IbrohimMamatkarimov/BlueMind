"use client";
import { useId } from "react";
export function RobotMascot({mood="idle",className=""}:{mood?:"idle"|"thinking"|"happy"|"error";tone?:"blue"|"forest";className?:string}){
 const id=useId().replace(/:/g,"");
 return <span className={"robot-mascot brand-mascot brain-mascot "+className} data-mood={mood} aria-hidden="true"><svg viewBox="0 0 160 174" fill="none">
 <defs><linearGradient id={id+"brain"} x1="27" y1="30" x2="132" y2="112" gradientUnits="userSpaceOnUse"><stop stopColor="#a7c6ff"/><stop offset=".5" stopColor="#78a5ee"/><stop offset="1" stopColor="#416fc0"/></linearGradient><linearGradient id={id+"base"} x1="43" y1="112" x2="117" y2="155" gradientUnits="userSpaceOnUse"><stop stopColor="#e8f3ff"/><stop offset="1" stopColor="#9ab6d8"/></linearGradient></defs>
 <ellipse cx="80" cy="165" rx="36" ry="5" fill="#204c81" opacity=".12"/>
 <g className="brain-float"><path d="M61 148v11M100 148v11" stroke="#8da8cd" strokeWidth="9" strokeLinecap="round"/><path d="M52 160h19M91 160h19" stroke="#dfeeff" strokeWidth="9" strokeLinecap="round"/>
 <path d="M48 122 31 133M112 122l17-12" stroke="#a5c0e0" strokeWidth="9" strokeLinecap="round"/><circle cx="28" cy="135" r="7" fill="#e5f2ff" stroke="#9ebcde"/><g className="brain-wave"><path d="m126 113 9-14" stroke="#e5f2ff" strokeWidth="10" strokeLinecap="round"/><path d="m132 98-1-5m7 8 5-3" stroke="#e5f2ff" strokeWidth="4" strokeLinecap="round"/></g>
 <rect x="47" y="111" width="66" height="39" rx="17" fill={"url(#"+id+"base)"} stroke="#93b1d9"/><path d="M69 127h22M80 119v17" stroke="#5f8ecc" strokeWidth="3" strokeLinecap="round"/>
 <g className="brain-head"><path d="M80 28c-11-14-31-8-34 6-16-2-26 12-22 26-13 9-11 28 1 35-3 18 15 29 30 22 8 12 21 9 25 1 7 10 21 10 28-1 17 7 34-6 30-22 14-9 12-28 0-35 3-15-8-28-23-26-5-15-24-20-35-6Z" fill={"url(#"+id+"brain)"} stroke="#4672b6" strokeWidth="2"/>
 <path d="M80 29v19M80 104v16M47 35c-5 9-2 18 6 22M25 61c12-4 20 0 22 9M25 95c10 1 14-2 19-8M115 35c4 10 1 19-6 23M138 62c-10-4-19 1-21 9M137 95c-8 1-14-2-18-8M54 109c-2-8 0-14 6-18M106 109c1-7 0-14-6-18" stroke="#3763a3" strokeOpacity=".65" strokeWidth="3" strokeLinecap="round"/>
 <path d="M53 40c2-6 9-8 14-4M37 54c-3-5-1-10 3-12M104 40c-1-5-8-8-13-5" stroke="#dbeaff" strokeWidth="3" strokeLinecap="round" opacity=".7"/>
 <rect x="46" y="65" width="68" height="34" rx="15" fill="#173b68" stroke="#3868a8"/>
 <g className="brand-eyes"><rect x="58" y="74" width="8" height="12" rx="4" fill="#b4f2e8"/><rect x="94" y="74" width="8" height="12" rx="4" fill="#b4f2e8"/></g>
 <path d={mood==="error"?"M74 91h12":"M74 89q6 6 12 0"} stroke="#b4f2e8" strokeWidth="2.4" strokeLinecap="round"/>
 <g className="brain-signals"><circle cx="61" cy="45" r="3" fill="#d6f5ff"/><circle cx="101" cy="51" r="3" fill="#9ff1d9"/><circle cx="34" cy="77" r="2.5" fill="#d6f5ff"/><circle cx="126" cy="80" r="2.5" fill="#9ff1d9"/></g>
 </g></g></svg></span>;
}
