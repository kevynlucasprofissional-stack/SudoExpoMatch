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
      ai_runs: {
        Row: {
          actor_user_id: string | null
          cache_hit: boolean
          created_at: string
          error: string | null
          event_id: string | null
          fallback_used: boolean
          id: string
          input: Json
          input_hash: string | null
          latency_ms: number | null
          model: string | null
          output: Json
          profile_id: string | null
          prompt_version: string | null
          run_kind: string
          succeeded: boolean
          tokens_input: number | null
          tokens_output: number | null
        }
        Insert: {
          actor_user_id?: string | null
          cache_hit?: boolean
          created_at?: string
          error?: string | null
          event_id?: string | null
          fallback_used?: boolean
          id?: string
          input?: Json
          input_hash?: string | null
          latency_ms?: number | null
          model?: string | null
          output?: Json
          profile_id?: string | null
          prompt_version?: string | null
          run_kind: string
          succeeded?: boolean
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Update: {
          actor_user_id?: string | null
          cache_hit?: boolean
          created_at?: string
          error?: string | null
          event_id?: string | null
          fallback_used?: boolean
          id?: string
          input?: Json
          input_hash?: string | null
          latency_ms?: number | null
          model?: string | null
          output?: Json
          profile_id?: string | null
          prompt_version?: string | null
          run_kind?: string
          succeeded?: boolean
          tokens_input?: number | null
          tokens_output?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          actor_user_id: string | null
          created_at: string
          event_id: string | null
          id: string
          kind: string
          payload: Json
          profile_id: string | null
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind: string
          payload?: Json
          profile_id?: string | null
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          kind?: string
          payload?: Json
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          event_id: string | null
          id: string
          ip: unknown
          target_id: string | null
          target_table: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          event_id?: string | null
          id?: string
          ip?: unknown
          target_id?: string | null
          target_table: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          event_id?: string | null
          id?: string
          ip?: unknown
          target_id?: string | null
          target_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_events: {
        Row: {
          action: string
          actor_user_id: string | null
          assigned_from: string | null
          assigned_to: string | null
          connection_id: string
          created_at: string
          event_id: string
          id: string
          metadata: Json
          new_status: Database["public"]["Enums"]["connection_status"] | null
          note: string | null
          previous_status:
            | Database["public"]["Enums"]["connection_status"]
            | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          assigned_from?: string | null
          assigned_to?: string | null
          connection_id: string
          created_at?: string
          event_id: string
          id?: string
          metadata?: Json
          new_status?: Database["public"]["Enums"]["connection_status"] | null
          note?: string | null
          previous_status?:
            | Database["public"]["Enums"]["connection_status"]
            | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          assigned_from?: string | null
          assigned_to?: string | null
          connection_id?: string
          created_at?: string
          event_id?: string
          id?: string
          metadata?: Json
          new_status?: Database["public"]["Enums"]["connection_status"] | null
          note?: string | null
          previous_status?:
            | Database["public"]["Enums"]["connection_status"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "connection_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_events_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_notes: {
        Row: {
          author_user_id: string
          body: string
          connection_id: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          author_user_id: string
          body: string
          connection_id: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          connection_id?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_notes_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connection_notes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_status_history: {
        Row: {
          actor_user_id: string | null
          connection_id: string
          created_at: string
          from_status: Database["public"]["Enums"]["connection_status"] | null
          id: string
          note: string | null
          to_status: Database["public"]["Enums"]["connection_status"]
        }
        Insert: {
          actor_user_id?: string | null
          connection_id: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["connection_status"] | null
          id?: string
          note?: string | null
          to_status: Database["public"]["Enums"]["connection_status"]
        }
        Update: {
          actor_user_id?: string | null
          connection_id?: string
          created_at?: string
          from_status?: Database["public"]["Enums"]["connection_status"] | null
          id?: string
          note?: string | null
          to_status?: Database["public"]["Enums"]["connection_status"]
        }
        Relationships: [
          {
            foreignKeyName: "connection_status_history_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "connections"
            referencedColumns: ["id"]
          },
        ]
      }
      connections: {
        Row: {
          a_profile_id: string
          assigned_at: string | null
          assigned_to: string | null
          assignee_lock_version: number
          assumed_at: string | null
          b_profile_id: string
          cancelled_at: string | null
          completed_at: string | null
          contact_exchanged_at: string | null
          created_at: string
          event_id: string
          id: string
          match_id: string
          notes: string | null
          presented_at: string | null
          status: Database["public"]["Enums"]["connection_status"]
          updated_at: string
        }
        Insert: {
          a_profile_id: string
          assigned_at?: string | null
          assigned_to?: string | null
          assignee_lock_version?: number
          assumed_at?: string | null
          b_profile_id: string
          cancelled_at?: string | null
          completed_at?: string | null
          contact_exchanged_at?: string | null
          created_at?: string
          event_id: string
          id?: string
          match_id: string
          notes?: string | null
          presented_at?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Update: {
          a_profile_id?: string
          assigned_at?: string | null
          assigned_to?: string | null
          assignee_lock_version?: number
          assumed_at?: string | null
          b_profile_id?: string
          cancelled_at?: string | null
          completed_at?: string | null
          contact_exchanged_at?: string | null
          created_at?: string
          event_id?: string
          id?: string
          match_id?: string
          notes?: string | null
          presented_at?: string | null
          status?: Database["public"]["Enums"]["connection_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "connections_a_profile_id_fkey"
            columns: ["a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_b_profile_id_fkey"
            columns: ["b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "connections_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: true
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      consents: {
        Row: {
          consent_type: string
          created_at: string
          event_id: string
          granted: boolean
          id: string
          ip: unknown
          profile_id: string
          user_agent: string | null
          version: string
        }
        Insert: {
          consent_type: string
          created_at?: string
          event_id: string
          granted: boolean
          id?: string
          ip?: unknown
          profile_id: string
          user_agent?: string | null
          version?: string
        }
        Update: {
          consent_type?: string
          created_at?: string
          event_id?: string
          granted?: boolean
          id?: string
          ip?: unknown
          profile_id?: string
          user_agent?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "consents_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consents_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_staff: {
        Row: {
          created_at: string
          event_id: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_staff_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          city: string
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          name: string
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          ends_at?: string | null
          id: string
          is_active?: boolean
          name: string
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      match_decisions: {
        Row: {
          decided_at: string
          decision: Database["public"]["Enums"]["decision"]
          id: string
          match_id: string
          profile_id: string
        }
        Insert: {
          decided_at?: string
          decision: Database["public"]["Enums"]["decision"]
          id?: string
          match_id: string
          profile_id: string
        }
        Update: {
          decided_at?: string
          decision?: Database["public"]["Enums"]["decision"]
          id?: string
          match_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_decisions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_decisions_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_reasons: {
        Row: {
          code: string
          created_at: string
          id: string
          label: string
          match_id: string
          perspective_profile_id: string
          weight: number
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          label: string
          match_id: string
          perspective_profile_id: string
          weight?: number
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          label?: string
          match_id?: string
          perspective_profile_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "match_reasons_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_reasons_perspective_profile_id_fkey"
            columns: ["perspective_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      match_status_history: {
        Row: {
          actor_profile_id: string | null
          actor_user_id: string | null
          created_at: string
          event_type: string
          id: string
          match_id: string
          payload: Json
        }
        Insert: {
          actor_profile_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          match_id: string
          payload?: Json
        }
        Update: {
          actor_profile_id?: string | null
          actor_user_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          match_id?: string
          payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "match_status_history_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "matches"
            referencedColumns: ["id"]
          },
        ]
      }
      matches: {
        Row: {
          a_profile_id: string
          algorithm_version: string
          b_profile_id: string
          created_at: string
          decision_a: Database["public"]["Enums"]["decision"]
          decision_b: Database["public"]["Enums"]["decision"]
          event_id: string
          expires_at: string | null
          generated_at: string
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["match_kind"]
          label: Database["public"]["Enums"]["match_label"]
          reasons_for_a: Json
          reasons_for_b: Json
          score_for_a: number
          score_for_b: number
          updated_at: string
        }
        Insert: {
          a_profile_id: string
          algorithm_version?: string
          b_profile_id: string
          created_at?: string
          decision_a?: Database["public"]["Enums"]["decision"]
          decision_b?: Database["public"]["Enums"]["decision"]
          event_id: string
          expires_at?: string | null
          generated_at?: string
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["match_kind"]
          label: Database["public"]["Enums"]["match_label"]
          reasons_for_a?: Json
          reasons_for_b?: Json
          score_for_a?: number
          score_for_b?: number
          updated_at?: string
        }
        Update: {
          a_profile_id?: string
          algorithm_version?: string
          b_profile_id?: string
          created_at?: string
          decision_a?: Database["public"]["Enums"]["decision"]
          decision_b?: Database["public"]["Enums"]["decision"]
          event_id?: string
          expires_at?: string | null
          generated_at?: string
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["match_kind"]
          label?: Database["public"]["Enums"]["match_label"]
          reasons_for_a?: Json
          reasons_for_b?: Json
          score_for_a?: number
          score_for_b?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "matches_a_profile_id_fkey"
            columns: ["a_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_b_profile_id_fkey"
            columns: ["b_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "matches_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_needs: {
        Row: {
          active: boolean
          created_at: string
          detail: string | null
          event_id: string
          id: string
          is_priority: boolean
          label: string
          need_kind: string
          profile_id: string
          segment_id: string | null
          sort_order: number
          source: string
          taxonomy_item_id: string | null
          text: string
          updated_at: string
          user_confirmed: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          detail?: string | null
          event_id: string
          id?: string
          is_priority?: boolean
          label: string
          need_kind?: string
          profile_id: string
          segment_id?: string | null
          sort_order?: number
          source?: string
          taxonomy_item_id?: string | null
          text: string
          updated_at?: string
          user_confirmed?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          detail?: string | null
          event_id?: string
          id?: string
          is_priority?: boolean
          label?: string
          need_kind?: string
          profile_id?: string
          segment_id?: string | null
          sort_order?: number
          source?: string
          taxonomy_item_id?: string | null
          text?: string
          updated_at?: string
          user_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_needs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_needs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_needs_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_needs_taxonomy_item_id_fkey"
            columns: ["taxonomy_item_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_offers: {
        Row: {
          active: boolean
          created_at: string
          detail: string | null
          event_id: string
          id: string
          label: string
          profile_id: string
          segment_id: string | null
          sort_order: number
          source: string
          taxonomy_item_id: string | null
          text: string
          updated_at: string
          user_confirmed: boolean
        }
        Insert: {
          active?: boolean
          created_at?: string
          detail?: string | null
          event_id: string
          id?: string
          label: string
          profile_id: string
          segment_id?: string | null
          sort_order?: number
          source?: string
          taxonomy_item_id?: string | null
          text: string
          updated_at?: string
          user_confirmed?: boolean
        }
        Update: {
          active?: boolean
          created_at?: string
          detail?: string | null
          event_id?: string
          id?: string
          label?: string
          profile_id?: string
          segment_id?: string | null
          sort_order?: number
          source?: string
          taxonomy_item_id?: string | null
          text?: string
          updated_at?: string
          user_confirmed?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "profile_offers_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_offers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_offers_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_offers_taxonomy_item_id_fkey"
            columns: ["taxonomy_item_id"]
            isOneToOne: false
            referencedRelation: "taxonomy_items"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_segments: {
        Row: {
          created_at: string
          id: string
          is_primary: boolean
          profile_id: string
          segment_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_primary?: boolean
          profile_id: string
          segment_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_primary?: boolean
          profile_id?: string
          segment_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_segments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_segments_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          city: string
          company: string
          consent: boolean
          created_at: string
          event_id: string
          id: string
          is_demo: boolean
          name: string
          needs: Json
          neighborhood: string | null
          offers: Json
          owner_id: string | null
          recovery_code: string
          segment_id: string
          summary: string
          updated_at: string
          whatsapp: string
        }
        Insert: {
          city: string
          company: string
          consent?: boolean
          created_at?: string
          event_id: string
          id?: string
          is_demo?: boolean
          name: string
          needs?: Json
          neighborhood?: string | null
          offers?: Json
          owner_id?: string | null
          recovery_code: string
          segment_id: string
          summary: string
          updated_at?: string
          whatsapp: string
        }
        Update: {
          city?: string
          company?: string
          consent?: boolean
          created_at?: string
          event_id?: string
          id?: string
          is_demo?: boolean
          name?: string
          needs?: Json
          neighborhood?: string | null
          offers?: Json
          owner_id?: string | null
          recovery_code?: string
          segment_id?: string
          summary?: string
          updated_at?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
      segments: {
        Row: {
          created_at: string
          emoji: string | null
          id: string
          label: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          emoji?: string | null
          id: string
          label: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          emoji?: string | null
          id?: string
          label?: string
          sort_order?: number
        }
        Relationships: []
      }
      staff_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      taxonomy_items: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          id: string
          kind: string
          label: string
          segment_id: string | null
          slug: string
          synonyms: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          label: string
          segment_id?: string | null
          slug: string
          synonyms?: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          label?: string
          segment_id?: string | null
          slug?: string
          synonyms?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "taxonomy_items_segment_id_fkey"
            columns: ["segment_id"]
            isOneToOne: false
            referencedRelation: "segments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _recompute_matches_for_profile: {
        Args: { p_event_id: string; p_profile_id: string }
        Returns: number
      }
      admin_add_event_staff_by_email: {
        Args: {
          _email: string
          _event_id: string
          _role: Database["public"]["Enums"]["app_role"]
        }
        Returns: string
      }
      admin_change_event_staff_role: {
        Args: {
          _event_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: undefined
      }
      admin_list_event_staff: {
        Args: { _event_id: string }
        Returns: {
          created_at: string
          email: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }[]
      }
      admin_reassign_connection: {
        Args: { _connection_id: string; _new_user_id: string; _note?: string }
        Returns: undefined
      }
      admin_remove_event_staff: {
        Args: {
          _confirm_self?: boolean
          _event_id: string
          _reassign_to?: string
          _user_id: string
        }
        Returns: undefined
      }
      event_operational_stats: { Args: { _event_id: string }; Returns: Json }
      event_stats: {
        Args: { _event_id: string }
        Returns: {
          completed_connections: number
          mutual_matches: number
          total_connections: number
          total_matches: number
          total_profiles: number
          total_segments: number
        }[]
      }
      get_own_profile_v2: { Args: { _event_id: string }; Returns: Json }
      has_any_event_role: {
        Args: { _event_id: string; _user_id: string }
        Returns: boolean
      }
      has_event_role: {
        Args: {
          _event_id: string
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      hash_phone: { Args: { _phone_e164: string }; Returns: string }
      hash_recovery_code: { Args: { _code: string }; Returns: string }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      list_event_segments_and_taxonomy: {
        Args: { _event_id: string }
        Returns: Json
      }
      list_own_matches_v2: { Args: { _event_id: string }; Returns: Json }
      list_staff_connections: { Args: { _event_id: string }; Returns: Json }
      norm_label: { Args: { _s: string }; Returns: string }
      normalize_phone: { Args: { _raw: string }; Returns: string }
      recompute_matches_for_profile_id: {
        Args: { _profile_id: string }
        Returns: number
      }
      recompute_own_matches: { Args: { _event_id: string }; Returns: number }
      record_match_decision_v2: {
        Args: {
          _decision: Database["public"]["Enums"]["decision"]
          _match_id: string
        }
        Returns: Json
      }
      recover_profile_v2: {
        Args: { _code: string; _event_id: string; _phone_e164: string }
        Returns: {
          new_recovery_code: string
          profile_id: string
        }[]
      }
      reveal_contact_for_match: {
        Args: { _match_id: string }
        Returns: {
          company: string
          email: string
          name: string
          phone_e164: string
        }[]
      }
      rotate_own_recovery_code: { Args: never; Returns: string }
      save_own_profile_v2: { Args: { _payload: Json }; Returns: string }
      set_own_contact: {
        Args: { _email?: string; _phone_e164: string; _sharing?: boolean }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      slugify: { Args: { _txt: string }; Returns: string }
      staff_add_connection_note: {
        Args: { _body: string; _connection_id: string }
        Returns: string
      }
      staff_advance_connection: {
        Args: {
          _connection_id: string
          _new_status: Database["public"]["Enums"]["connection_status"]
          _note?: string
        }
        Returns: undefined
      }
      staff_assume_connection: {
        Args: { _connection_id: string }
        Returns: Json
      }
      staff_list_connection_detail: {
        Args: { _connection_id: string }
        Returns: Json
      }
      staff_list_connections_v2: {
        Args: {
          _event_id: string
          _limit?: number
          _offset?: number
          _scope?: string
          _search?: string
          _segment_ids?: string[]
          _sort?: string
          _statuses?: Database["public"]["Enums"]["connection_status"][]
        }
        Returns: Json
      }
      staff_release_connection: {
        Args: { _connection_id: string; _note?: string }
        Returns: undefined
      }
      staff_reveal_contact_for_match: {
        Args: { _match_id: string; _override_reason?: string }
        Returns: {
          company: string
          email: string
          name: string
          phone_e164: string
          profile_id: string
        }[]
      }
      taxonomy_match: {
        Args: {
          _a_label: string
          _a_tax: string
          _b_label: string
          _b_tax: string
        }
        Returns: boolean
      }
      verify_recovery_code: {
        Args: { _code: string; _hash: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "staff"
      connection_status:
        | "aguardando"
        | "em_atendimento"
        | "apresentados"
        | "contato_trocado"
        | "concluido"
        | "cancelado"
      decision: "interesse" | "agora_nao" | "sem_decisao"
      match_kind:
        | "direto"
        | "inverso"
        | "bidirecional"
        | "complementar"
        | "hibrido"
      match_label:
        | "alta_compatibilidade"
        | "boa_oportunidade"
        | "conexao_possivel"
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
    Enums: {
      app_role: ["admin", "staff"],
      connection_status: [
        "aguardando",
        "em_atendimento",
        "apresentados",
        "contato_trocado",
        "concluido",
        "cancelado",
      ],
      decision: ["interesse", "agora_nao", "sem_decisao"],
      match_kind: [
        "direto",
        "inverso",
        "bidirecional",
        "complementar",
        "hibrido",
      ],
      match_label: [
        "alta_compatibilidade",
        "boa_oportunidade",
        "conexao_possivel",
      ],
    },
  },
} as const
