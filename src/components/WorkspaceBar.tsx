"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Search, Command, ArrowUpRight, CalendarCheck2, FileText, BookOpen, NotebookPen, Layers3, ChartNoAxesCombined, X } from "lucide-react";
const ROUTES=[
 {href:"/today",label:"Study desk",detail:"Your daily plan and targets",icon:CalendarCheck2},
 {href:"/mocks",label:"Mock tests",detail:"Open the practice paper library",icon:FileText},
 {href:"/practice",label:"Question bank",detail:"Choose a subject or skill",icon:BookOpen},
 {href:"/notebook",label:"Notebook",detail:"Review and reflect on mistakes",icon:NotebookPen},
 {href:"/vocabulary",label:"Vocabulary",detail:"Words, flashcards, and review",icon:Layers3},
 {href:"/progress",label:"Progress",detail:"Your practice history and results",icon:ChartNoAxesCombined},
];
export function WorkspaceBar(){
 const path=usePathname();const router=useRouter();const [open,setOpen]=useState(false);const [query,setQuery]=useState("");const [index,setIndex]=useState(0);
 const dialog=useRef<HTMLDialogElement>(null);const input=useRef<HTMLInputElement>(null);
 const filtered=ROUTES.filter(item=>(item.label+" "+item.detail).toLowerCase().includes(query.toLowerCase()));
 useEffect(()=>{const onKey=(event:KeyboardEvent)=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k"){event.preventDefault();setOpen(value=>!value);}};window.addEventListener("keydown",onKey);return()=>window.removeEventListener("keydown",onKey);},[]);
 useEffect(()=>{if(open){setQuery("");setIndex(0);dialog.current?.showModal();input.current?.focus();}else if(dialog.current?.open){dialog.current.close();}},[open]);
 const current=ROUTES.find(item=>path?.startsWith(item.href));
 return <><div className="study-workspace-bar"><div><span>WORKSPACE</span><b>{current?.label||"BlueMind"}</b></div><button type="button" onClick={()=>setOpen(true)} className="study-search-trigger"><Search size={15}/><span>Find your next move</span><kbd><Command size={10}/> K</kbd></button></div>
 <dialog ref={dialog} className="study-command" aria-labelledby="study-command-title" onClose={()=>setOpen(false)} onClick={event=>{if(event.target===event.currentTarget)setOpen(false);}}>
 <h2 id="study-command-title" className="sr-only">Search your workspace</h2><div className="study-command__input"><Search size={18}/><input ref={input} value={query} onChange={event=>{setQuery(event.target.value);setIndex(0);}} placeholder="Where would you like to go?" aria-label="Search workspace" onKeyDown={event=>{if(event.key==="ArrowDown"){event.preventDefault();setIndex(value=>Math.min(value+1,filtered.length-1));}if(event.key==="ArrowUp"){event.preventDefault();setIndex(value=>Math.max(0,value-1));}if(event.key==="Enter"&&filtered[index]){event.preventDefault();router.push(filtered[index].href);setOpen(false);}}}/><button type="button" aria-label="Close search" onClick={()=>setOpen(false)}><X size={17}/></button></div>
 <div className="study-command__results">{filtered.length?filtered.map((item,i)=><Link key={item.href} href={item.href} data-selected={i===index} onClick={()=>setOpen(false)}><item.icon size={20}/><span><strong>{item.label}</strong><small>{item.detail}</small></span><ArrowUpRight size={15}/></Link>):<p>No matching pages. Try “mocks” or “vocabulary”.</p>}</div><footer>↑ ↓ to move · Enter to open · Esc to close</footer>
 </dialog></>;
}
