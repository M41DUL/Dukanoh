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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string | null
          email: string
          handled_at: string | null
          handled_note: string | null
          id: string
          message: string | null
          name: string
          status: string
        }
        Insert: {
          created_at?: string | null
          email: string
          handled_at?: string | null
          handled_note?: string | null
          id?: string
          message?: string | null
          name: string
          status?: string
        }
        Update: {
          created_at?: string | null
          email?: string
          handled_at?: string | null
          handled_note?: string | null
          id?: string
          message?: string | null
          name?: string
          status?: string
        }
        Relationships: []
      }
      admin_compliance_log: {
        Row: {
          confirmed_at: string
          id: string
          rules_summary: string
        }
        Insert: {
          confirmed_at?: string
          id?: string
          rules_summary: string
        }
        Update: {
          confirmed_at?: string
          id?: string
          rules_summary?: string
        }
        Relationships: []
      }
      admin_dispute_log: {
        Row: {
          action: string
          id: string
          order_id: string
          resolved_at: string
        }
        Insert: {
          action: string
          id?: string
          order_id: string
          resolved_at?: string
        }
        Update: {
          action?: string
          id?: string
          order_id?: string
          resolved_at?: string
        }
        Relationships: []
      }
      admin_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string
          id: string
          receipt_url: string | null
          recurring_id: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          date: string
          description: string
          id?: string
          receipt_url?: string | null
          recurring_id?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string
          id?: string
          receipt_url?: string | null
          recurring_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_expenses_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "admin_recurring_expenses"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_login_attempts: {
        Row: {
          attempted_at: string
          id: string
          ip: string
        }
        Insert: {
          attempted_at?: string
          id?: string
          ip: string
        }
        Update: {
          attempted_at?: string
          id?: string
          ip?: string
        }
        Relationships: []
      }
      admin_recurring_expenses: {
        Row: {
          active: boolean
          amount: number
          category: string
          created_at: string
          day_of_month: number
          description: string
          id: string
          last_generated_ym: string | null
          receipt_url: string | null
        }
        Insert: {
          active?: boolean
          amount: number
          category: string
          created_at?: string
          day_of_month: number
          description: string
          id?: string
          last_generated_ym?: string | null
          receipt_url?: string | null
        }
        Update: {
          active?: boolean
          amount?: number
          category?: string
          created_at?: string
          day_of_month?: number
          description?: string
          id?: string
          last_generated_ym?: string | null
          receipt_url?: string | null
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip: string | null
          revoked_at: string | null
          token_hash: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          ip?: string | null
          revoked_at?: string | null
          token_hash: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip?: string | null
          revoked_at?: string | null
          token_hash?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      app_error_issues: {
        Row: {
          affected_user_count: number
          any_fatal: boolean
          app_versions: string[]
          created_at: string
          error_message: string | null
          event_count: number
          fingerprint: string
          first_seen: string | null
          last_seen: string | null
          latest_symbolicated_trace: string | null
          latest_symbolicated_version: string | null
          notes: string | null
          platforms: string[]
          resolved_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          affected_user_count?: number
          any_fatal?: boolean
          app_versions?: string[]
          created_at?: string
          error_message?: string | null
          event_count?: number
          fingerprint: string
          first_seen?: string | null
          last_seen?: string | null
          latest_symbolicated_trace?: string | null
          latest_symbolicated_version?: string | null
          notes?: string | null
          platforms?: string[]
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          affected_user_count?: number
          any_fatal?: boolean
          app_versions?: string[]
          created_at?: string
          error_message?: string | null
          event_count?: number
          fingerprint?: string
          first_seen?: string | null
          last_seen?: string | null
          latest_symbolicated_trace?: string | null
          latest_symbolicated_version?: string | null
          notes?: string | null
          platforms?: string[]
          resolved_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_errors: {
        Row: {
          app_version: string | null
          created_at: string | null
          error_message: string
          fingerprint: string | null
          id: string
          is_fatal: boolean | null
          os_version: string | null
          platform: string | null
          search_tsv: unknown
          stack_trace: string | null
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          created_at?: string | null
          error_message: string
          fingerprint?: string | null
          id?: string
          is_fatal?: boolean | null
          os_version?: string | null
          platform?: string | null
          search_tsv?: unknown
          stack_trace?: string | null
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          created_at?: string | null
          error_message?: string
          fingerprint?: string | null
          id?: string
          is_fatal?: boolean | null
          os_version?: string | null
          platform?: string | null
          search_tsv?: unknown
          stack_trace?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_errors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      app_stories: {
        Row: {
          body: string | null
          created_at: string
          created_by: string | null
          cta_destination: string | null
          cta_label: string | null
          cta_listing_id: string | null
          expires_at: string | null
          headline: string | null
          id: string
          image_url: string | null
          published_at: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          cta_destination?: string | null
          cta_label?: string | null
          cta_listing_id?: string | null
          expires_at?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          published_at?: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string | null
          cta_destination?: string | null
          cta_label?: string | null
          cta_listing_id?: string | null
          expires_at?: string | null
          headline?: string | null
          id?: string
          image_url?: string | null
          published_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_stories_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "app_stories_cta_listing_id_fkey"
            columns: ["cta_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_users_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_users_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      boosts: {
        Row: {
          amount_paid: number | null
          boosted_at: string | null
          expires_at: string
          id: string
          listing_id: string
          seller_id: string
        }
        Insert: {
          amount_paid?: number | null
          boosted_at?: string | null
          expires_at: string
          id?: string
          listing_id: string
          seller_id: string
        }
        Update: {
          amount_paid?: number | null
          boosted_at?: string | null
          expires_at?: string
          id?: string
          listing_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "boosts_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "boosts_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          audience_active_days: number | null
          audience_role: string | null
          audience_tier: string | null
          body: string
          created_at: string
          deep_link_destination: string | null
          deep_link_listing_id: string | null
          error_message: string | null
          id: string
          recipient_count: number
          sent_at: string | null
          sent_by: string | null
          status: string
          title: string
        }
        Insert: {
          audience_active_days?: number | null
          audience_role?: string | null
          audience_tier?: string | null
          body: string
          created_at?: string
          deep_link_destination?: string | null
          deep_link_listing_id?: string | null
          error_message?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_by?: string | null
          status: string
          title: string
        }
        Update: {
          audience_active_days?: number | null
          audience_role?: string | null
          audience_tier?: string | null
          body?: string
          created_at?: string
          deep_link_destination?: string | null
          deep_link_listing_id?: string | null
          error_message?: string | null
          id?: string
          recipient_count?: number
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcasts_deep_link_listing_id_fkey"
            columns: ["deep_link_listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "broadcasts_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cancellation_strikes: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          seller_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          seller_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancellation_strikes_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cancellation_strikes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string | null
          id: string
          name: string
          seller_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          seller_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          seller_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "collections_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          buyer_id: string
          created_at: string | null
          deleted_by_buyer: boolean
          deleted_by_seller: boolean
          id: string
          last_message: string | null
          last_message_sender_id: string | null
          listing_id: string
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          deleted_by_buyer?: boolean
          deleted_by_seller?: boolean
          id?: string
          last_message?: string | null
          last_message_sender_id?: string | null
          listing_id: string
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          deleted_by_buyer?: boolean
          deleted_by_seller?: boolean
          id?: string
          last_message?: string | null
          last_message_sender_id?: string | null
          listing_id?: string
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_last_message_sender_id_fkey"
            columns: ["last_message_sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      deletion_failures: {
        Row: {
          error: string
          id: string
          occurred_at: string | null
          step: string
          user_id: string | null
        }
        Insert: {
          error: string
          id?: string
          occurred_at?: string | null
          step: string
          user_id?: string | null
        }
        Update: {
          error?: string
          id?: string
          occurred_at?: string | null
          step?: string
          user_id?: string | null
        }
        Relationships: []
      }
      deletion_feedback: {
        Row: {
          id: string
          occurred_at: string | null
          reason_code: string
          reason_text: string | null
        }
        Insert: {
          id?: string
          occurred_at?: string | null
          reason_code: string
          reason_text?: string | null
        }
        Update: {
          id?: string
          occurred_at?: string | null
          reason_code?: string
          reason_text?: string | null
        }
        Relationships: []
      }
      dispute_evidence: {
        Row: {
          created_at: string | null
          id: string
          image_url: string
          order_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url: string
          order_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string
          order_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dispute_evidence_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispute_evidence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          last_reply_at: string | null
          message: string
          name: string | null
          source: string
          status: string
          type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_reply_at?: string | null
          message: string
          name?: string | null
          source?: string
          status?: string
          type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          last_reply_at?: string | null
          message?: string
          name?: string | null
          source?: string
          status?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_replies: {
        Row: {
          body_html: string | null
          body_text: string | null
          created_at: string | null
          direction: string
          feedback_id: string
          id: string
          resend_id: string | null
          sender_email: string
          sender_name: string | null
          subject: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          direction: string
          feedback_id: string
          id?: string
          resend_id?: string | null
          sender_email: string
          sender_name?: string | null
          subject?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string | null
          created_at?: string | null
          direction?: string
          feedback_id?: string
          id?: string
          resend_id?: string | null
          sender_email?: string
          sender_name?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_replies_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      fit_search_logs: {
        Row: {
          id: string
          searched_at: string
          user_id: string
        }
        Insert: {
          id?: string
          searched_at?: string
          user_id: string
        }
        Update: {
          id?: string
          searched_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fit_search_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fit_training_images: {
        Row: {
          category: string
          created_at: string
          id: string
          s3_key: string
        }
        Insert: {
          category: string
          created_at?: string
          id?: string
          s3_key: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          s3_key?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          id: string
          is_used: boolean | null
          used_at: string | null
          used_by: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_used?: boolean | null
          used_at?: string | null
          used_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_used_by_fkey"
            columns: ["used_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_price_history: {
        Row: {
          changed_at: string | null
          id: string
          listing_id: string | null
          new_price: number
          old_price: number
        }
        Insert: {
          changed_at?: string | null
          id?: string
          listing_id?: string | null
          new_price: number
          old_price: number
        }
        Update: {
          changed_at?: string | null
          id?: string
          listing_id?: string | null
          new_price?: number
          old_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "listing_price_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
        ]
      }
      listing_views: {
        Row: {
          id: string
          listing_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          listing_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          listing_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listing_views_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listing_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          boost_expires_at: string | null
          buyer_id: string | null
          category: string
          collection_id: string | null
          colour: string | null
          condition: string
          created_at: string | null
          description: string | null
          fabric: string | null
          gender: string
          id: string
          images: string[] | null
          is_boosted: boolean | null
          measurements: Json | null
          occasion: string | null
          original_price: number | null
          price: number
          price_dropped_at: string | null
          published_at: string | null
          save_count: number
          seller_id: string
          size: string | null
          sold_at: string | null
          status: string | null
          title: string
          view_count: number | null
          worn_at: string | null
        }
        Insert: {
          boost_expires_at?: string | null
          buyer_id?: string | null
          category: string
          collection_id?: string | null
          colour?: string | null
          condition: string
          created_at?: string | null
          description?: string | null
          fabric?: string | null
          gender?: string
          id?: string
          images?: string[] | null
          is_boosted?: boolean | null
          measurements?: Json | null
          occasion?: string | null
          original_price?: number | null
          price: number
          price_dropped_at?: string | null
          published_at?: string | null
          save_count?: number
          seller_id: string
          size?: string | null
          sold_at?: string | null
          status?: string | null
          title: string
          view_count?: number | null
          worn_at?: string | null
        }
        Update: {
          boost_expires_at?: string | null
          buyer_id?: string | null
          category?: string
          collection_id?: string | null
          colour?: string | null
          condition?: string
          created_at?: string | null
          description?: string | null
          fabric?: string | null
          gender?: string
          id?: string
          images?: string[] | null
          is_boosted?: boolean | null
          measurements?: Json | null
          occasion?: string | null
          original_price?: number | null
          price?: number
          price_dropped_at?: string | null
          published_at?: string | null
          save_count?: number
          seller_id?: string
          size?: string | null
          sold_at?: string | null
          status?: string | null
          title?: string
          view_count?: number | null
          worn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "listings_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          listing_id: string | null
          receiver_id: string
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          receiver_id: string
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          listing_id?: string | null
          receiver_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string | null
          id: string
          listing_id: string | null
          read: boolean | null
          title: string
          type: string
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          read?: boolean | null
          title: string
          type: string
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          read?: boolean | null
          title?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          appeal_by: string | null
          appeal_deadline_at: string | null
          appeal_reason: string | null
          appealed_at: string | null
          auto_release_at: string | null
          buyer_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          completed_at: string | null
          courier: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_address_line1: string | null
          delivery_address_line2: string | null
          delivery_city: string | null
          delivery_country: string | null
          delivery_postcode: string | null
          dispatch_deadline_at: string | null
          dispute_description: string | null
          dispute_reason: string | null
          disputed_at: string | null
          funds_available_on: string | null
          id: string
          is_destination_charge: boolean
          item_price: number
          listing_id: string | null
          protection_fee: number
          resolution_note: string | null
          resolution_outcome: string | null
          resolved_at: string | null
          seller_id: string | null
          seller_verify_deadline: string | null
          shipped_at: string | null
          status: string
          stripe_payment_id: string | null
          total_paid: number
          tracking_number: string | null
          wallet_released_at: string | null
        }
        Insert: {
          appeal_by?: string | null
          appeal_deadline_at?: string | null
          appeal_reason?: string | null
          appealed_at?: string | null
          auto_release_at?: string | null
          buyer_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          courier?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_city?: string | null
          delivery_country?: string | null
          delivery_postcode?: string | null
          dispatch_deadline_at?: string | null
          dispute_description?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          funds_available_on?: string | null
          id?: string
          is_destination_charge?: boolean
          item_price: number
          listing_id?: string | null
          protection_fee: number
          resolution_note?: string | null
          resolution_outcome?: string | null
          resolved_at?: string | null
          seller_id?: string | null
          seller_verify_deadline?: string | null
          shipped_at?: string | null
          status?: string
          stripe_payment_id?: string | null
          total_paid: number
          tracking_number?: string | null
          wallet_released_at?: string | null
        }
        Update: {
          appeal_by?: string | null
          appeal_deadline_at?: string | null
          appeal_reason?: string | null
          appealed_at?: string | null
          auto_release_at?: string | null
          buyer_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          completed_at?: string | null
          courier?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_address_line1?: string | null
          delivery_address_line2?: string | null
          delivery_city?: string | null
          delivery_country?: string | null
          delivery_postcode?: string | null
          dispatch_deadline_at?: string | null
          dispute_description?: string | null
          dispute_reason?: string | null
          disputed_at?: string | null
          funds_available_on?: string | null
          id?: string
          is_destination_charge?: boolean
          item_price?: number
          listing_id?: string | null
          protection_fee?: number
          resolution_note?: string | null
          resolution_outcome?: string | null
          resolved_at?: string | null
          seller_id?: string | null
          seller_verify_deadline?: string | null
          shipped_at?: string | null
          status?: string
          stripe_payment_id?: string | null
          total_paid?: number
          tracking_number?: string | null
          wallet_released_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_ledger: {
        Row: {
          amount: number
          created_at: string | null
          fee_type: string
          id: string
          order_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          fee_type?: string
          id?: string
          order_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          fee_type?: string
          id?: string
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      profile_views: {
        Row: {
          id: string
          profile_user_id: string | null
          viewed_at: string | null
          viewer_user_id: string | null
        }
        Insert: {
          id?: string
          profile_user_id?: string | null
          viewed_at?: string | null
          viewer_user_id?: string | null
        }
        Update: {
          id?: string
          profile_user_id?: string | null
          viewed_at?: string | null
          viewer_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profile_views_profile_user_id_fkey"
            columns: ["profile_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_views_viewer_user_id_fkey"
            columns: ["viewer_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          token: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          token: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          token?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          reason: string
          reporter_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          seller_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          reason: string
          reporter_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          reason?: string
          reporter_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          seller_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          comment: string | null
          created_at: string | null
          id: string
          listing_id: string
          rating: number
          reviewer_id: string
          seller_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string | null
          id?: string
          listing_id: string
          rating: number
          reviewer_id: string
          seller_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string
          rating?: number
          reviewer_id?: string
          seller_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_items: {
        Row: {
          created_at: string | null
          id: string
          listing_id: string
          price_at_save: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          listing_id: string
          price_at_save?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          listing_id?: string
          price_at_save?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_items_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "saved_items_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      seasonal_weights: {
        Row: {
          categories: string[]
          created_at: string
          end_date: string
          id: string
          label: string
          start_date: string
          weight: number
        }
        Insert: {
          categories: string[]
          created_at?: string
          end_date: string
          id?: string
          label: string
          start_date: string
          weight?: number
        }
        Update: {
          categories?: string[]
          created_at?: string
          end_date?: string
          id?: string
          label?: string
          start_date?: string
          weight?: number
        }
        Relationships: []
      }
      seller_wallet: {
        Row: {
          available_balance: number
          id: string
          lifetime_earned: number
          pending_balance: number
          seller_id: string
          updated_at: string | null
        }
        Insert: {
          available_balance?: number
          id?: string
          lifetime_earned?: number
          pending_balance?: number
          seller_id: string
          updated_at?: string | null
        }
        Update: {
          available_balance?: number
          id?: string
          lifetime_earned?: number
          pending_balance?: number
          seller_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "seller_wallet_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      source_maps: {
        Row: {
          app_version: string
          file_size_bytes: number | null
          git_sha: string | null
          id: string
          platform: string
          storage_path: string
          uploaded_at: string
        }
        Insert: {
          app_version: string
          file_size_bytes?: number | null
          git_sha?: string | null
          id?: string
          platform: string
          storage_path: string
          uploaded_at?: string
        }
        Update: {
          app_version?: string
          file_size_bytes?: number | null
          git_sha?: string | null
          id?: string
          platform?: string
          storage_path?: string
          uploaded_at?: string
        }
        Relationships: []
      }
      story_views: {
        Row: {
          id: string
          listing_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          listing_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          listing_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "story_views_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          buyer_id: string | null
          created_at: string | null
          id: string
          listing_id: string | null
          seller_id: string | null
          stripe_payment_id: string | null
        }
        Insert: {
          amount: number
          buyer_id?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          seller_id?: string | null
          stripe_payment_id?: string | null
        }
        Update: {
          amount?: number
          buyer_id?: string | null
          created_at?: string | null
          id?: string
          listing_id?: string | null
          seller_id?: string | null
          stripe_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_buyer_id_fkey"
            columns: ["buyer_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_private: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          country: string | null
          dob: string | null
          first_name: string | null
          full_name: string
          last_name: string | null
          location: string | null
          phone: string | null
          postcode: string | null
          seller_invite_code: string | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          dob?: string | null
          first_name?: string | null
          full_name?: string
          last_name?: string | null
          location?: string | null
          phone?: string | null
          postcode?: string | null
          seller_invite_code?: string | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          country?: string | null
          dob?: string | null
          first_name?: string | null
          full_name?: string
          last_name?: string | null
          location?: string | null
          phone?: string | null
          postcode?: string | null
          seller_invite_code?: string | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_private_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_tax_info: {
        Row: {
          tax_id_number: string | null
          tax_id_type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          tax_id_number?: string | null
          tax_id_type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          tax_id_number?: string | null
          tax_id_type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tax_info_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          account_status: string
          analytics_consent: boolean
          avatar_url: string | null
          avg_response_time_mins: number | null
          bio: string | null
          boosts_reset_at: string | null
          boosts_used: number | null
          cancellation_strike_count: number
          created_at: string | null
          deleted_at: string | null
          had_founder_subscription: boolean
          had_free_trial: boolean | null
          id: string
          is_official: boolean | null
          is_seller: boolean | null
          is_verified: boolean | null
          last_active_at: string | null
          marketing_consent: boolean
          marketing_prompted_at: string | null
          marketing_push_consent: boolean
          onboarding_completed: boolean | null
          preferred_categories: string[] | null
          pro_expires_at: string | null
          rating_avg: number | null
          rating_count: number | null
          sale_mode_active: boolean | null
          sale_mode_discount_pct: number | null
          seller_tier: string | null
          tax_declaration_at: string | null
          tax_hold: boolean
          tax_id_collected_at: string | null
          username: string
          username_confirmed: boolean | null
        }
        Insert: {
          account_status?: string
          analytics_consent?: boolean
          avatar_url?: string | null
          avg_response_time_mins?: number | null
          bio?: string | null
          boosts_reset_at?: string | null
          boosts_used?: number | null
          cancellation_strike_count?: number
          created_at?: string | null
          deleted_at?: string | null
          had_founder_subscription?: boolean
          had_free_trial?: boolean | null
          id: string
          is_official?: boolean | null
          is_seller?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          marketing_consent?: boolean
          marketing_prompted_at?: string | null
          marketing_push_consent?: boolean
          onboarding_completed?: boolean | null
          preferred_categories?: string[] | null
          pro_expires_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          sale_mode_active?: boolean | null
          sale_mode_discount_pct?: number | null
          seller_tier?: string | null
          tax_declaration_at?: string | null
          tax_hold?: boolean
          tax_id_collected_at?: string | null
          username: string
          username_confirmed?: boolean | null
        }
        Update: {
          account_status?: string
          analytics_consent?: boolean
          avatar_url?: string | null
          avg_response_time_mins?: number | null
          bio?: string | null
          boosts_reset_at?: string | null
          boosts_used?: number | null
          cancellation_strike_count?: number
          created_at?: string | null
          deleted_at?: string | null
          had_founder_subscription?: boolean
          had_free_trial?: boolean | null
          id?: string
          is_official?: boolean | null
          is_seller?: boolean | null
          is_verified?: boolean | null
          last_active_at?: string | null
          marketing_consent?: boolean
          marketing_prompted_at?: string | null
          marketing_push_consent?: boolean
          onboarding_completed?: boolean | null
          preferred_categories?: string[] | null
          pro_expires_at?: string | null
          rating_avg?: number | null
          rating_count?: number | null
          sale_mode_active?: boolean | null
          sale_mode_discount_pct?: number | null
          seller_tier?: string | null
          tax_declaration_at?: string | null
          tax_hold?: boolean
          tax_id_collected_at?: string | null
          username?: string
          username_confirmed?: boolean | null
        }
        Relationships: []
      }
    }
    Views: {
      admin_boosts_summary: {
        Row: {
          active_count: number | null
          all_time_revenue: number | null
          thirty_day_count: number | null
          thirty_day_revenue: number | null
        }
        Relationships: []
      }
      admin_finance_summary: {
        Row: {
          active_escrow: number | null
          all_time_expenses: number | null
          all_time_revenue: number | null
          gmv: number | null
          mtd_expenses: number | null
          mtd_revenue: number | null
          refund_count: number | null
          refund_value: number | null
        }
        Relationships: []
      }
      admin_ledger_monthly: {
        Row: {
          month: string | null
          revenue: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      activate_seller: {
        Args: { p_code?: string; p_user_id: string }
        Returns: boolean
      }
      admin_anonymize_user_account: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_check_deletion_readiness: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_count_broadcast_audience: {
        Args: { filters: Json }
        Returns: number
      }
      admin_delete_app_story: { Args: { p_id: string }; Returns: undefined }
      admin_save_app_story: { Args: { payload: Json }; Returns: string }
      admin_search_orders: {
        Args: {
          p_from?: string
          p_limit?: number
          p_q?: string
          p_status?: string
          p_to?: string
        }
        Returns: {
          buyer_username: string
          cancelled_at: string
          completed_at: string
          created_at: string
          disputed_at: string
          id: string
          item_price: number
          listing_title: string
          protection_fee: number
          seller_username: string
          status: string
          total_paid: number
        }[]
      }
      admin_update_user_flags: {
        Args: { patch: Json; target_user_id: string }
        Returns: undefined
      }
      anonymize_user_account: { Args: never; Returns: Json }
      auto_release_orders: { Args: never; Returns: undefined }
      cancel_order: {
        Args: { p_cancelled_by: string; p_order_id: string }
        Returns: undefined
      }
      cancel_stale_pending_orders: { Args: never; Returns: undefined }
      check_deletion_readiness: { Args: never; Returns: Json }
      claim_available_balance: {
        Args: { p_seller_id: string }
        Returns: number
      }
      cleanup_abandoned_drafts: { Args: never; Returns: undefined }
      cleanup_messages: { Args: never; Returns: undefined }
      compute_error_fingerprint: {
        Args: { msg: string; stack: string }
        Returns: string
      }
      confirm_order_receipt: {
        Args: { p_buyer_id: string; p_order_id: string }
        Returns: undefined
      }
      consume_invite: { Args: { p_code: string }; Returns: boolean }
      decrement_boosts_used: { Args: { p_user_id: string }; Returns: undefined }
      expire_pro_subscriptions: { Args: never; Returns: undefined }
      find_users_by_emails: {
        Args: { p_emails: string[] }
        Returns: {
          account_status: string
          email: string
          user_id: string
          username: string
        }[]
      }
      generate_due_recurring_expenses: { Args: never; Returns: number }
      get_admin_nav_counts: {
        Args: never
        Returns: {
          account_deletion_count: number
          disputes_count: number
          feedback_count: number
          old_disputes: number
          open_errors_count: number
          reports_count: number
          stuck_paid: number
          stuck_shipped: number
        }[]
      }
      get_seller_response_rate: {
        Args: { p_seller_id: string }
        Returns: number
      }
      get_top_boosters: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          boost_count: number
          seller_id: string
          spent: number
          username: string
        }[]
      }
      increment_boosts_used: { Args: { p_user_id: string }; Returns: boolean }
      increment_pending_balance: {
        Args: { p_amount: number; p_seller_id: string }
        Returns: undefined
      }
      increment_view_count: { Args: { listing_id: string }; Returns: undefined }
      mark_order_shipped: {
        Args: {
          p_courier?: string
          p_order_id: string
          p_seller_id: string
          p_tracking: string
        }
        Returns: undefined
      }
      raise_dispute: {
        Args: { p_description: string; p_order_id: string; p_reason: string }
        Returns: undefined
      }
      record_fit_search: { Args: never; Returns: boolean }
      release_cleared_wallet_funds: { Args: never; Returns: undefined }
      restore_available_balance: {
        Args: { p_amount: number; p_seller_id: string }
        Returns: undefined
      }
      submit_order_appeal: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      withdraw_dispute: { Args: { p_order_id: string }; Returns: undefined }
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
