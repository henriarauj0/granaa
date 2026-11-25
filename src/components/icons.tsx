import {
  Apple,
  Baby,
  Banknote,
  Beer,
  Bike,
  Bitcoin,
  BookOpen,
  Briefcase,
  Building2,
  Bus,
  Car,
  CircleDashed,
  Coffee,
  Coins,
  CreditCard,
  Droplets,
  Dumbbell,
  Film,
  Fuel,
  Gamepad2,
  Gift,
  GraduationCap,
  HandCoins,
  HandHeart,
  Hammer,
  HeartPulse,
  House,
  KeyRound,
  Landmark,
  Laptop,
  Lightbulb,
  MapPin,
  Music,
  Palmtree,
  PartyPopper,
  PawPrint,
  Percent,
  PiggyBank,
  Pill,
  Pizza,
  Plane,
  Receipt,
  Repeat,
  Scissors,
  Shield,
  Shirt,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  Ticket,
  TrainFront,
  TrendingUp,
  Trophy,
  Tv,
  Umbrella,
  Users,
  Utensils,
  Wallet,
  Wifi,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { createElement } from "react";
import { normalizeDescription } from "@/lib/import/categorize";

/**
 * Galeria de ícones. A chave é o que fica gravado no banco, então uma chave
 * nunca deve mudar de nome; para trocar o desenho, troque só o componente.
 */
export const ICON_GROUPS: Array<{ label: string; icons: Record<string, LucideIcon> }> = [
  {
    label: "Casa",
    icons: { casa: House, luz: Lightbulb, agua: Droplets, internet: Wifi, moveis: Sofa, reforma: Hammer, manutencao: Wrench, aluguel: KeyRound },
  },
  {
    label: "Comida",
    icons: { refeicao: Utensils, mercado: ShoppingCart, cafe: Coffee, lanche: Pizza, bar: Beer, vinho: Wine, feira: Apple },
  },
  {
    label: "Transporte",
    icons: { carro: Car, combustivel: Fuel, onibus: Bus, bicicleta: Bike, aviao: Plane, trem: TrainFront, local: MapPin },
  },
  {
    label: "Saúde e cuidados",
    icons: { saude: HeartPulse, remedio: Pill, medico: Stethoscope, academia: Dumbbell, beleza: Sparkles, salao: Scissors },
  },
  {
    label: "Compras e lazer",
    icons: {
      compras: ShoppingBag,
      roupas: Shirt,
      presente: Gift,
      ingresso: Ticket,
      jogos: Gamepad2,
      musica: Music,
      cinema: Film,
      tv: Tv,
      livros: BookOpen,
      festa: PartyPopper,
      ferias: Palmtree,
      eletronicos: Laptop,
      celular: Smartphone,
    },
  },
  {
    label: "Família",
    icons: { filhos: Baby, pets: PawPrint, educacao: GraduationCap, doacao: HandHeart, familia: Users },
  },
  {
    label: "Dinheiro",
    icons: {
      carteira: Wallet,
      banco: Landmark,
      empresa: Building2,
      cofrinho: PiggyBank,
      cartao: CreditCard,
      dinheiro: Banknote,
      moedas: Coins,
      trabalho: Briefcase,
      investimento: TrendingUp,
      cripto: Bitcoin,
      recibo: Receipt,
      imposto: Percent,
      emprestimo: HandCoins,
      assinatura: Repeat,
      seguro: Shield,
      protecao: Umbrella,
    },
  },
  {
    label: "Metas",
    icons: { meta: Target, conquista: Trophy, estrela: Star, outros: CircleDashed },
  },
];

const ALL: Record<string, LucideIcon> = Object.assign({}, ...ICON_GROUPS.map((g) => g.icons));

/** Ícone sugerido pelo nome, para categorias e contas sem ícone escolhido. */
const BY_NAME: Array<[RegExp, string]> = [
  [/aliment|restaurant|refei|delivery|ifood/, "refeicao"],
  [/mercado|supermerc/, "mercado"],
  [/transport|uber|taxi/, "carro"],
  [/combust|gasolin|posto/, "combustivel"],
  [/moradia|aluguel|condom/, "casa"],
  [/contas da casa|luz|energia/, "luz"],
  [/saude|farmac|medic/, "saude"],
  [/cuidados|beleza|estetica/, "beleza"],
  [/educa|escola|curso|faculdade/, "educacao"],
  [/lazer|entreten|diversao/, "ingresso"],
  [/compra|loja/, "compras"],
  [/assinatura|streaming/, "assinatura"],
  [/viagem|passage|hotel/, "aviao"],
  [/pet|veterin/, "pets"],
  [/presente/, "presente"],
  [/doac/, "doacao"],
  [/imposto|taxa|tribut/, "imposto"],
  [/emprestimo|financiamento/, "emprestimo"],
  [/saque/, "dinheiro"],
  [/salario|pagamento|pro ?labore|honorario/, "trabalho"],
  [/invest|rendimento|aplicac/, "investimento"],
  [/reembolso|estorno/, "recibo"],
  [/renda extra|freela|bico/, "moedas"],
  [/academia|esporte/, "academia"],
  [/vestu|roupa/, "roupas"],
  [/celular|telefon/, "celular"],
  [/internet/, "internet"],
  [/seguro/, "seguro"],
  [/filho|crianca|bebe/, "filhos"],
  [/reserva|emergencia|poupanc/, "cofrinho"],
  [/carteira|dinheiro/, "carteira"],
  [/carro|moto|veiculo/, "carro"],
  [/casa|apartamento|imovel/, "casa"],
  [/notebook|computador|eletron/, "eletronicos"],
];

export function suggestIcon(name: string): string | null {
  const n = normalizeDescription(name);
  for (const [re, key] of BY_NAME) if (re.test(n)) return key;
  return null;
}

/** Só envia o ícone ao banco quando ele mudou. */
export const iconPatch = (before: string | null | undefined, after: string | null) =>
  after === (before ?? null) ? {} : { icon: after };

export function iconFor(key: string | null | undefined): LucideIcon | null {
  return key ? ALL[key] ?? null : null;
}

/**
 * Círculo colorido com o ícone escolhido, o sugerido pelo nome ou, sem
 * nenhum dos dois, a primeira letra do nome.
 */
export function EntityIcon({
  icon,
  name,
  color,
  fallback,
  size = "md",
}: {
  icon?: string | null;
  name: string;
  color: string;
  /** ícone usado quando não há escolha nem sugestão (ex.: banco para contas) */
  fallback?: LucideIcon | null;
  size?: "sm" | "md";
}) {
  const Icon = iconFor(icon) ?? iconFor(suggestIcon(name)) ?? fallback ?? null;
  const box = size === "sm" ? "size-8 text-xs" : "size-10 text-sm";
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${box}`}
      // o desenho puxa um pouco para a cor do texto: cores escuras continuam visíveis no tema escuro
      style={{ background: `color-mix(in oklab, ${color} 20%, transparent)`, color: `color-mix(in oklab, ${color} 72%, var(--ink))` }}
      aria-hidden
    >
      {Icon ? createElement(Icon, { className: size === "sm" ? "size-4" : "size-5" }) : name.charAt(0).toUpperCase()}
    </span>
  );
}

/** Galeria para escolher um ícone. Tocar no escolhido de novo volta ao automático. */
export function IconPicker({
  value,
  onChange,
  color,
  suggested,
}: {
  value: string | null;
  onChange: (key: string | null) => void;
  color: string;
  /** ícone automático, mostrado quando nada foi escolhido */
  suggested: string | null;
}) {
  const current = value ?? suggested;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {value ? "Toque no ícone escolhido para voltar ao automático." : suggested ? "Escolhido automaticamente pelo nome." : "Sem ícone: aparece a inicial do nome."}
      </p>
      <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
        {ICON_GROUPS.map((g) => (
          <div key={g.label}>
            <p className="mb-1.5 text-xs font-medium text-ink-2">{g.label}</p>
            <div className="grid grid-cols-7 gap-1.5" role="radiogroup" aria-label={`Ícones: ${g.label}`}>
              {Object.entries(g.icons).map(([key, Icon]) => {
                const on = current === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-label={key}
                    title={key}
                    onClick={() => onChange(value === key ? null : key)}
                    className="flex aspect-square items-center justify-center rounded-full border border-line text-ink-2 hover:bg-surface-2"
                    style={on ? { background: `color-mix(in oklab, ${color} 22%, transparent)`, color, borderColor: color } : undefined}
                  >
                    <Icon className="size-5" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
