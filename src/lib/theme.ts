"use client";
import { useEffect, useState } from "react";
const KEY = "bluemind-app-theme";
export function useAppTheme() {
  const [dark, setDarkState] = useState(false);
  useEffect(() => {
    const sync = () => { try { const value = localStorage.getItem(KEY); setDarkState(value === "1" || (value === null && localStorage.getItem("bluemind_homepage_theme") === "dark")); } catch {} };
    sync(); window.addEventListener("storage", sync); window.addEventListener("bluemind-theme", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("bluemind-theme", sync); };
  }, []);
  function setDark(value: boolean) { setDarkState(value); try { localStorage.setItem(KEY, value ? "1" : "0"); window.dispatchEvent(new Event("bluemind-theme")); } catch {} }
  return { dark, setDark, toggleDark: () => setDark(!dark) };
}
