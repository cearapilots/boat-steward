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

export type ManutencaoPeriodicaStatus = {
  lancha_id: string;
  lancha_nome: string;
  tipo_id: string;
  tipo_nome: string;
  periodicidade_dias: number;
  ultima_data: string | null;
  proxima_data: string | null;
  dias_restantes: number | null;
  status_semaforo: "ok" | "atencao" | "critico" | "vencido" | "sem_registro";
};

export function useManutencoesPeriodicas() {
  return useQuery({
    queryKey: ["manutencoes_periodicas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("v_manutencoes_periodicas_status")
        .select("*")
        .order("lancha_nome")
        .order("tipo_nome");
      if (error) throw error;
      return (data ?? []) as ManutencaoPeriodicaStatus[];
    },
  });
}

export function useCreateManutencaoPeriodica() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      lancha_id: string;
      tipo_id: string;
      data_realizada: string; // YYYY-MM-DD
      observacao?: string | null;
    }) => {
      const { data, error } = await (supabase as any)
        .from("manutencoes_periodicas")
        .insert({
          lancha_id: payload.lancha_id,
          tipo_id: payload.tipo_id,
          data_realizada: payload.data_realizada,
          observacao: payload.observacao ?? null,
          origem: "manual",
        })
        .select()
        .single();
      if (error) { console.error("[useCreateManutencaoPeriodica] erro:", error); throw error; }
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manutencoes_periodicas"] });
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
      // 1) INSERT em manutencoes
      const { data, error } = await supabase
        .from("manutencoes")
        .insert({
          ativo_id: payload.ativo_id,
          lancha_id: payload.lancha_id,
          tipo: payload.tipo,
          data_manutencao: payload.data_manutencao,
          horimetro_lancha: payload.horimetro_lancha ?? null,
          horimetro_equipamento: payload.horimetro_equipamento ?? null,
          observacao: payload.observacao ?? null,
          origem: "manual",
        })
        .select()
        .single();
      if (error) {
        console.error("[useCreateManutencao] erro ao inserir em manutencoes:", error);
        throw error;
      }

      // 2) INSERT espelhado em historico — se falhar, faz rollback removendo o registro de manutencoes
      const { error: histErr } = await supabase.from("historico").insert({
        tipo_evento: payload.tipo,
        descricao: payload.observacao ?? `Manutenção: ${payload.tipo}`,
        ativo_id: payload.ativo_id,
        lancha_id: payload.lancha_id,
        data_evento: payload.data_manutencao,
        origem: "manual",
        dados_extras: {
          horimetro_lancha: payload.horimetro_lancha ?? null,
          horimetro_equipamento: payload.horimetro_equipamento ?? null,
        },
      });
      if (histErr) {
        console.error("[useCreateManutencao] erro ao inserir em historico — revertendo manutencao:", histErr);
        const { error: rollbackErr } = await supabase.from("manutencoes").delete().eq("id", data.id);
        if (rollbackErr) {
          console.error("[useCreateManutencao] FALHA NO ROLLBACK — registro órfão em manutencoes id:", data.id, rollbackErr);
        }
        throw histErr;
      }

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["historico"] });
      qc.invalidateQueries({ queryKey: ["situacao_atual"] });
      qc.invalidateQueries({ queryKey: ["ativos"] });
    },
  });
}

export type MotorSwapPayload = {
  data_troca: string; // ISO date YYYY-MM-DD
  lancha_destino_id: string | null; // null = Reserva
  posicao_destino: "BB" | "BE" | null; // null se Reserva
  horimetro_lancha_destino: number | null; // null se Reserva
  motor_sai_id: string | null; // null se posição estava vazia
  motor_sai_nome: string | null;
  motor_entra_id: string | null; // null se não houver motor disponível
  motor_entra_nome: string | null;
  horimetro_motor_entra: number | null;
};

