// Tema do app: "verde" (claro), "escuro" ou automático (segue o aparelho).
// A escolha fica no aparelho (localStorage). O <html> sempre recebe o tema
// concreto em data-theme ("light" ou "dark"); no automático, ele acompanha o
// aparelho. Assim as cores de cada tema ficam definidas uma vez só no CSS.

export type ThemeChoice = "auto" | "light" | "dark";

const THEME_KEY = "granaa-tema";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(choice: ThemeChoice) {
  const resolved = choice === "auto" ? (matchMedia(DARK_QUERY).matches ? "dark" : "light") : choice;
  document.documentElement.setAttribute("data-theme", resolved);
  // barra de status do celular acompanha o fundo definido no CSS
  const bg = getComputedStyle(document.body).backgroundColor;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    m.content = bg;
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

/**
 * Roda no <head>, antes da primeira pintura, para a tela não piscar.
 * No automático, também segue a troca de tema do aparelho com o app aberto.
 */
export const THEME_BOOT_SCRIPT = `(function(){var m=matchMedia("${DARK_QUERY}");function a(){var t=null;try{t=localStorage.getItem("${THEME_KEY}")}catch(e){}document.documentElement.setAttribute("data-theme",t==="light"||t==="dark"?t:m.matches?"dark":"light")}a();m.addEventListener("change",a)})()`;
