"use client";
import {useRef} from "react";
import type {PointerEvent} from "react";
export function useChatDrag(){
 const drag=useRef<{id:number;y:number;top:number}|null>(null);
 return {
 onPointerDown(event:PointerEvent<HTMLDivElement>){
  if(event.pointerType!=="mouse"||event.button!==0||(event.target as Element).closest("button,a,input,textarea,select,audio"))return;
  const element=event.currentTarget;
  if(element.scrollHeight<=element.clientHeight)return;
  drag.current={id:event.pointerId,y:event.clientY,top:element.scrollTop};
  element.setPointerCapture(event.pointerId);
 },
 onPointerMove(event:PointerEvent<HTMLDivElement>){
  const active=drag.current;if(!active||active.id!==event.pointerId)return;
  event.currentTarget.scrollTop=active.top+active.y-event.clientY;
  if(Math.abs(active.y-event.clientY)>4)window.getSelection()?.removeAllRanges();
 },
 onPointerUp(event:PointerEvent<HTMLDivElement>){drag.current=null;if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);},
 onPointerCancel(){drag.current=null;}
 };
}