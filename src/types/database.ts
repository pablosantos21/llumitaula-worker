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
        };
        Insert: {
          code: number;
          created_at?: string | null;
          first_name: string;
          id?: string;
          last_name: string;
        };
        Update: {
          code?: number;
          created_at?: string | null;
          first_name?: string;
          id?: string;
          last_name?: string;
        };
        Relationships: [];
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
          created_at: string | null;
          id: string;
          role: Database["public"]["Enums"]["user_role"];
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          role: Database["public"]["Enums"]["user_role"];
        };
        Update: {
          created_at?: string | null;
          id?: string;
          role?: Database["public"]["Enums"]["user_role"];
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json };
      is_menu_visible_to_current_user: {
        Args: { menu_id: string };
        Returns: boolean;
      };
    };
    Enums: {
      meal_status: "bien" | "regular" | "mal";
      user_role: "admin" | "monitor" | "padre";
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
      user_role: ["admin", "monitor", "padre"],
    },
  },
} as const;
