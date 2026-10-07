export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
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
          second_course?: string
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
      monitors: {
        Row: {
          code: number
          created_at: string | null
          first_name: string
          id: string
          last_name: string
        }
        Insert: {
          code: number
          created_at?: string | null
          first_name: string
          id?: string
          last_name: string
        }
        Update: {
          code?: number
          created_at?: string | null
          first_name?: string
          id?: string
          last_name?: string
        }
        Relationships: []
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
    }
    Enums: {
      meal_status: "todo" | "casi_todo" | "casi_nada" | "nada"
      user_role: "admin" | "monitor" | "padre"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
