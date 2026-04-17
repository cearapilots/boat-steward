import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SituacaoRow = {
  ativo_id: string;
  ativo_nome: string;
  tipo: string;
  posicao: string | null;
  lancha_id: string;
  lancha_nome: string;
  lancha_horimetro: number;
  lancha_horimetro_gerador: number;
  ultima_atualizacao: string;
  horas_equipamento_calculadas: number;
  intervalo_manutencao: number;
  intervalo_overhaul: number | null;
  proxima_troca_horimetro: number;
  horas_restantes_troca: number;
  horas_restantes_overhaul: number | null;
  status_semaforo: "verde" | "amarelo" | "vermelho";
  status_overhaul: string | null;
  ultima_troca_data: string | null;
  ultima_troca_horimetro: number | null;
  data_overhaul: string | null;
};

export function useSituacaoAtual() {
  return useQuery({
    queryKey: ["situacao_atual"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_situacao_atual")
        .select("*")
        .order("lancha_nome");
      if (error) throw error;
      return (data ?? []) as SituacaoRow[];
    },
  });
}

export function useLanchas() {
  return useQuery({
    queryKey: ["lanchas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lanchas").select("*").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAtivos() {
  return useQuery({
    queryKey: ["ativos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ativos")
        .select("*, lancha:lanchas(id,nome)")
        .eq("ativo", true)
        .order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function usePosicoes() {
  return useQuery({
    queryKey: ["posicoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posicoes")
        .select("*, ativo:ativos(id,nome,tipo), lancha:lanchas(id,nome)")
        .order("data_instalacao", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useManutencoes() {
  return useQuery({
    queryKey: ["historico"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("historico")
        .select("*, ativo:ativos(id,nome,tipo,posicao), lancha:lanchas(id,nome)")
        .order("data_evento", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateManutencao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      ativo_id: string;
      lancha_id: string | null;
      tipo: string;
      data_manutencao: string;
      horimetro_lancha?: number | null;
      horimetro_equipamento?: number | null;
      observacao?: string | null;
    }) => {
      const { data, error } = await supabase.from("manutencoes").insert({
        ...payload,
        origem: "manual",
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["historico"] });
      qc.invalidateQueries({ queryKey: ["situacao_atual"] });
    },
  });
}
