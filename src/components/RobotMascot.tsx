"use client";
import { useId } from "react";

export function RobotMascot({ mood = "idle", tone = "blue", className = "" }: {
  mood?: "idle" | "thinking" | "happy" | "error";
  tone?: "blue" | "forest";
  className?: string;
}) {
  const uid = useId().replace(/:/g, "");
  return <span className={"robot-mascot " + className} data-mood={mood} data-tone={tone} aria-hidden="true"
    onPointerMove={(event) => {
      if (event.pointerType !== "mouse") return;
      const box = event.currentTarget.getBoundingClientRect();
      event.currentTarget.style.setProperty("--eye-x", ((event.clientX - box.left) / box.width - .5) * 5 + "px");
      event.currentTarget.style.setProperty("--eye-y", ((event.clientY - box.top) / box.height - .5) * 4 + "px");
    }}
    onPointerLeave={(event) => {
      event.currentTarget.style.setProperty("--eye-x", "0px");
      event.currentTarget.style.setProperty("--eye-y", "0px");
    }}>
    <svg viewBox="0 0 120 132" fill="none">
      <defs>
        <linearGradient id={uid + "shell"} x1="25" y1="14" x2="98" y2="120" gradientUnits="userSpaceOnUse"><stop stopColor="#fff"/><stop offset="1" stopColor="#cbdbea"/></linearGradient>
        <linearGradient id={uid + "screen"} x1="30" y1="35" x2="92" y2="73" gradientUnits="userSpaceOnUse"><stop stopColor="#233d5b"/><stop offset="1" stopColor="#0a192c"/></linearGradient>
      </defs>
      <ellipse className="robot-shadow" cx="60" cy="126" rx="27" ry="4" fill="currentColor" opacity=".16"/>
      <g className="robot-body">
        <path d="M49 111v10M71 111v10" stroke="#98aec7" strokeWidth="9" strokeLinecap="round"/>
        <path d="M40 122h15M65 122h15" stroke="#e8f2fa" strokeWidth="9" strokeLinecap="round"/>
        <rect x="38" y="78" width="44" height="37" rx="16" fill={"url(#" + uid + "shell)"} stroke="#afc3d9" strokeWidth="1.5"/>
        <rect x="47" y="86" width="26" height="16" rx="7" className="robot-chest"/>
        <path d="m56 94 3 3 6-7" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M37 87 26 99" stroke="#adbed2" strokeWidth="8" strokeLinecap="round"/>
        <circle cx="24" cy="101" r="7" fill="#edf5fc" stroke="#b6c9de"/>
        <g className="robot-wave"><path d="m83 88 13-12" stroke="#adbed2" strokeWidth="8" strokeLinecap="round"/><path d="m95 78 7-12" stroke="#edf5fc" strokeWidth="10" strokeLinecap="round"/><path d="m99 65-1-5M104 67l3-4" stroke="#edf5fc" strokeWidth="4" strokeLinecap="round"/></g>
        <g className="robot-head">
          <path d="M60 25V15" stroke="#a7bbd1" strokeWidth="4" strokeLinecap="round"/>
          <circle className="robot-antenna" cx="60" cy="10" r="6"/>
          <rect x="13" y="43" width="12" height="23" rx="6" className="robot-ear"/>
          <rect x="95" y="43" width="12" height="23" rx="6" className="robot-ear"/>
          <rect x="22" y="24" width="76" height="56" rx="23" fill={"url(#" + uid + "shell)"} stroke="#afc3d9" strokeWidth="1.5"/>
          <rect x="29" y="33" width="62" height="38" rx="16" fill={"url(#" + uid + "screen)"}/>
          <path d="M37 39c8-4 17-4 25-3" stroke="white" strokeOpacity=".12" strokeWidth="3" strokeLinecap="round"/>
          <g className="robot-eyes"><rect className="robot-eye" x="40" y="43" width="9" height="14" rx="4.5"/><rect className="robot-eye" x="71" y="43" width="9" height="14" rx="4.5"/></g>
          <path className="robot-smile" d="M54 61q6 5 12 0" strokeWidth="2.5" strokeLinecap="round"/>
          <circle cx="36" cy="59" r="3" fill="#faaca5" opacity=".4"/><circle cx="84" cy="59" r="3" fill="#faaca5" opacity=".4"/>
          <path className="robot-scan" d="M34 51h52" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
        </g>
      </g>
    </svg>
  </span>;
}
