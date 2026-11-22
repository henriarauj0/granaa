// Tema do app: "verde" (claro), "escuro" ou automático (segue o aparelho).
// A escolha fica no aparelho (localStorage) e é aplicada como data-theme no <html>.

export type ThemeChoice = "auto" | "light" | "dark";

export const THEME_KEY = "granaa-tema";

const BG: Record<Exclude<ThemeChoice, "auto">, string> = { light: "#f4f5f1", dark: "#000000" };

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  // barra de status do celular acompanha o fundo
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    if (!m.dataset.original) m.dataset.original = m.content;
    m.content = choice === "auto" ? m.dataset.original : BG[choice];
  });
}

export function saveTheme(choice: ThemeChoice) {
  try {
    if (choice === "auto") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // sem armazenamento (aba anônima): vale só até fechar
  }
  applyTheme(choice);
}

/** Roda no <head>, antes da primeira pintura, para a tela não piscar. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
