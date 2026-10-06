export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      allergens: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      child_allergens: {
        Row: {
          allergen_id: string
          child_id: string
        }
        Insert: {
          allergen_id: string
          child_id: string
        }
        Update: {
          allergen_id?: string
          child_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "child_allergens_allergen_id_fkey"
            columns: ["allergen_id"]
            isOneToOne: false
            referencedRelation: "allergens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "child_allergens_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          class_id: string | null
          created_at: string | null
          first_name: string
          id: string
          last_name: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          first_name: string
          id?: string
          last_name: string
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "children_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          id: string
          name: string
          school_id: string | null
        }
        Insert: {
          id?: string
          name: string
          school_id?: string | null
        }
        Update: {
          id?: string
          name?: string
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      device_claims: {
        Row: {
          claimed_at: string
          device_id: string
          device_identifier: string
          id: string
        }
        Insert: {
          claimed_at?: string
          device_id: string
          device_identifier: string
          id?: string
        }
        Update: {
          claimed_at?: string
          device_id?: string
          device_identifier?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_claims_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "devices"
            referencedColumns: ["id"]
          },
        ]
      }
      device_setup_attempts: {
        Row: {
          attempt_count: number
          device_identifier: string
          last_attempt_at: string
          window_started_at: string
        }
        Insert: {
          attempt_count?: number
          device_identifier: string
          last_attempt_at?: string
          window_started_at?: string
        }
        Update: {
          attempt_count?: number
          device_identifier?: string
          last_attempt_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      device_setup_global_attempts: {
        Row: {
          attempt_count: number
          id: boolean
          last_attempt_at: string
          window_started_at: string
        }
        Insert: {
          attempt_count?: number
          id?: boolean
          last_attempt_at?: string
          window_started_at?: string
        }
        Update: {
          attempt_count?: number
          id?: boolean
          last_attempt_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          active: boolean
          config_code_expires_at: string | null
          config_code_hash: string | null
          created_at: string
          id: string
          identifier: string | null
          last_seen_at: string | null
          name: string
          revoked: boolean
          school_id: string
        }
        Insert: {
          active?: boolean
          config_code_expires_at?: string | null
          config_code_hash?: string | null
          created_at?: string
          id?: string
          identifier?: string | null
          last_seen_at?: string | null
          name: string
          revoked?: boolean
          school_id: string
        }
        Update: {
          active?: boolean
          config_code_expires_at?: string | null
          config_code_hash?: string | null
          created_at?: string
          id?: string
          identifier?: string | null
          last_seen_at?: string | null
          name?: string
          revoked?: boolean
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          child_id: string | null
          created_at: string | null
          date: string | null
          description: string | null
          family_responded_at: string | null
          family_response: string | null
          family_seen: boolean | null
          id: string
          monitor_id: string
          monitor_validated: boolean | null
          requires_family_signature: boolean | null
          reviewed: boolean | null
          send_notification: boolean | null
        }
        Insert: {
          child_id?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          family_responded_at?: string | null
          family_response?: string | null
          family_seen?: boolean | null
          id?: string
          monitor_id: string
          monitor_validated?: boolean | null
          requires_family_signature?: boolean | null
          reviewed?: boolean | null
          send_notification?: boolean | null
        }
        Update: {
          child_id?: string | null
          created_at?: string | null
          date?: string | null
          description?: string | null
          family_responded_at?: string | null
          family_response?: string | null
          family_seen?: boolean | null
          id?: string
          monitor_id?: string
          monitor_validated?: boolean | null
          requires_family_signature?: boolean | null
          reviewed?: boolean | null
          send_notification?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_records: {
        Row: {
          child_id: string
          id: string
          meal_type_id: string
          notes: string | null
          recorded_at: string
          recorded_by: string
          recorded_date: string
          status: Database["public"]["Enums"]["meal_status"]
        }
        Insert: {
          child_id: string
          id?: string
          meal_type_id: string
          notes?: string | null
          recorded_at?: string
          recorded_by: string
          recorded_date?: string
          status: Database["public"]["Enums"]["meal_status"]
        }
        Update: {
          child_id?: string
          id?: string
          meal_type_id?: string
          notes?: string | null
          recorded_at?: string
          recorded_by?: string
          recorded_date?: string
          status?: Database["public"]["Enums"]["meal_status"]
        }
        Relationships: [
          {
            foreignKeyName: "meal_records_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_meal_type_id_fkey"
            columns: ["meal_type_id"]
            isOneToOne: false
            referencedRelation: "meal_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_types: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          school_id: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          school_id: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          school_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "meal_types_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          dessert: string | null
          first_course: string
          id: string
          salad: string | null
          second_course: string
          side: string | null
          type: string
        }
        Insert: {
          dessert?: string | null
          first_course: string
          id?: string
          salad?: string | null
          second_course: string
          side?: string | null
          type: string
        }
        Update: {
          dessert?: string | null
          first_course?: string
          id?: string
          salad?: string | null
          second_course?: string
          side?: string | null
          type?: string
        }
        Relationships: []
      }
      menus_schools: {
        Row: {
          date: string
          menu_id: string
          school_id: string
        }
        Insert: {
          date?: string
          menu_id: string
          school_id: string
        }
        Update: {
          date?: string
          menu_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_schools_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      monitors: {
        Row: {
          code: number
          created_at: string | null
          first_name: string
          id: string
          last_name: string
          school_id: string
          user_id: string | null
        }
        Insert: {
          code: number
          created_at?: string | null
          first_name: string
          id?: string
          last_name: string
          school_id: string
          user_id?: string | null
        }
        Update: {
          code?: number
          created_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
          school_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "monitors_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      monitors_schools: {
        Row: {
          monitor_id: string
          school_id: string
        }
        Insert: {
          monitor_id: string
          school_id: string
        }
        Update: {
          monitor_id?: string
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "monitors_schools_monitor_id_fkey"
            columns: ["monitor_id"]
            isOneToOne: false
            referencedRelation: "monitors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monitors_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      parents_children: {
        Row: {
          child_id: string
          parent_id: string
        }
        Insert: {
          child_id: string
          parent_id: string
        }
        Update: {
          child_id?: string
          parent_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "parents_children_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_children_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          id: string
          name: string
        }
        Insert: {
          id?: string
          name: string
        }
        Update: {
          id?: string
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          active: boolean
          created_at: string | null
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          full_name?: string | null
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
        }
        Update: {
          active?: boolean
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_device: {
        Args: { p_code: string; p_device_identifier: string }
        Returns: Json
      }
      create_monitor: {
        Args: {
          p_code: number
          p_first_name: string
          p_last_name: string
          p_school_id: string
        }
        Returns: Json
      }
      current_school_id: { Args: never; Returns: string }
      current_user_active: { Args: never; Returns: boolean }
      current_user_id: { Args: never; Returns: string }
      current_user_role: { Args: never; Returns: string }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      get_device_monitors: {
        Args: { p_device_identifier: string }
        Returns: Json
      }
      record_meal_incident: {
        Args: {
          p_child_id: string
          p_description: string
          p_meal_type_id: string
          p_monitor_id: string
          p_notes: string
          p_recorded_at: string
          p_recorded_date: string
          p_status: Database["public"]["Enums"]["meal_status"]
        }
        Returns: {
          child_id: string
          id: string
          meal_type_id: string
          notes: string | null
          recorded_at: string
          recorded_by: string
          recorded_date: string
          status: Database["public"]["Enums"]["meal_status"]
        }
        SetofOptions: {
          from: "*"
          to: "meal_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      meal_status: "bien" | "regular" | "mal"
      user_role: "admin" | "monitor" | "padre"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      meal_status: ["bien", "regular", "mal"],
      user_role: ["admin", "monitor", "padre"],
    },
  },
} as const

