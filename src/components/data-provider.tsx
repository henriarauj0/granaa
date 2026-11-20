"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";
import type { Account, Category, CreditCard, Goal, Profile, Transaction } from "@/lib/types";
import { useAuth } from "./auth-provider";

export interface AppData {
  profile: Profile | null;
  accounts: Account[];
  cards: CreditCard[];
  categories: Category[];
  transactions: Transaction[];
  goals: Goal[];
}

interface DataState extends AppData {
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  categoryById: Map<string, Category>;
  accountById: Map<string, Account>;
  cardById: Map<string, CreditCard>;
}

const empty: AppData = { profile: null, accounts: [], cards: [], categories: [], transactions: [], goals: [] };

const DataContext = createContext<DataState | null>(null);

const num = (v: unknown) => (v == null ? 0 : Number(v));

async function fetchAllTransactions(): Promise<Transaction[]> {
  const supabase = getSupabase();
  const pageSize = 1000;
  const all: Transaction[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("transactions")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all.push(...(data as Transaction[]).map((t) => ({ ...t, amount: num(t.amount) })));
    if (!data || data.length < pageSize) break;
  }
  return all;
}

async function fetchAll(userId: string): Promise<AppData> {
  const supabase = getSupabase();
  const [profile, accounts, cards, categories, goals, transactions] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
    supabase.from("accounts").select("*").order("created_at"),
    supabase.from("credit_cards").select("*").order("created_at"),
    supabase.from("categories").select("id, name, kind, color").order("name"),
    supabase.from("goals").select("*").order("created_at"),
    fetchAllTransactions(),
  ]);
  for (const r of [profile, accounts, cards, categories, goals]) if (r.error) throw r.error;
  return {
    profile: profile.data as Profile | null,
    accounts: (accounts.data as Account[]).map((a) => ({ ...a, initial_balance: num(a.initial_balance) })),
    cards: (cards.data as CreditCard[]).map((c) => ({ ...c, limit_amount: num(c.limit_amount) })),
    categories: categories.data as Category[],
    goals: (goals.data as Goal[]).map((g) => ({
      ...g,
      target_amount: num(g.target_amount),
      saved_amount: num(g.saved_amount),
    })),
    transactions,
  };
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [data, setData] = useState<AppData>(empty);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!userId) return;
    try {
      const next = await fetchAll(userId);
      setData(next);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar seus dados.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial ao entrar
    setLoading(true);
    reload();
  }, [userId, reload]);

  const value = useMemo<DataState>(
    () => ({
      ...data,
      loading,
      error,
      reload,
      categoryById: new Map(data.categories.map((c) => [c.id, c])),
      accountById: new Map(data.accounts.map((a) => [a.id, a])),
      cardById: new Map(data.cards.map((c) => [c.id, c])),
    }),
    [data, loading, error, reload],
  );

  return <DataContext value={value}>{children}</DataContext>;
}

export function useData(): DataState {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData fora do DataProvider");
  return ctx;
}
