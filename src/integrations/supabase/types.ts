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
          ativo: boolean | null
          data_overhaul: string | null
          horimetro_overhaul: number | null
          id: number
          intervalo_overhaul_h: number | null
          intervalo_troca_h: number
          nome: string
          tipo: string
        }
        Insert: {
          ativo?: boolean | null
          data_overhaul?: string | null
          horimetro_overhaul?: number | null
          id?: number
          intervalo_overhaul_h?: number | null
          intervalo_troca_h: number
          nome: string
          tipo: string
        }
        Update: {
          ativo?: boolean | null
          data_overhaul?: string | null
          horimetro_overhaul?: number | null
          id?: number
          intervalo_overhaul_h?: number | null
          intervalo_troca_h?: number
          nome?: string
          tipo?: string
        }
        Relationships: []
      }
      historico: {
        Row: {
          criado_em: string | null
          data_evento: string
          descricao: string
          horimetro_equip: number | null
          horimetro_lancha: number | null
          id: number
          lancha_id: number | null
          origem: string | null
          tipo: string | null
        }
        Insert: {
          criado_em?: string | null
          data_evento: string
          descricao: string
          horimetro_equip?: number | null
          horimetro_lancha?: number | null
          id?: number
          lancha_id?: number | null
          origem?: string | null
          tipo?: string | null
        }
        Update: {
          criado_em?: string | null
          data_evento?: string
          descricao?: string
          horimetro_equip?: number | null
          horimetro_lancha?: number | null
          id?: number
          lancha_id?: number | null
          origem?: string | null
          tipo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_lancha_id_fkey"
            columns: ["lancha_id"]
            isOneToOne: false
            referencedRelation: "lanchas"
            referencedColumns: ["id"]
          },
        ]
      }
      lanchas: {
        Row: {
          atualizado_em: string | null
          horimetro_gerador: number | null
          horimetro_motores: number | null
          id: number
          id_webpilot: string | null
          nome: string
        }
        Insert: {
          atualizado_em?: string | null
          horimetro_gerador?: number | null
          horimetro_motores?: number | null
          id?: number
          id_webpilot?: string | null
          nome: string
        }
        Update: {
          atualizado_em?: string | null
          horimetro_gerador?: number | null
          horimetro_motores?: number | null
          id?: number
          id_webpilot?: string | null
          nome?: string
        }
        Relationships: []
      }
      manutencoes: {
        Row: {
          ativo_id: number | null
          criado_em: string | null
          data_manutencao: string
          horimetro_equip: number | null
          horimetro_lancha: number | null
          id: number
          lancha_id: number | null
          observacao: string | null
          origem: string | null
          tipo: string
        }
        Insert: {
          ativo_id?: number | null
          criado_em?: string | null
          data_manutencao: string
          horimetro_equip?: number | null
          horimetro_lancha?: number | null
          id?: number
          lancha_id?: number | null
          observacao?: string | null
          origem?: string | null
          tipo: string
        }
        Update: {
          ativo_id?: number | null
          criado_em?: string | null
          data_manutencao?: string
          horimetro_equip?: number | null
          horimetro_lancha?: number | null
          id?: number
          lancha_id?: number | null
          observacao?: string | null
          origem?: string | null
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
        ]
      }
      posicoes: {
        Row: {
          ativo_id: number | null
          data_fim: string | null
          data_inicio: string
          horas_operadas: number | null
          id: number
          lancha_id: number | null
          offset_horimetro: number | null
          posicao: string | null
        }
        Insert: {
          ativo_id?: number | null
          data_fim?: string | null
          data_inicio: string
          horas_operadas?: number | null
          id?: number
          lancha_id?: number | null
          offset_horimetro?: number | null
          posicao?: string | null
        }
        Update: {
          ativo_id?: number | null
          data_fim?: string | null
          data_inicio?: string
          horas_operadas?: number | null
          id?: number
          lancha_id?: number | null
          offset_horimetro?: number | null
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
        ]
      }
      sync_log: {
        Row: {
          detalhe: string | null
          executado_em: string | null
          id: number
          status: string | null
        }
        Insert: {
          detalhe?: string | null
          executado_em?: string | null
          id?: number
          status?: string | null
        }
        Update: {
          detalhe?: string | null
          executado_em?: string | null
          id?: number
          status?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      v_situacao_atual: {
        Row: {
          ativo: string | null
          atualizado_em: string | null
          data_overhaul: string | null
          horas_ate_overhaul: number | null
          horas_ate_proxima_troca: number | null
          horimetro_equip_atual: number | null
          horimetro_overhaul: number | null
          lancha: string | null
          posicao: string | null
          proxima_troca_h_equip: number | null
          proxima_troca_h_lancha: number | null
          proximo_overhaul_h: number | null
          status_troca: string | null
          tipo: string | null
          ultima_troca_data: string | null
          ultima_troca_h_equip: number | null
          ultima_troca_h_lancha: number | null
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