export function useCreateMotorPosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: MotorSwapPayload) => {
      const dataTroca = p.data_troca;

      // ---- (a) MOTOR QUE SAI ----
      if (p.motor_sai_id) {
        // posição aberta atual do motor que sai
        const { data: posSai, error: errPosSai } = await supabase
          .from("posicoes")
          .select("*")
          .eq("ativo_id", p.motor_sai_id)
          .is("data_remocao", null)
          .order("data_instalacao", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (errPosSai) { console.error("[swap] erro buscando posicao do motor que sai:", errPosSai); throw errPosSai; }

        if (posSai) {
          const horimetroLanchaInst = Number(posSai.horimetro_lancha_instalacao ?? 0);
          const horasOperadas = (p.horimetro_lancha_destino ?? horimetroLanchaInst) - horimetroLanchaInst;

          const { error: errUpdSai } = await supabase
            .from("posicoes")
            .update({
              data_remocao: dataTroca,
              horas_operadas: Math.max(horasOperadas, 0),
            })
            .eq("id", posSai.id);
          if (errUpdSai) { console.error("[swap] erro fechando posicao motor que sai:", errUpdSai); throw errUpdSai; }

          // horímetro atual do motor que sai = horímetro da lancha destino - offset_calculado da posição fechada
          const offsetSai = Number(posSai.offset_calculado ?? 0);
          const horimetroMotorSai = (p.horimetro_lancha_destino ?? horimetroLanchaInst) - offsetSai;

          const { error: errInsReservaSai } = await supabase.from("posicoes").insert({
            ativo_id: p.motor_sai_id,
            lancha_id: null,
            posicao: null,
            data_instalacao: dataTroca,
            horimetro_lancha_instalacao: 0,
            horimetro_equipamento_instalacao: horimetroMotorSai,
            offset_calculado: 0,
          });
          if (errInsReservaSai) { console.error("[swap] erro abrindo reserva motor que sai:", errInsReservaSai); throw errInsReservaSai; }
        }

        const { error: errUpdAtivoSai } = await supabase
          .from("ativos")
          .update({ lancha_id: null, posicao: null })
          .eq("id", p.motor_sai_id);
        if (errUpdAtivoSai) { console.error("[swap] erro atualizando ativo motor que sai:", errUpdAtivoSai); throw errUpdAtivoSai; }
      }

      // ---- (b) MOTOR QUE ENTRA ----
      let offsetCalculado = 0;
      if (p.motor_entra_id) {
        // fechar posição em reserva
        const { data: posEntra, error: errPosEntra } = await supabase
          .from("posicoes")
          .select("*")
          .eq("ativo_id", p.motor_entra_id)
          .is("data_remocao", null)
          .order("data_instalacao", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (errPosEntra) { console.error("[swap] erro buscando posicao motor que entra:", errPosEntra); throw errPosEntra; }

        if (posEntra) {
          const { error: errUpdEntra } = await supabase
            .from("posicoes")
            .update({ data_remocao: dataTroca, horas_operadas: 0 })
            .eq("id", posEntra.id);
          if (errUpdEntra) { console.error("[swap] erro fechando reserva motor que entra:", errUpdEntra); throw errUpdEntra; }
        }

        if (p.lancha_destino_id && p.posicao_destino && p.horimetro_lancha_destino != null && p.horimetro_motor_entra != null) {
          offsetCalculado = p.horimetro_lancha_destino - p.horimetro_motor_entra;

          const { error: errInsEntra } = await supabase.from("posicoes").insert({
            ativo_id: p.motor_entra_id,
            lancha_id: p.lancha_destino_id,
            posicao: p.posicao_destino,
            data_instalacao: dataTroca,
            horimetro_lancha_instalacao: p.horimetro_lancha_destino,
            horimetro_equipamento_instalacao: p.horimetro_motor_entra,
            offset_calculado: offsetCalculado,
          });
          if (errInsEntra) { console.error("[swap] erro inserindo nova posicao motor que entra:", errInsEntra); throw errInsEntra; }

          const { error: errUpdAtivoEntra } = await supabase
            .from("ativos")
            .update({
              lancha_id: p.lancha_destino_id,
              posicao: p.posicao_destino,
              offset_instalacao: offsetCalculado,
            })
            .eq("id", p.motor_entra_id);
          if (errUpdAtivoEntra) { console.error("[swap] erro atualizando ativo motor que entra:", errUpdAtivoEntra); throw errUpdAtivoEntra; }
        }
      }

      // ---- (c) HISTORICO ----
      const descSai = p.motor_sai_nome
        ? `no lugar do ${p.motor_sai_nome}, que foi para reserva`
        : `em posição vazia`;
      const descEntra = p.motor_entra_nome ?? "Motor (vazio)";
      const localDestino = p.lancha_destino_id
        ? `[lancha destino] ${p.posicao_destino ?? ""}`
        : "Reserva";
      const descricao = p.motor_entra_id
        ? `${descEntra} instalado em ${localDestino} ${descSai}`
        : `${p.motor_sai_nome ?? "Motor"} removido para reserva (posição ficou vazia)`;

      const { error: errHist } = await supabase.from("historico").insert({
        tipo_evento: "troca_posicao",
        descricao,
        ativo_id: p.motor_entra_id ?? p.motor_sai_id,
        lancha_id: p.lancha_destino_id,
        data_evento: dataTroca,
        origem: "manual",
        dados_extras: {
          horimetro_lancha: p.horimetro_lancha_destino,
          horimetro_equipamento: p.horimetro_motor_entra,
          saldo_horimetro:
            p.horimetro_lancha_destino != null && p.horimetro_motor_entra != null
              ? p.horimetro_lancha_destino - p.horimetro_motor_entra
              : null,
          componente: "motor",
          ativo_retirado: p.motor_sai_nome,
          ativo_instalado: p.motor_entra_nome,
        },
      });
      if (errHist) { console.error("[swap] erro inserindo historico:", errHist); throw errHist; }

      return { ok: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["posicoes"] });
      qc.invalidateQueries({ queryKey: ["ativos"] });
      qc.invalidateQueries({ queryKey: ["situacao_atual"] });
      qc.invalidateQueries({ queryKey: ["historico"] });
    },
  });
}
