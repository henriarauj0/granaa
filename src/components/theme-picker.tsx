"use client";

import { useState } from "react";
import { readTheme, saveTheme, type ThemeChoice } from "@/lib/theme";
import { Segmented } from "./ui";

export function ThemePicker() {
  // as telas do app só renderizam no navegador, depois da sessão carregar
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  return (
    <Segmented<ThemeChoice>
      label="Aparência"
      value={choice}
      onChange={(c) => {
        setChoice(c);
        saveTheme(c);
      }}
      options={[
        { value: "light", label: "Claro" },
        { value: "dark", label: "Escuro" },
        { value: "auto", label: "Automático" },
      ]}
    />
  );
}
