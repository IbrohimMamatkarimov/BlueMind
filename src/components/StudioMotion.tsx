"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
const cards=".rivo-shelf-card,.rivo-resume-card,.rivo-challenge-card,.study-task,.study-shortcuts>a,.mock-card";
const reveals=".rivo-launchpad,.rivo-stat-rail,.rivo-resume-card,.rivo-workbench,.rivo-shelf-card,.rivo-activity-card,.rivo-challenge-card,.study-focus,.study-targets,.study-panel,.study-shortcuts>a,.mock-card";
export function StudioMotion(){
 const path=usePathname();
 useEffect(()=>{
  const reduce=window.matchMedia("(prefers-reduced-motion: reduce)");
  if(reduce.matches)return;
  let frame=0;let target:HTMLElement|null=null;let x=0;let y=0;
  const observed=new WeakSet<Element>();
  const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add("studio-visible");observer.unobserve(entry.target);}}),{threshold:.06});
  const scan=()=>{document.querySelectorAll(reveals).forEach((el,i)=>{if(observed.has(el))return;observed.add(el);(el as HTMLElement).style.setProperty("--reveal-delay",Math.min(i%4*55,165)+"ms");el.classList.add("studio-reveal");observer.observe(el);});};
  scan();const mutations=new MutationObserver(scan);mutations.observe(document.body,{childList:true,subtree:true});
  const move=(event:PointerEvent)=>{if(event.pointerType!=="mouse")return;const next=(event.target as Element).closest<HTMLElement>(cards);if(target!==next){target?.classList.remove("studio-lit");target=next;}if(!target)return;const box=target.getBoundingClientRect();x=event.clientX-box.left;y=event.clientY-box.top;if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(target){target.style.setProperty("--light-x",x+"px");target.style.setProperty("--light-y",y+"px");target.classList.add("studio-lit");}});};
  const leave=()=>{target?.classList.remove("studio-lit");target=null;};
  document.addEventListener("pointermove",move,{passive:true});document.addEventListener("pointerleave",leave);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();mutations.disconnect();document.removeEventListener("pointermove",move);document.removeEventListener("pointerleave",leave);document.querySelectorAll(".studio-reveal").forEach(el=>el.classList.remove("studio-reveal","studio-visible"));};
 },[path]);
 return null;
}
