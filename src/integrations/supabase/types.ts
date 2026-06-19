export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ativos: {
        Row: {
          ano_fabricacao: number | null
          ativo: boolean
          created_at: string | null
          data_overhaul: string | null
          horimetro_equipamento: number | null
          horimetro_overhaul: number | null
          id: string
          intervalo_manutencao: number
          intervalo_overhaul: number | null
          lancha_id: string | null
          marca: string | null
          modelo: string | null
          nome: string
          numero_serie: string | null
          offset_instalacao: number | null
          posicao: string | null
          tipo: string
          ultima_troca_data: string | null
          ultima_troca_horimetro: number | null
          updated_at: string | null
        }
        Insert: {
          ano_fabricacao?: number | null
          ativo?: boolean
          created_at?: string | null
          data_overhaul?: string | null
          horimetro_equipamento?: number | null
          horimetro_overhaul?: number | null
          id?: string
          intervalo_manutencao: number
          intervalo_overhaul?: number | null
          lancha_id?: string | null
          marca?: string | null
          modelo?: string | null
          nome: string
          numero_serie?: string | null
          offset_instalacao?: number | null
          posicao?: string | null
          tipo: string
          ultima_troca_data?: string | null
          ultima_troca_horimetro?: number | null
          updated_at?: string | null
        }
        Update: {
          ano_fabricacao?: number | null
          ativo?: boolean
          created_at?: string | null
          data_overhaul?: string | null
          horimetro_equipamento?: number | null
          horimetro_overhaul?: number | null
          id?: string
          intervalo_manutencao?: number
          intervalo_overhaul?: number | null
          lancha_id?: string | null
          marca?: string | null
          modelo?: string | null
          nome?: string
          numero_serie?: string | null
          offset_instalacao?: number | null
          posicao?: string | null
          tipo?: string
          ultima_troca_data?: string | null
          ultima_troca_horimetro?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ativos_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ativos_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
        ]
      }
      configuracoes: {
        Row: {
          chave: string
          descricao: string | null
          id: string
          updated_at: string | null
          valor: string
        }
        Insert: {
          chave: string
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor: string
        }
        Update: {
          chave?: string
          descricao?: string | null
          id?: string
          updated_at?: string | null
          valor?: string
        }
        Relationships: []
      }
      despesas: {
        Row: {
          ano_mes: string | null
          centro_resultado: string | null
          created_at: string | null
          data: string
          fornecedor: string | null
          historico: string | null
          id: string
          tipo_despesa: string | null
          valor: number | null
        }
        Insert: {
          ano_mes?: string | null
          centro_resultado?: string | null
          created_at?: string | null
          data: string
          fornecedor?: string | null
          historico?: string | null
          id?: string
          tipo_despesa?: string | null
          valor?: number | null
        }
        Update: {
          ano_mes?: string | null
          centro_resultado?: string | null
          created_at?: string | null
          data?: string
          fornecedor?: string | null
          historico?: string | null
          id?: string
          tipo_despesa?: string | null
          valor?: number | null
        }
        Relationships: []
      }
      fainas_deslocamentos: {
        Row: {
          cd_faina_lancha: number
          cd_lancha: number | null
          created_at: string | null
          dc_horas: number | null
          dh_fim: string | null
          dh_inicio: string | null
          ds_lancha: string | null
          ds_local_dest: string | null
          ds_local_orig: string | null
          id: string
          nr_minutos: number | null
        }
        Insert: {
          cd_faina_lancha: number
          cd_lancha?: number | null
          created_at?: string | null
          dc_horas?: number | null
          dh_fim?: string | null
          dh_inicio?: string | null
          ds_lancha?: string | null
          ds_local_dest?: string | null
          ds_local_orig?: string | null
          id?: string
          nr_minutos?: number | null
        }
        Update: {
          cd_faina_lancha?: number
          cd_lancha?: number | null
          created_at?: string | null
          dc_horas?: number | null
          dh_fim?: string | null
          dh_inicio?: string | null
          ds_lancha?: string | null
          ds_local_dest?: string | null
          ds_local_orig?: string | null
          id?: string
          nr_minutos?: number | null
        }
        Relationships: []
      }
      historico: {
        Row: {
          ativo_id: string | null
          created_at: string | null
          dados_extras: Json | null
          data_evento: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string
          duracao_horas: number | null
          efeito: string | null
          id: string
          lancha_id: string | null
          origem: string
          tipo_evento: string
          tipo_ocorrencia_webpilot: string | null
        }
        Insert: {
          ativo_id?: string | null
          created_at?: string | null
          dados_extras?: Json | null
          data_evento: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao: string
          duracao_horas?: number | null
          efeito?: string | null
          id?: string
          lancha_id?: string | null
          origem?: string
          tipo_evento: string
          tipo_ocorrencia_webpilot?: string | null
        }
        Update: {
          ativo_id?: string | null
          created_at?: string | null
          dados_extras?: Json | null
          data_evento?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string
          duracao_horas?: number | null
          efeito?: string | null
          id?: string
          lancha_id?: string | null
          origem?: string
          tipo_evento?: string
          tipo_ocorrencia_webpilot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
        ]
      }
      indicadores_ativos: {
        Row: {
          cd_ativo_indicador: number
          cd_lancha: number | null
          created_at: string | null
          dc_dif_bb: number | null
          dc_dif_be: number | null
          dc_dif_gerador: number | null
          dc_horimetro_bb: number | null
          dc_horimetro_be: number | null
          dc_horimetro_gerador: number | null
          dh_leitura: string
          ds_lancha: string | null
          ds_origem: string | null
          id: string
          porto: string | null
          porto_base: string | null
        }
        Insert: {
          cd_ativo_indicador: number
          cd_lancha?: number | null
          created_at?: string | null
          dc_dif_bb?: number | null
          dc_dif_be?: number | null
          dc_dif_gerador?: number | null
          dc_horimetro_bb?: number | null
          dc_horimetro_be?: number | null
          dc_horimetro_gerador?: number | null
          dh_leitura: string
          ds_lancha?: string | null
          ds_origem?: string | null
          id?: string
          porto?: string | null
          porto_base?: string | null
        }
        Update: {
          cd_ativo_indicador?: number
          cd_lancha?: number | null
          created_at?: string | null
          dc_dif_bb?: number | null
          dc_dif_be?: number | null
          dc_dif_gerador?: number | null
          dc_horimetro_bb?: number | null
          dc_horimetro_be?: number | null
          dc_horimetro_gerador?: number | null
          dh_leitura?: string
          ds_lancha?: string | null
          ds_origem?: string | null
          id?: string
          porto?: string | null
          porto_base?: string | null
        }
        Relationships: []
      }
      lanchas: {
        Row: {
          created_at: string | null
          horimetro: number
          horimetro_gerador: number
          id: string
          id_webpilot: string | null
          nome: string
          ultima_atualizacao: string | null
        }
        Insert: {
          created_at?: string | null
          horimetro?: number
          horimetro_gerador?: number
          id?: string
          id_webpilot?: string | null
          nome: string
          ultima_atualizacao?: string | null
        }
        Update: {
          created_at?: string | null
          horimetro?: number
          horimetro_gerador?: number
          id?: string
          id_webpilot?: string | null
          nome?: string
          ultima_atualizacao?: string | null
        }
        Relationships: []
      }
      manobras_lanchas: {
        Row: {
          cd_lancha: number | null
          cd_manobra: number
          created_at: string | null
          dh_manobra: string
          ds_lancha: string | null
          ds_porto: string | null
          id: string
        }
        Insert: {
          cd_lancha?: number | null
          cd_manobra: number
          created_at?: string | null
          dh_manobra: string
          ds_lancha?: string | null
          ds_porto?: string | null
          id?: string
        }
        Update: {
          cd_lancha?: number | null
          cd_manobra?: number
          created_at?: string | null
          dh_manobra?: string
          ds_lancha?: string | null
          ds_porto?: string | null
          id?: string
        }
        Relationships: []
      }
      manutencoes: {
        Row: {
          ativo_id: string
          created_at: string | null
          data_manutencao: string
          horimetro_equipamento: number | null
          horimetro_lancha: number | null
          id: string
          lancha_id: string | null
          observacao: string | null
          origem: string
          tipo: string
        }
        Insert: {
          ativo_id: string
          created_at?: string | null
          data_manutencao: string
          horimetro_equipamento?: number | null
          horimetro_lancha?: number | null
          id?: string
          lancha_id?: string | null
          observacao?: string | null
          origem?: string
          tipo: string
        }
        Update: {
          ativo_id?: string
          created_at?: string | null
          data_manutencao?: string
          horimetro_equipamento?: number | null
          horimetro_lancha?: number | null
          id?: string
          lancha_id?: string | null
          observacao?: string | null
          origem?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
        ]
      }
      manutencoes_periodicas: {
        Row: {
          created_at: string | null
          data_realizada: string
          id: string
          lancha_id: string
          observacao: string | null
          origem: string | null
          tipo_id: string
        }
        Insert: {
          created_at?: string | null
          data_realizada: string
          id?: string
          lancha_id: string
          observacao?: string | null
          origem?: string | null
          tipo_id: string
        }
        Update: {
          created_at?: string | null
          data_realizada?: string
          id?: string
          lancha_id?: string
          observacao?: string | null
          origem?: string | null
          tipo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_periodicas_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_periodicas_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
          {
            foreignKeyName: "manutencoes_periodicas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "manutencoes_periodicas_tipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_periodicas_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["tipo_id"]
          },
        ]
      }
      manutencoes_periodicas_tipos: {
        Row: {
          created_at: string | null
          descricao: string | null
          id: string
          nome: string
          periodicidade_dias: number
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome: string
          periodicidade_dias: number
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          periodicidade_dias?: number
        }
        Relationships: []
      }
      ocorrencias_webpilot: {
        Row: {
          cd_ocorrencia: number | null
          created_at: string | null
          data_fim: string | null
          data_inicio: string
          descricao: string | null
          duracao_horas: number | null
          efeito: string | null
          id: string
          lancha_id: string | null
          origem: string | null
          tipo_ocorrencia: string | null
        }
        Insert: {
          cd_ocorrencia?: number | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio: string
          descricao?: string | null
          duracao_horas?: number | null
          efeito?: string | null
          id?: string
          lancha_id?: string | null
          origem?: string | null
          tipo_ocorrencia?: string | null
        }
        Update: {
          cd_ocorrencia?: number | null
          created_at?: string | null
          data_fim?: string | null
          data_inicio?: string
          descricao?: string | null
          duracao_horas?: number | null
          efeito?: string | null
          id?: string
          lancha_id?: string | null
          origem?: string | null
          tipo_ocorrencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ocorrencias_webpilot_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ocorrencias_webpilot_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
        ]
      }
      posicoes: {
        Row: {
          ativo_id: string
          created_at: string | null
          data_instalacao: string
          data_remocao: string | null
          horas_operadas: number | null
          horimetro_equipamento_instalacao: number | null
          horimetro_lancha_instalacao: number | null
          id: string
          lancha_id: string | null
          offset_calculado: number | null
          posicao: string | null
        }
        Insert: {
          ativo_id: string
          created_at?: string | null
          data_instalacao: string
          data_remocao?: string | null
          horas_operadas?: number | null
          horimetro_equipamento_instalacao?: number | null
          horimetro_lancha_instalacao?: number | null
          id?: string
          lancha_id?: string | null
          offset_calculado?: number | null
          posicao?: string | null
        }
        Update: {
          ativo_id?: string
          created_at?: string | null
          data_instalacao?: string
          data_remocao?: string | null
          horas_operadas?: number | null
          horimetro_equipamento_instalacao?: number | null
          horimetro_lancha_instalacao?: number | null
          id?: string
          lancha_id?: string | null
          offset_calculado?: number | null
          posicao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posicoes_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posicoes_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
        ]
      }
      provas_mar: {
        Row: {
          consumo_lts_hora: number | null
          created_at: string | null
          data: string
          descricao: string
          horimetro: number | null
          id: string
          lancha_id: string
          mar_calmo: boolean | null
          mestre: string | null
          observacao: string | null
          origem: string | null
          peso_kg: number | null
          porto: string | null
          qtd_odm_lts: number | null
          rpm: number | null
          velocidade: number | null
          vento_de_popa: boolean | null
        }
        Insert: {
          consumo_lts_hora?: number | null
          created_at?: string | null
          data: string
          descricao: string
          horimetro?: number | null
          id?: string
          lancha_id: string
          mar_calmo?: boolean | null
          mestre?: string | null
          observacao?: string | null
          origem?: string | null
          peso_kg?: number | null
          porto?: string | null
          qtd_odm_lts?: number | null
          rpm?: number | null
          velocidade?: number | null
          vento_de_popa?: boolean | null
        }
        Update: {
          consumo_lts_hora?: number | null
          created_at?: string | null
          data?: string
          descricao?: string
          horimetro?: number | null
          id?: string
          lancha_id?: string
          mar_calmo?: boolean | null
          mestre?: string | null
          observacao?: string | null
          origem?: string | null
          peso_kg?: number | null
          porto?: string | null
          qtd_odm_lts?: number | null
          rpm?: number | null
          velocidade?: number | null
          vento_de_popa?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "provas_mar_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "provas_mar_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "v_manutencoes_periodicas_status"
            referencedColumns: ["lancha_id"]
          },
        ]
      }
      sync_log: {
        Row: {
          detalhe: string | null
          eventos_importados: number | null
          executado_em: string | null
          id: string
          lanchas_atualizadas: number | null
          status: string
        }
        Insert: {
          detalhe?: string | null
          eventos_importados?: number | null
          executado_em?: string | null
          id?: string
          lanchas_atualizadas?: number | null
          status: string
        }
        Update: {
          detalhe?: string | null
          eventos_importados?: number | null
          executado_em?: string | null
          id?: string
          lanchas_atualizadas?: number | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_manutencoes_periodicas_status: {
        Row: {
          dias_restantes: number | null
          lancha_id: string | null
          lancha_nome: string | null
          periodicidade_dias: number | null
          proxima_data: string | null
          status_semaforo: string | null
          tipo_id: string | null
          tipo_nome: string | null
          ultima_data: string | null
        }
        Relationships: []
      }
      v_situacao_atual: {
        Row: {
          ativo_id: string | null
          ativo_nome: string | null
          data_overhaul: string | null
          horas_equipamento_calculadas: number | null
          horas_restantes_overhaul: number | null
          horas_restantes_troca: number | null
          horimetro_overhaul: number | null
          intervalo_manutencao: number | null
          intervalo_overhaul: number | null
          lancha_horimetro: number | null
          lancha_horimetro_gerador: number | null
          lancha_id: string | null
          lancha_nome: string | null
          numero_serie: string | null
          offset_instalacao: number | null
          posicao: string | null
          proxima_troca_horimetro: number | null
          proximo_overhaul_horimetro: number | null
          status_overhaul: string | null
          status_semaforo: string | null
          tipo: string | null
          ultima_atualizacao: string | null
          ultima_troca_data: string | null
          ultima_troca_horimetro: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
