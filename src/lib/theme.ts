"use client";
import { useEffect, useState } from "react";
const KEY = "bluemind-app-theme";
const LIGHT_DEFAULT_MIGRATION = "bluemind-light-default-v1";
export function useAppTheme() {
  const [dark, setDarkState] = useState(false);
  useEffect(() => {
    const sync = () => {
      try {
        if (localStorage.getItem(LIGHT_DEFAULT_MIGRATION) !== "1") {
          localStorage.setItem(KEY, "0");
          localStorage.setItem("bluemind_homepage_theme", "light");
          localStorage.setItem(LIGHT_DEFAULT_MIGRATION, "1");
          setDarkState(false);
          return;
        }
        setDarkState(localStorage.getItem(KEY) === "1");
      } catch {}
    };
    sync(); window.addEventListener("storage", sync); window.addEventListener("bluemind-theme", sync);
    return () => { window.removeEventListener("storage", sync); window.removeEventListener("bluemind-theme", sync); };
  }, []);
  function setDark(value: boolean) { setDarkState(value); try { localStorage.setItem(KEY, value ? "1" : "0"); window.dispatchEvent(new Event("bluemind-theme")); } catch {} }
  return { dark, setDark, toggleDark: () => setDark(!dark) };
}
