export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.1';
  };
  public: {
    Tables: {
      accounts: {
        Row: {
          access_token: string | null;
          created_at: string;
          expires_at: number | null;
          id: string;
          id_token: string | null;
          provider: string;
          provider_account_id: string;
          refresh_token: string | null;
          scope: string | null;
          token_type: string | null;
          type: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          access_token?: string | null;
          created_at?: string;
          expires_at?: number | null;
          id?: string;
          id_token?: string | null;
          provider: string;
          provider_account_id: string;
          refresh_token?: string | null;
          scope?: string | null;
          token_type?: string | null;
          type?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          access_token?: string | null;
          created_at?: string;
          expires_at?: number | null;
          id?: string;
          id_token?: string | null;
          provider?: string;
          provider_account_id?: string;
          refresh_token?: string | null;
          scope?: string | null;
          token_type?: string | null;
          type?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      award_movies: {
        Row: {
          award_label: string;
          award_name: string;
          award_year: number;
          category: string;
          created_at: string;
          display_order: number;
          generated_at: string;
          genre_ids: number[] | null;
          id: string;
          is_winner: boolean;
          person_name: string | null;
          poster_path: string | null;
          release_date: string | null;
          title: string;
          tmdb_movie_id: number;
          vote_average: number | null;
        };
        Insert: {
          award_label: string;
          award_name: string;
          award_year: number;
          category: string;
          created_at?: string;
          display_order?: number;
          generated_at?: string;
          genre_ids?: number[] | null;
          id?: string;
          is_winner?: boolean;
          person_name?: string | null;
          poster_path?: string | null;
          release_date?: string | null;
          title: string;
          tmdb_movie_id: number;
          vote_average?: number | null;
        };
        Update: {
          award_label?: string;
          award_name?: string;
          award_year?: number;
          category?: string;
          created_at?: string;
          display_order?: number;
          generated_at?: string;
          genre_ids?: number[] | null;
          id?: string;
          is_winner?: boolean;
          person_name?: string | null;
          poster_path?: string | null;
          release_date?: string | null;
          title?: string;
          tmdb_movie_id?: number;
          vote_average?: number | null;
        };
        Relationships: [];
      };
      dismissed_movies: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          genre_ids: number[] | null;
          id: string;
          poster_path: string | null;
          title: string;
          tmdb_movie_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          genre_ids?: number[] | null;
          id?: string;
          poster_path?: string | null;
          title: string;
          tmdb_movie_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          genre_ids?: number[] | null;
          id?: string;
          poster_path?: string | null;
          title?: string;
          tmdb_movie_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'dismissed_movies_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      favorites: {
        Row: {
          added_at: string;
          deleted_at: string | null;
          id: string;
          poster_path: string | null;
          rating: number;
          release_date: string | null;
          title: string;
          tmdb_movie_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          deleted_at?: string | null;
          id?: string;
          poster_path?: string | null;
          rating: number;
          release_date?: string | null;
          title: string;
          tmdb_movie_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          added_at?: string;
          deleted_at?: string | null;
          id?: string;
          poster_path?: string | null;
          rating?: number;
          release_date?: string | null;
          title?: string;
          tmdb_movie_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      movie_cache: {
        Row: {
          backdrop_path: string | null;
          cached_at: string;
          genre_ids: Json | null;
          id: number;
          is_now_playing: boolean;
          is_revival: boolean;
          overview: string | null;
          popularity: number | null;
          poster_path: string | null;
          release_date: string | null;
          release_type: string;
          title: string;
          updated_at: string;
          vote_average: number | null;
        };
        Insert: {
          backdrop_path?: string | null;
          cached_at?: string;
          genre_ids?: Json | null;
          id: number;
          is_now_playing?: boolean;
          is_revival?: boolean;
          overview?: string | null;
          popularity?: number | null;
          poster_path?: string | null;
          release_date?: string | null;
          release_type?: string;
          title: string;
          updated_at?: string;
          vote_average?: number | null;
        };
        Update: {
          backdrop_path?: string | null;
          cached_at?: string;
          genre_ids?: Json | null;
          id?: number;
          is_now_playing?: boolean;
          is_revival?: boolean;
          overview?: string | null;
          popularity?: number | null;
          poster_path?: string | null;
          release_date?: string | null;
          release_type?: string;
          title?: string;
          updated_at?: string;
          vote_average?: number | null;
        };
        Relationships: [];
      };
      now_showing_movies: {
        Row: {
          display_order: number;
          fetched_at: string;
          id: string;
          popularity: number | null;
          poster_path: string | null;
          release_date: string | null;
          title: string;
          tmdb_movie_id: number;
          vote_average: number | null;
        };
        Insert: {
          display_order: number;
          fetched_at?: string;
          id?: string;
          popularity?: number | null;
          poster_path?: string | null;
          release_date?: string | null;
          title: string;
          tmdb_movie_id: number;
          vote_average?: number | null;
        };
        Update: {
          display_order?: number;
          fetched_at?: string;
          id?: string;
          popularity?: number | null;
          poster_path?: string | null;
          release_date?: string | null;
          title?: string;
          tmdb_movie_id?: number;
          vote_average?: number | null;
        };
        Relationships: [];
      };
      otp_codes: {
        Row: {
          action_type: string;
          attempts: number;
          code: string;
          created_at: string;
          email: string;
          expires_at: string;
          id: string;
          verified_at: string | null;
        };
        Insert: {
          action_type: string;
          attempts?: number;
          code: string;
          created_at?: string;
          email: string;
          expires_at: string;
          id?: string;
          verified_at?: string | null;
        };
        Update: {
          action_type?: string;
          attempts?: number;
          code?: string;
          created_at?: string;
          email?: string;
          expires_at?: string;
          id?: string;
          verified_at?: string | null;
        };
        Relationships: [];
      };
      rate_limits: {
        Row: {
          action_type: string;
          attempts: number;
          created_at: string;
          id: string;
          identifier: string;
          last_attempt_at: string;
          locked_until: string | null;
          updated_at: string;
        };
        Insert: {
          action_type: string;
          attempts?: number;
          created_at?: string;
          id?: string;
          identifier: string;
          last_attempt_at?: string;
          locked_until?: string | null;
          updated_at?: string;
        };
        Update: {
          action_type?: string;
          attempts?: number;
          created_at?: string;
          id?: string;
          identifier?: string;
          last_attempt_at?: string;
          locked_until?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      recommendation_refreshes: {
        Row: {
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recommendation_refreshes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      recommendations: {
        Row: {
          created_at: string;
          display_order: number;
          generated_at: string;
          genre_ids: number[] | null;
          id: string;
          poster_path: string | null;
          reason: string;
          release_date: string | null;
          title: string;
          tmdb_movie_id: number;
          user_id: string;
          vote_average: number | null;
        };
        Insert: {
          created_at?: string;
          display_order: number;
          generated_at?: string;
          genre_ids?: number[] | null;
          id?: string;
          poster_path?: string | null;
          reason: string;
          release_date?: string | null;
          title: string;
          tmdb_movie_id: number;
          user_id: string;
          vote_average?: number | null;
        };
        Update: {
          created_at?: string;
          display_order?: number;
          generated_at?: string;
          genre_ids?: number[] | null;
          id?: string;
          poster_path?: string | null;
          reason?: string;
          release_date?: string | null;
          title?: string;
          tmdb_movie_id?: number;
          user_id?: string;
          vote_average?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'recommendations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          id: string;
          rating: number;
          tmdb_movie_id: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating: number;
          tmdb_movie_id: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating?: number;
          tmdb_movie_id?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reviews_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      saved_filters: {
        Row: {
          created_at: string;
          filter_conditions: Json;
          id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          filter_conditions?: Json;
          id?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          filter_conditions?: Json;
          id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'saved_filters_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      theater_seats: {
        Row: {
          created_at: string;
          id: string;
          position_x: number;
          position_y: number;
          position_z: number;
          row_label: string;
          seat_number: number;
          seat_type: string;
          theater_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          position_x: number;
          position_y: number;
          position_z: number;
          row_label: string;
          seat_number: number;
          seat_type?: string;
          theater_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          position_x?: number;
          position_y?: number;
          position_z?: number;
          row_label?: string;
          seat_number?: number;
          seat_type?: string;
          theater_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'theater_seats_theater_id_fkey';
            columns: ['theater_id'];
            isOneToOne: false;
            referencedRelation: 'theaters';
            referencedColumns: ['id'];
          },
        ];
      };
      theater_speakers: {
        Row: {
          channel: string;
          created_at: string;
          direction_x: number;
          direction_y: number;
          direction_z: number;
          directivity_alpha: number;
          id: string;
          position_x: number;
          position_y: number;
          position_z: number;
          power_watts: number;
          theater_id: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          direction_x?: number;
          direction_y?: number;
          direction_z?: number;
          directivity_alpha?: number;
          id?: string;
          position_x: number;
          position_y: number;
          position_z: number;
          power_watts?: number;
          theater_id: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          direction_x?: number;
          direction_y?: number;
          direction_z?: number;
          directivity_alpha?: number;
          id?: string;
          position_x?: number;
          position_y?: number;
          position_z?: number;
          power_watts?: number;
          theater_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'theater_speakers_theater_id_fkey';
            columns: ['theater_id'];
            isOneToOne: false;
            referencedRelation: 'theaters';
            referencedColumns: ['id'];
          },
        ];
      };
      theaters: {
        Row: {
          audio_layout: string;
          created_at: string;
          deleted_at: string | null;
          description: string | null;
          format: string;
          id: string;
          is_active: boolean;
          name: string;
          room_depth: number;
          room_height: number;
          room_width: number;
          screen_center_x: number;
          screen_center_y: number;
          screen_center_z: number;
          screen_height: number;
          screen_width: number;
          slug: string;
          updated_at: string;
        };
        Insert: {
          audio_layout: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          format: string;
          id?: string;
          is_active?: boolean;
          name: string;
          room_depth: number;
          room_height: number;
          room_width: number;
          screen_center_x: number;
          screen_center_y: number;
          screen_center_z: number;
          screen_height: number;
          screen_width: number;
          slug: string;
          updated_at?: string;
        };
        Update: {
          audio_layout?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string | null;
          format?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          room_depth?: number;
          room_height?: number;
          room_width?: number;
          screen_center_x?: number;
          screen_center_y?: number;
          screen_center_z?: number;
          screen_height?: number;
          screen_width?: number;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      title_suggestions: {
        Row: {
          created_at: string;
          id: string;
          query_title: string;
          suggestions: Json;
        };
        Insert: {
          created_at?: string;
          id?: string;
          query_title: string;
          suggestions?: Json;
        };
        Update: {
          created_at?: string;
          id?: string;
          query_title?: string;
          suggestions?: Json;
        };
        Relationships: [];
      };
      user_preferences: {
        Row: {
          analysis_data: Json | null;
          created_at: string;
          favorite_genres: Json | null;
          id: string;
          preferred_languages: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          analysis_data?: Json | null;
          created_at?: string;
          favorite_genres?: Json | null;
          id?: string;
          preferred_languages?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          analysis_data?: Json | null;
          created_at?: string;
          favorite_genres?: Json | null;
          id?: string;
          preferred_languages?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_settings: {
        Row: {
          created_at: string;
          id: string;
          notification_enabled: boolean;
          theme: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          notification_enabled?: boolean;
          theme?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          notification_enabled?: boolean;
          theme?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          id: string;
          is_verified: boolean;
          last_login_at: string | null;
          name: string | null;
          password_changed_at: string | null;
          password_hash: string | null;
          role: string;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          id?: string;
          is_verified?: boolean;
          last_login_at?: string | null;
          name?: string | null;
          password_changed_at?: string | null;
          password_hash?: string | null;
          role?: string;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          id?: string;
          is_verified?: boolean;
          last_login_at?: string | null;
          name?: string | null;
          password_changed_at?: string | null;
          password_hash?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      watchlist: {
        Row: {
          added_at: string;
          backdrop_path: string | null;
          deleted_at: string | null;
          id: string;
          notes: string | null;
          poster_path: string | null;
          release_date: string | null;
          title: string;
          tmdb_movie_id: number;
          user_id: string;
        };
        Insert: {
          added_at?: string;
          backdrop_path?: string | null;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          poster_path?: string | null;
          release_date?: string | null;
          title: string;
          tmdb_movie_id: number;
          user_id: string;
        };
        Update: {
          added_at?: string;
          backdrop_path?: string | null;
          deleted_at?: string | null;
          id?: string;
          notes?: string | null;
          poster_path?: string | null;
          release_date?: string | null;
          title?: string;
          tmdb_movie_id?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'watchlist_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_watchlist_by_proximity: {
        Args: { p_limit: number; p_offset?: number; p_user_id: string };
        Returns: {
          added_at: string;
          id: string;
          poster_path: string;
          release_date: string;
          title: string;
          tmdb_movie_id: number;
          total_count: number;
        }[];
      };
      sync_now_showing_movies: { Args: { movies: Json }; Returns: number };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
