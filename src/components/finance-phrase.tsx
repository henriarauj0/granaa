"use client";

import { useSyncExternalStore } from "react";

export const PHRASES = [
  "O boleto não dorme.",
  "Salário: chegou, viu e foi embora.",
  "Pix enviado. Arrependimento recebido.",
  "Fatura fechou. Coração também.",
  "Rico é quem anota.",
  "Spoiler: foi no delivery.",
  "Cada centavo conta. Literalmente.",
  "Parcelou? A gente lembra.",
  "Seu eu do futuro agradece.",
  "Bora ver o estrago?",
  "Dinheiro some. Aqui, não.",
  "O mês acaba. O controle, não.",
  "Só mais um cafezinho…",
  "Economizar também é um rolê.",
  "Cartão não é renda extra.",
];

// Sorteada uma vez por carregamento da página.
let picked: string | null = null;
const pick = () => (picked ??= PHRASES[Math.floor(Math.random() * PHRASES.length)]);
const noop = () => () => {};

/**
 * Frase curta sobre finanças. No servidor não há sorteio (evita divergência
 * entre o HTML gerado e o navegador); o espaço fica reservado até o sorteio.
 */
export function FinancePhrase() {
  const phrase = useSyncExternalStore(noop, pick, () => null);
  return <span className={phrase ? "phrase-in" : "invisible"}>{phrase ?? PHRASES[0]}</span>;
}
