/** Regra de senha usada no cadastro e na troca de senha. Devolve o problema ou null. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return "A senha precisa ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use letras e números na senha.";
  return null;
}

export const PASSWORD_HINT = "Mínimo de 8 caracteres, com letras e números.";
