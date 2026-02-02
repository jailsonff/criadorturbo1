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
      ai_agents: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean | null
          max_tokens: number | null
          model: string
          name: string
          provider: string
          system_prompt: string | null
          temperature: number | null
          updated_at: string
          use_case: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          model: string
          name: string
          provider: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
          use_case?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          max_tokens?: number | null
          model?: string
          name?: string
          provider?: string
          system_prompt?: string | null
          temperature?: number | null
          updated_at?: string
          use_case?: string
        }
        Relationships: []
      }
      ai_providers: {
        Row: {
          api_key_configured: boolean | null
          created_at: string
          id: string
          is_enabled: boolean | null
          name: string
          provider_key: string
          updated_at: string
        }
        Insert: {
          api_key_configured?: boolean | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          name: string
          provider_key: string
          updated_at?: string
        }
        Update: {
          api_key_configured?: boolean | null
          created_at?: string
          id?: string
          is_enabled?: boolean | null
          name?: string
          provider_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          user_id: string
        }
        Insert: {
          api_key: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          user_id: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      balance_history: {
        Row: {
          amount: number
          created_at: string
          id: string
          payment_id: string | null
          payment_method: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          payment_id?: string | null
          payment_method?: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          payment_id?: string | null
          payment_method?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      category_display_order: {
        Row: {
          category_name: string
          created_at: string
          display_order: number
          id: string
          updated_at: string
        }
        Insert: {
          category_name: string
          created_at?: string
          display_order?: number
          id?: string
          updated_at?: string
        }
        Update: {
          category_name?: string
          created_at?: string
          display_order?: number
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      category_icons: {
        Row: {
          category_name: string
          created_at: string
          icon: string
          icon_type: string
          id: string
          updated_at: string
        }
        Insert: {
          category_name: string
          created_at?: string
          icon: string
          icon_type?: string
          id?: string
          updated_at?: string
        }
        Update: {
          category_name?: string
          created_at?: string
          icon?: string
          icon_type?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      external_database_configs: {
        Row: {
          anon_key: string
          created_at: string
          id: string
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          anon_key: string
          created_at?: string
          id?: string
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          anon_key?: string
          created_at?: string
          id?: string
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_services: {
        Row: {
          created_at: string
          id: string
          service_id: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          service_id: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          service_id?: number
          user_id?: string
        }
        Relationships: []
      }
      imported_services: {
        Row: {
          average_time: string | null
          cancel: boolean | null
          category: string
          created_at: string
          description: string | null
          display_order: number | null
          dripfeed: boolean | null
          external_service_id: number
          id: string
          internal_provider_service_id: number | null
          is_active: boolean
          max: string
          min: string
          name: string
          provider_id: string
          rate: string
          refill: boolean | null
          type: string | null
          updated_at: string
        }
        Insert: {
          average_time?: string | null
          cancel?: boolean | null
          category: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          dripfeed?: boolean | null
          external_service_id: number
          id?: string
          internal_provider_service_id?: number | null
          is_active?: boolean
          max: string
          min: string
          name: string
          provider_id: string
          rate: string
          refill?: boolean | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          average_time?: string | null
          cancel?: boolean | null
          category?: string
          created_at?: string
          description?: string | null
          display_order?: number | null
          dripfeed?: boolean | null
          external_service_id?: number
          id?: string
          internal_provider_service_id?: number | null
          is_active?: boolean
          max?: string
          min?: string
          name?: string
          provider_id?: string
          rate?: string
          refill?: boolean | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imported_services_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "smm_providers"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_content: {
        Row: {
          cta_button_text: string
          cta_subtitle: string
          cta_title: string
          feature1_description: string
          feature1_icon: string
          feature1_title: string
          feature2_description: string
          feature2_icon: string
          feature2_title: string
          feature3_description: string
          feature3_icon: string
          feature3_title: string
          feature4_description: string
          feature4_icon: string
          feature4_title: string
          features_subtitle: string
          features_title: string
          features_title_highlight: string
          footer_copyright: string
          hero_badge_text: string
          hero_button_primary: string
          hero_button_secondary: string
          hero_subtitle: string
          hero_title_highlight: string
          hero_title_line1: string
          id: string
          site_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cta_button_text?: string
          cta_subtitle?: string
          cta_title?: string
          feature1_description?: string
          feature1_icon?: string
          feature1_title?: string
          feature2_description?: string
          feature2_icon?: string
          feature2_title?: string
          feature3_description?: string
          feature3_icon?: string
          feature3_title?: string
          feature4_description?: string
          feature4_icon?: string
          feature4_title?: string
          features_subtitle?: string
          features_title?: string
          features_title_highlight?: string
          footer_copyright?: string
          hero_badge_text?: string
          hero_button_primary?: string
          hero_button_secondary?: string
          hero_subtitle?: string
          hero_title_highlight?: string
          hero_title_line1?: string
          id?: string
          site_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cta_button_text?: string
          cta_subtitle?: string
          cta_title?: string
          feature1_description?: string
          feature1_icon?: string
          feature1_title?: string
          feature2_description?: string
          feature2_icon?: string
          feature2_title?: string
          feature3_description?: string
          feature3_icon?: string
          feature3_title?: string
          feature4_description?: string
          feature4_icon?: string
          feature4_title?: string
          features_subtitle?: string
          features_title?: string
          features_title_highlight?: string
          footer_copyright?: string
          hero_badge_text?: string
          hero_button_primary?: string
          hero_button_secondary?: string
          hero_subtitle?: string
          hero_title_highlight?: string
          hero_title_line1?: string
          id?: string
          site_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      orders: {
        Row: {
          charge: number | null
          created_at: string
          id: string
          link: string
          order_id: number
          quantity: number
          remains: string | null
          service_id: number
          service_name: string
          start_count: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          charge?: number | null
          created_at?: string
          id?: string
          link: string
          order_id: number
          quantity: number
          remains?: string | null
          service_id: number
          service_name: string
          start_count?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          charge?: number | null
          created_at?: string
          id?: string
          link?: string
          order_id?: number
          quantity?: number
          remains?: string | null
          service_id?: number
          service_name?: string
          start_count?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      platform_category_links: {
        Row: {
          category_name: string
          created_at: string
          id: string
          platform_id: string
        }
        Insert: {
          category_name: string
          created_at?: string
          id?: string
          platform_id: string
        }
        Update: {
          category_name?: string
          created_at?: string
          id?: string
          platform_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_category_links_platform_id_fkey"
            columns: ["platform_id"]
            isOneToOne: false
            referencedRelation: "platform_icons"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_icons: {
        Row: {
          bg_color: string
          created_at: string
          display_order: number
          icon_url: string
          id: string
          is_active: boolean
          keywords: string[]
          name: string
          updated_at: string
        }
        Insert: {
          bg_color?: string
          created_at?: string
          display_order?: number
          icon_url: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          name: string
          updated_at?: string
        }
        Update: {
          bg_color?: string
          created_at?: string
          display_order?: number
          icon_url?: string
          id?: string
          is_active?: boolean
          keywords?: string[]
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      privacy_content: {
        Row: {
          content: string
          id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          balance: number | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pwa_push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          is_active: boolean
          p256dh: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          is_active?: boolean
          p256dh: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          is_active?: boolean
          p256dh?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      refills: {
        Row: {
          created_at: string
          id: string
          link: string | null
          order_id: number
          refill_id: string | null
          service_name: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          link?: string | null
          order_id: number
          refill_id?: string | null
          service_name?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          link?: string | null
          order_id?: number
          refill_id?: string | null
          service_name?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      seo_actions: {
        Row: {
          action_type: string
          agent_id: string | null
          created_at: string
          description: string | null
          id: string
          is_enabled: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          action_type: string
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          action_type?: string
          agent_id?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_enabled?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "seo_actions_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
        ]
      }
      service_customizations: {
        Row: {
          created_at: string
          custom_average_time: string | null
          custom_description: string | null
          custom_max: string | null
          custom_min: string | null
          custom_name: string | null
          custom_rate: string | null
          id: string
          is_active: boolean | null
          service_id: number
          show_refill_button: boolean | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_average_time?: string | null
          custom_description?: string | null
          custom_max?: string | null
          custom_min?: string | null
          custom_name?: string | null
          custom_rate?: string | null
          id?: string
          is_active?: boolean | null
          service_id: number
          show_refill_button?: boolean | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_average_time?: string | null
          custom_description?: string | null
          custom_max?: string | null
          custom_min?: string | null
          custom_name?: string | null
          custom_rate?: string | null
          id?: string
          is_active?: boolean | null
          service_id?: number
          show_refill_button?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          android_apk_direct_url: string | null
          android_apk_download_url: string | null
          android_apk_url: string | null
          android_apk_version: string | null
          api_domain: string | null
          business_hours: string | null
          canonical_url: string | null
          contact_section_title: string | null
          default_order_category: string | null
          default_order_service_id: number | null
          deposit_minimum: number | null
          deposit_predefined_values: string[] | null
          favicon_url: string | null
          google_analytics_id: string | null
          id: string
          instagram_handle: string | null
          meta_keywords: string | null
          og_description: string | null
          og_image_url: string | null
          og_title: string | null
          pwa_background_color: string | null
          pwa_icon_192_url: string | null
          pwa_icon_512_url: string | null
          pwa_name: string | null
          pwa_push_enabled: boolean
          pwa_short_name: string | null
          pwa_splash_url: string | null
          pwa_theme_color: string | null
          pwa_vapid_public_key: string | null
          robots_content: string | null
          services_page_public: boolean | null
          site_description: string
          site_title: string
          store_landing_slug: string | null
          support_email: string | null
          twitter_card: string | null
          twitter_description: string | null
          twitter_title: string | null
          updated_at: string
          updated_by: string | null
          use_store_landing: boolean | null
          whatsapp_number: string | null
        }
        Insert: {
          android_apk_direct_url?: string | null
          android_apk_download_url?: string | null
          android_apk_url?: string | null
          android_apk_version?: string | null
          api_domain?: string | null
          business_hours?: string | null
          canonical_url?: string | null
          contact_section_title?: string | null
          default_order_category?: string | null
          default_order_service_id?: number | null
          deposit_minimum?: number | null
          deposit_predefined_values?: string[] | null
          favicon_url?: string | null
          google_analytics_id?: string | null
          id?: string
          instagram_handle?: string | null
          meta_keywords?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          pwa_background_color?: string | null
          pwa_icon_192_url?: string | null
          pwa_icon_512_url?: string | null
          pwa_name?: string | null
          pwa_push_enabled?: boolean
          pwa_short_name?: string | null
          pwa_splash_url?: string | null
          pwa_theme_color?: string | null
          pwa_vapid_public_key?: string | null
          robots_content?: string | null
          services_page_public?: boolean | null
          site_description?: string
          site_title?: string
          store_landing_slug?: string | null
          support_email?: string | null
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_title?: string | null
          updated_at?: string
          updated_by?: string | null
          use_store_landing?: boolean | null
          whatsapp_number?: string | null
        }
        Update: {
          android_apk_direct_url?: string | null
          android_apk_download_url?: string | null
          android_apk_url?: string | null
          android_apk_version?: string | null
          api_domain?: string | null
          business_hours?: string | null
          canonical_url?: string | null
          contact_section_title?: string | null
          default_order_category?: string | null
          default_order_service_id?: number | null
          deposit_minimum?: number | null
          deposit_predefined_values?: string[] | null
          favicon_url?: string | null
          google_analytics_id?: string | null
          id?: string
          instagram_handle?: string | null
          meta_keywords?: string | null
          og_description?: string | null
          og_image_url?: string | null
          og_title?: string | null
          pwa_background_color?: string | null
          pwa_icon_192_url?: string | null
          pwa_icon_512_url?: string | null
          pwa_name?: string | null
          pwa_push_enabled?: boolean
          pwa_short_name?: string | null
          pwa_splash_url?: string | null
          pwa_theme_color?: string | null
          pwa_vapid_public_key?: string | null
          robots_content?: string | null
          services_page_public?: boolean | null
          site_description?: string
          site_title?: string
          store_landing_slug?: string | null
          support_email?: string | null
          twitter_card?: string | null
          twitter_description?: string | null
          twitter_title?: string | null
          updated_at?: string
          updated_by?: string | null
          use_store_landing?: boolean | null
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      smm_providers: {
        Row: {
          api_key: string
          api_url: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          api_key: string
          api_url: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          api_key?: string
          api_url?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_banners: {
        Row: {
          created_at: string
          display_order: number
          frontend_id: string
          id: string
          image_url: string
          is_active: boolean
          package_id: string | null
          target_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          frontend_id: string
          id?: string
          image_url: string
          is_active?: boolean
          package_id?: string | null
          target_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          frontend_id?: string
          id?: string
          image_url?: string
          is_active?: boolean
          package_id?: string | null
          target_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_banners_frontend_id_fkey"
            columns: ["frontend_id"]
            isOneToOne: false
            referencedRelation: "store_frontends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_banners_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "store_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      store_client_error_logs: {
        Row: {
          checkout_req_id: string | null
          created_at: string
          error_json: Json | null
          event_name: string
          frontend_id: string | null
          id: string
          message: string | null
          mode: string | null
          order_id: string | null
          package_id: string | null
          phone_last4: string | null
          phone_len: number | null
          phone_masked: string | null
          source: string
          url: string | null
          user_agent: string | null
        }
        Insert: {
          checkout_req_id?: string | null
          created_at?: string
          error_json?: Json | null
          event_name?: string
          frontend_id?: string | null
          id?: string
          message?: string | null
          mode?: string | null
          order_id?: string | null
          package_id?: string | null
          phone_last4?: string | null
          phone_len?: number | null
          phone_masked?: string | null
          source?: string
          url?: string | null
          user_agent?: string | null
        }
        Update: {
          checkout_req_id?: string | null
          created_at?: string
          error_json?: Json | null
          event_name?: string
          frontend_id?: string | null
          id?: string
          message?: string | null
          mode?: string | null
          order_id?: string | null
          package_id?: string | null
          phone_last4?: string | null
          phone_len?: number | null
          phone_masked?: string | null
          source?: string
          url?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      store_customer_credits: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          note: string | null
          quantity_remaining: number
          service_id: number
          source_link: string | null
          source_order_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          note?: string | null
          quantity_remaining?: number
          service_id: number
          source_link?: string | null
          source_order_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          note?: string | null
          quantity_remaining?: number
          service_id?: number
          source_link?: string | null
          source_order_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_customer_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "store_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_customer_credits_source_order_id_fkey"
            columns: ["source_order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_customer_sessions: {
        Row: {
          created_at: string
          customer_id: string
          expires_at: string
          id: string
          phone: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          expires_at: string
          id?: string
          phone: string
          token_hash: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          expires_at?: string
          id?: string
          phone?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_customer_sessions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "store_customers"
            referencedColumns: ["id"]
          },
        ]
      }
      store_customers: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          notes: string | null
          phone: string
          pin_hash: string
          pin_salt: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          notes?: string | null
          phone: string
          pin_hash: string
          pin_salt: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          notes?: string | null
          phone?: string
          pin_hash?: string
          pin_salt?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_frontends: {
        Row: {
          created_at: string
          cta_subtitle: string | null
          cta_title: string | null
          id: string
          is_active: boolean | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_subtitle?: string | null
          cta_title?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_subtitle?: string | null
          cta_title?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_menu_banners: {
        Row: {
          created_at: string
          display_order: number
          frontend_id: string
          id: string
          image_url: string
          is_active: boolean
          package_id: string | null
          target_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          frontend_id: string
          id?: string
          image_url: string
          is_active?: boolean
          package_id?: string | null
          target_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          frontend_id?: string
          id?: string
          image_url?: string
          is_active?: boolean
          package_id?: string | null
          target_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_menu_banners_frontend_id_fkey"
            columns: ["frontend_id"]
            isOneToOne: false
            referencedRelation: "store_frontends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_menu_banners_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "store_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      store_order_links: {
        Row: {
          created_at: string
          id: string
          normalized_link: string
          order_id: string
          service_id: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          normalized_link: string
          order_id: string
          service_id: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          normalized_link?: string
          order_id?: string
          service_id?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_order_links_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "store_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      store_orders: {
        Row: {
          created_at: string
          customer_id: string | null
          external_order_id: number | null
          external_order_ids: Json | null
          frontend_id: string | null
          id: string
          link: string
          order_payload: Json | null
          order_status: string | null
          package_id: string | null
          payment_id: string | null
          payment_status: string | null
          phone: string
          quantity: number
          remains: string | null
          service_name: string | null
          start_count: string | null
          total_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id?: string | null
          external_order_id?: number | null
          external_order_ids?: Json | null
          frontend_id?: string | null
          id?: string
          link: string
          order_payload?: Json | null
          order_status?: string | null
          package_id?: string | null
          payment_id?: string | null
          payment_status?: string | null
          phone: string
          quantity: number
          remains?: string | null
          service_name?: string | null
          start_count?: string | null
          total_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string | null
          external_order_id?: number | null
          external_order_ids?: Json | null
          frontend_id?: string | null
          id?: string
          link?: string
          order_payload?: Json | null
          order_status?: string | null
          package_id?: string | null
          payment_id?: string | null
          payment_status?: string | null
          phone?: string
          quantity?: number
          remains?: string | null
          service_name?: string | null
          start_count?: string | null
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "store_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_frontend_id_fkey"
            columns: ["frontend_id"]
            isOneToOne: false
            referencedRelation: "store_frontends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_orders_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "store_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      store_package_credits: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          package_id: string
          phone: string
          redeemed_at: string | null
          redeemed_order_id: string | null
          source_order_id: string | null
          source_payment_id: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          package_id: string
          phone: string
          redeemed_at?: string | null
          redeemed_order_id?: string | null
          source_order_id?: string | null
          source_payment_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          package_id?: string
          phone?: string
          redeemed_at?: string | null
          redeemed_order_id?: string | null
          source_order_id?: string | null
          source_payment_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      store_package_sections: {
        Row: {
          created_at: string
          display_order: number
          frontend_id: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          frontend_id?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          frontend_id?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_package_sections_frontend_id_fkey"
            columns: ["frontend_id"]
            isOneToOne: false
            referencedRelation: "store_frontends"
            referencedColumns: ["id"]
          },
        ]
      }
      store_packages: {
        Row: {
          allow_custom_quantity: boolean | null
          badge_text: string | null
          base_price: number
          base_quantity: number
          combo_items: Json | null
          cover_image_url: string | null
          created_at: string
          default_link_fields: number
          description: string | null
          display_order: number | null
          frontend_id: string | null
          hidden_from_storefront: boolean
          id: string
          is_active: boolean | null
          link_label: string | null
          link_tutorial_rules: Json
          max_quantity: number | null
          min_quantity: number | null
          name: string
          package_type: string
          predefined_quantities: Json | null
          price_per_thousand: number
          sales_count: number | null
          section_id: string | null
          service_id: number
          updated_at: string
          usage_notes: string | null
        }
        Insert: {
          allow_custom_quantity?: boolean | null
          badge_text?: string | null
          base_price?: number
          base_quantity?: number
          combo_items?: Json | null
          cover_image_url?: string | null
          created_at?: string
          default_link_fields?: number
          description?: string | null
          display_order?: number | null
          frontend_id?: string | null
          hidden_from_storefront?: boolean
          id?: string
          is_active?: boolean | null
          link_label?: string | null
          link_tutorial_rules?: Json
          max_quantity?: number | null
          min_quantity?: number | null
          name: string
          package_type?: string
          predefined_quantities?: Json | null
          price_per_thousand?: number
          sales_count?: number | null
          section_id?: string | null
          service_id: number
          updated_at?: string
          usage_notes?: string | null
        }
        Update: {
          allow_custom_quantity?: boolean | null
          badge_text?: string | null
          base_price?: number
          base_quantity?: number
          combo_items?: Json | null
          cover_image_url?: string | null
          created_at?: string
          default_link_fields?: number
          description?: string | null
          display_order?: number | null
          frontend_id?: string | null
          hidden_from_storefront?: boolean
          id?: string
          is_active?: boolean | null
          link_label?: string | null
          link_tutorial_rules?: Json
          max_quantity?: number | null
          min_quantity?: number | null
          name?: string
          package_type?: string
          predefined_quantities?: Json | null
          price_per_thousand?: number
          sales_count?: number | null
          section_id?: string | null
          service_id?: number
          updated_at?: string
          usage_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "store_packages_frontend_id_fkey"
            columns: ["frontend_id"]
            isOneToOne: false
            referencedRelation: "store_frontends"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_packages_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "store_package_sections"
            referencedColumns: ["id"]
          },
        ]
      }
      store_payment_intents: {
        Row: {
          created_at: string
          id: string
          order_id: string | null
          package_id: string
          payment_id: string
          payment_provider: string
          phone: string
          total_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id?: string | null
          package_id: string
          payment_id: string
          payment_provider?: string
          phone: string
          total_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string | null
          package_id?: string
          payment_id?: string
          payment_provider?: string
          phone?: string
          total_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      store_popup_hotspots: {
        Row: {
          action_type: string
          created_at: string
          display_order: number
          h_pct: number
          id: string
          is_active: boolean
          package_id: string | null
          popup_id: string
          target_url: string | null
          title: string | null
          updated_at: string
          w_pct: number
          x_pct: number
          y_pct: number
        }
        Insert: {
          action_type?: string
          created_at?: string
          display_order?: number
          h_pct?: number
          id?: string
          is_active?: boolean
          package_id?: string | null
          popup_id: string
          target_url?: string | null
          title?: string | null
          updated_at?: string
          w_pct?: number
          x_pct?: number
          y_pct?: number
        }
        Update: {
          action_type?: string
          created_at?: string
          display_order?: number
          h_pct?: number
          id?: string
          is_active?: boolean
          package_id?: string | null
          popup_id?: string
          target_url?: string | null
          title?: string | null
          updated_at?: string
          w_pct?: number
          x_pct?: number
          y_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "store_popup_hotspots_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "store_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_popup_hotspots_popup_id_fkey"
            columns: ["popup_id"]
            isOneToOne: false
            referencedRelation: "store_popups"
            referencedColumns: ["id"]
          },
        ]
      }
      store_popups: {
        Row: {
          created_at: string
          delay_ms: number
          dismiss_ttl_hours: number
          ends_at: string | null
          frequency: string
          frontend_id: string | null
          id: string
          image_url: string
          is_active: boolean
          name: string
          priority: number
          starts_at: string | null
          timezone: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          delay_ms?: number
          dismiss_ttl_hours?: number
          ends_at?: string | null
          frequency?: string
          frontend_id?: string | null
          id?: string
          image_url: string
          is_active?: boolean
          name?: string
          priority?: number
          starts_at?: string | null
          timezone?: string
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          delay_ms?: number
          dismiss_ttl_hours?: number
          ends_at?: string | null
          frequency?: string
          frontend_id?: string | null
          id?: string
          image_url?: string
          is_active?: boolean
          name?: string
          priority?: number
          starts_at?: string | null
          timezone?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          admin_response: string | null
          created_at: string
          id: string
          message: string
          order_id: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          id?: string
          message: string
          order_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          id?: string
          message?: string
          order_id?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      terms_content: {
        Row: {
          content: string
          id: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          created_at: string
          id: string
          message: string
          sender_type: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          sender_type: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          sender_type?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _normalize_order_link: { Args: { input: string }; Returns: string }
      cleanup_expired_store_customer_sessions: {
        Args: never
        Returns: undefined
      }
      cleanup_store_client_error_logs: {
        Args: { retention_days: number }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_package_sales: {
        Args: { package_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      ticket_status: "open" | "in_progress" | "resolved"
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
      app_role: ["admin", "moderator", "user"],
      ticket_status: ["open", "in_progress", "resolved"],
    },
  },
} as const
