"use client";

import { useEffect } from "react";

export function TargetDetails() {
  useEffect(() => {
    function openTarget() {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id.startsWith("file-")) return;
      const target = document.getElementById(id);
      if (!(target instanceof HTMLDetailsElement)) return;
      target.open = true;
      window.requestAnimationFrame(() => target.scrollIntoView({ block: "center" }));
    }

    openTarget();
    window.addEventListener("hashchange", openTarget);
    return () => window.removeEventListener("hashchange", openTarget);
  }, []);

  return null;
}
