export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.1" };
  public: {
    Tables: {
      allergens: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: { id?: string; name?: string };
        Relationships: [];
      };
      child_allergens: {
        Row: { allergen_id: string; child_id: string };
        Insert: { allergen_id: string; child_id: string };
        Update: { allergen_id?: string; child_id?: string };
        Relationships: [
          {
            foreignKeyName: "child_allergens_allergen_id_fkey";
            columns: ["allergen_id"];
            isOneToOne: false;
            referencedRelation: "allergens";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "child_allergens_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
        ];
      };
      children: {
        Row: {
          class_id: string | null;
          created_at: string | null;
          first_name: string;
          id: string;
          last_name: string;
        };
        Insert: {
          class_id?: string | null;
          created_at?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
        };
        Update: {
          class_id?: string | null;
          created_at?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "children_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
        ];
      };
      classes: {
        Row: { id: string; name: string; school_id: string | null };
        Insert: { id?: string; name: string; school_id?: string | null };
        Update: { id?: string; name?: string; school_id?: string | null };
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      devices: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          identifier: string;
          last_seen_at: string | null;
          name: string;
          school_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          identifier: string;
          last_seen_at?: string | null;
          name: string;
          school_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          identifier?: string;
          last_seen_at?: string | null;
          name?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "devices_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      device_setup_attempts: {
        Row: {
          attempt_count: number;
          device_identifier: string;
          last_attempt_at: string;
          window_started_at: string;
        };
        Insert: {
          attempt_count?: number;
          device_identifier: string;
          last_attempt_at?: string;
          window_started_at?: string;
        };
        Update: {
          attempt_count?: number;
          device_identifier?: string;
          last_attempt_at?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      device_setup_global_attempts: {
        Row: {
          attempt_count: number;
          id: boolean;
          last_attempt_at: string;
          window_started_at: string;
        };
        Insert: {
          attempt_count?: number;
          id?: boolean;
          last_attempt_at?: string;
          window_started_at?: string;
        };
        Update: {
          attempt_count?: number;
          id?: boolean;
          last_attempt_at?: string;
          window_started_at?: string;
        };
        Relationships: [];
      };
      device_setup_codes: {
        Row: {
          active: boolean;
          code_hash: string;
          created_at: string;
          expires_at: string;
          id: string;
          last_claimed_at: string | null;
          max_uses: number;
          school_id: string;
          uses: number;
        };
        Insert: {
          active?: boolean;
          code_hash: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          last_claimed_at?: string | null;
          max_uses?: number;
          school_id: string;
          uses?: number;
        };
        Update: {
          active?: boolean;
          code_hash?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          last_claimed_at?: string | null;
          max_uses?: number;
          school_id?: string;
          uses?: number;
        };
        Relationships: [
          {
            foreignKeyName: "device_setup_codes_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      incidents: {
        Row: {
          child_id: string | null;
          created_at: string | null;
          date: string | null;
          description: string | null;
          family_responded_at: string | null;
          family_response: string | null;
          family_seen: boolean | null;
          id: string;
          monitor_id: string;
          monitor_validated: boolean | null;
          requires_family_signature: boolean | null;
          reviewed: boolean | null;
          send_notification: boolean | null;
        };
        Insert: {
          child_id?: string | null;
          created_at?: string | null;
          date?: string | null;
          description?: string | null;
          family_responded_at?: string | null;
          family_response?: string | null;
          family_seen?: boolean | null;
          id?: string;
          monitor_id: string;
          monitor_validated?: boolean | null;
          requires_family_signature?: boolean | null;
          reviewed?: boolean | null;
          send_notification?: boolean | null;
        };
        Update: {
          child_id?: string | null;
          created_at?: string | null;
          date?: string | null;
          description?: string | null;
          family_responded_at?: string | null;
          family_response?: string | null;
          family_seen?: boolean | null;
          id?: string;
          monitor_id?: string;
          monitor_validated?: boolean | null;
          requires_family_signature?: boolean | null;
          reviewed?: boolean | null;
          send_notification?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "incidents_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "incidents_monitor_id_fkey";
            columns: ["monitor_id"];
            isOneToOne: false;
            referencedRelation: "monitors";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_records: {
        Row: {
          child_id: string;
          id: string;
          meal_type_id: string;
          notes: string | null;
          recorded_date: string;
          recorded_at: string;
          recorded_by: string;
          status: Database["public"]["Enums"]["meal_status"];
        };
        Insert: {
          child_id: string;
          id?: string;
          meal_type_id: string;
          notes?: string | null;
          recorded_date?: string;
          recorded_at?: string;
          recorded_by: string;
          status: Database["public"]["Enums"]["meal_status"];
        };
        Update: {
          child_id?: string;
          id?: string;
          meal_type_id?: string;
          notes?: string | null;
          recorded_date?: string;
          recorded_at?: string;
          recorded_by?: string;
          status?: Database["public"]["Enums"]["meal_status"];
        };
        Relationships: [
          {
            foreignKeyName: "meal_records_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_records_meal_type_id_fkey";
            columns: ["meal_type_id"];
            isOneToOne: false;
            referencedRelation: "meal_types";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "meal_records_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      meal_types: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          school_id: string;
          sort_order: number;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          school_id: string;
          sort_order?: number;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          school_id?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "meal_types_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      menus: {
        Row: {
          dessert: string | null;
          first_course: string;
          id: string;
          salad: string | null;
          second_course: string;
          side: string | null;
          type: string;
        };
        Insert: {
          dessert?: string | null;
          first_course: string;
          id?: string;
          salad?: string | null;
          second_course: string;
          side?: string | null;
          type: string;
        };
        Update: {
          dessert?: string | null;
          first_course?: string;
          id?: string;
          salad?: string | null;
          second_course?: string;
          side?: string | null;
          type?: string;
        };
        Relationships: [];
      };
      menus_schools: {
        Row: { date: string; menu_id: string; school_id: string };
        Insert: { date?: string; menu_id: string; school_id: string };
        Update: { date?: string; menu_id?: string; school_id?: string };
        Relationships: [
          {
            foreignKeyName: "menus_schools_menu_id_fkey";
            columns: ["menu_id"];
            isOneToOne: false;
            referencedRelation: "menus";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "menus_schools_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      monitors: {
        Row: {
          code: number;
          created_at: string | null;
          first_name: string;
          id: string;
          last_name: string;
          school_id: string;
        };
        Insert: {
          code: number;
          created_at?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
          school_id: string;
        };
        Update: {
          code?: number;
          created_at?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "monitors_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      monitors_schools: {
        Row: { monitor_id: string; school_id: string };
        Insert: { monitor_id: string; school_id: string };
        Update: { monitor_id?: string; school_id?: string };
        Relationships: [
          {
            foreignKeyName: "monitors_schools_monitor_id_fkey";
            columns: ["monitor_id"];
            isOneToOne: false;
            referencedRelation: "monitors";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "monitors_schools_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      parents_children: {
        Row: { child_id: string; parent_id: string };
        Insert: { child_id: string; parent_id: string };
        Update: { child_id?: string; parent_id?: string };
        Relationships: [
          {
            foreignKeyName: "parents_children_child_id_fkey";
            columns: ["child_id"];
            isOneToOne: false;
            referencedRelation: "children";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "parents_children_parent_id_fkey";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      schools: {
        Row: { id: string; name: string };
        Insert: { id?: string; name: string };
        Update: { id?: string; name?: string };
        Relationships: [];
      };
      users: {
        Row: {
          active: boolean;
          created_at: string | null;
          full_name: string | null;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
          school_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string | null;
          full_name?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["user_role"];
          school_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string | null;
          full_name?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
          school_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "users_school_id_fkey";
            columns: ["school_id"];
            isOneToOne: false;
            referencedRelation: "schools";
            referencedColumns: ["id"];
          },
        ];
      };
      worker_classrooms: {
        Row: { class_id: string; created_at: string; worker_id: string };
        Insert: { class_id: string; created_at?: string; worker_id: string };
        Update: { class_id?: string; created_at?: string; worker_id?: string };
        Relationships: [
          {
            foreignKeyName: "worker_classrooms_class_id_fkey";
            columns: ["class_id"];
            isOneToOne: false;
            referencedRelation: "classes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "worker_classrooms_worker_id_fkey";
            columns: ["worker_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      current_user_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_school_id: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      current_user_active: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      claim_device_setup: {
        Args: { p_code: string; p_device_identifier: string };
        Returns: Json;
      };
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      record_meal_incident: {
        Args: {
          p_child_id: string;
          p_description: string;
          p_meal_type_id: string;
          p_monitor_id: string;
          p_notes: string | null;
          p_recorded_at: string;
          p_recorded_date: string;
          p_status: Database["public"]["Enums"]["meal_status"];
        };
        Returns: Database["public"]["Tables"]["meal_records"]["Row"];
      };
    };
    Enums: {
      meal_status: "bien" | "regular" | "mal";
      user_role: "admin" | "monitor" | "padre" | "worker" | "supervisor";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;
type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  TableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (TableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = TableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : TableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[TableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  TableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (TableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = TableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : TableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][TableNameOrOptions] extends { Insert: infer I }
      ? I
      : never
    : never;

export type TablesUpdate<
  TableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (TableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = TableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[TableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : TableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][TableNameOrOptions] extends { Update: infer U }
      ? U
      : never
    : never;

export type Enums<
  EnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (EnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[EnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = EnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[EnumNameOrOptions["schema"]]["Enums"][EnumName]
  : EnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][EnumNameOrOptions]
    : never;

export type CompositeTypes<
  CompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (CompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[CompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = CompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[CompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : CompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][CompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      meal_status: ["bien", "regular", "mal"],
      user_role: ["admin", "monitor", "padre", "worker", "supervisor"],
    },
  },
} as const;
