// Database types — auto-generated from Supabase
// Run: supabase gen types typescript --local > src/types/database.ts
// This is a manual stub for MVP development

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          avatar_url: string | null;
          role: 'teacher' | 'parent' | 'admin';
          is_verified: boolean;
          verification_level: 'none' | 'basic' | 'full';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          phone?: string | null;
          avatar_url?: string | null;
          role?: 'teacher' | 'parent' | 'admin';
          is_verified?: boolean;
          verification_level?: 'none' | 'basic' | 'full';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          phone?: string | null;
          avatar_url?: string | null;
          role?: 'teacher' | 'parent' | 'admin';
          is_verified?: boolean;
          verification_level?: 'none' | 'basic' | 'full';
          created_at?: string;
          updated_at?: string;
        };
      };
      teacher_profiles: {
        Row: {
          id: string;
          bio: string | null;
          education: string | null;
          experience_years: number;
          teaching_style: string[] | null;
          video_intro_url: string | null;
          rating: number;
          total_reviews: number;
          total_students: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          bio?: string | null;
          education?: string | null;
          experience_years?: number;
          teaching_style?: string[] | null;
          video_intro_url?: string | null;
          rating?: number;
          total_reviews?: number;
          total_students?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          bio?: string | null;
          education?: string | null;
          experience_years?: number;
          teaching_style?: string[] | null;
          video_intro_url?: string | null;
          rating?: number;
          total_reviews?: number;
          total_students?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      centers: {
        Row: {
          id: string;
          teacher_id: string;
          name: string;
          address: string;
          subdistrict: string;
          district: string;
          province: string;
          postal_code: string;
          latitude: number | null;
          longitude: number | null;
          is_online: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          name: string;
          address: string;
          subdistrict: string;
          district: string;
          province: string;
          postal_code: string;
          latitude?: number | null;
          longitude?: number | null;
          is_online?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          name?: string;
          address?: string;
          subdistrict?: string;
          district?: string;
          province?: string;
          postal_code?: string;
          latitude?: number | null;
          longitude?: number | null;
          is_online?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      subjects: {
        Row: {
          id: string;
          name: string;
          name_en: string | null;
          category: string;
          sort_order: number;
          is_active: boolean;
        };
        Insert: {
          id?: string;
          name: string;
          name_en?: string | null;
          category: string;
          sort_order?: number;
          is_active?: boolean;
        };
        Update: {
          id?: string;
          name?: string;
          name_en?: string | null;
          category?: string;
          sort_order?: number;
          is_active?: boolean;
        };
      };
      courses: {
        Row: {
          id: string;
          teacher_id: string;
          center_id: string | null;
          subject_id: string;
          title: string;
          description: string | null;
          level: string;
          format: 'one_on_one' | 'small_group' | 'online' | 'hybrid';
          max_students: number;
          price_per_session: number;
          price_currency: string;
          duration_minutes: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          teacher_id: string;
          center_id?: string | null;
          subject_id: string;
          title: string;
          description?: string | null;
          level: string;
          format: 'one_on_one' | 'small_group' | 'online' | 'hybrid';
          max_students?: number;
          price_per_session: number;
          price_currency?: string;
          duration_minutes?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          teacher_id?: string;
          center_id?: string | null;
          subject_id?: string;
          title?: string;
          description?: string | null;
          level?: string;
          format?: 'one_on_one' | 'small_group' | 'online' | 'hybrid';
          max_students?: number;
          price_per_session?: number;
          price_currency?: string;
          duration_minutes?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      schedules: {
        Row: {
          id: string;
          course_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          start_date: string;
          end_date: string | null;
          is_recurring: boolean;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          day_of_week: number;
          start_time: string;
          end_time: string;
          start_date: string;
          end_date?: string | null;
          is_recurring?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          day_of_week?: number;
          start_time?: string;
          end_time?: string;
          start_date?: string;
          end_date?: string | null;
          is_recurring?: boolean;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      bookings: {
        Row: {
          id: string;
          course_id: string;
          parent_id: string;
          student_name: string;
          student_level: string | null;
          booking_date: string;
          start_time: string;
          end_time: string;
          status: 'pending' | 'confirmed' | 'cancelled' | 'completed';
          total_price: number;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          course_id: string;
          parent_id: string;
          student_name: string;
          student_level?: string | null;
          booking_date: string;
          start_time: string;
          end_time: string;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
          total_price: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          course_id?: string;
          parent_id?: string;
          student_name?: string;
          student_level?: string | null;
          booking_date?: string;
          start_time?: string;
          end_time?: string;
          status?: 'pending' | 'confirmed' | 'cancelled' | 'completed';
          total_price?: number;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      attendance: {
        Row: {
          id: string;
          booking_id: string;
          session_date: string;
          status: 'present' | 'absent' | 'late' | 'excused';
          check_in_time: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          session_date: string;
          status: 'present' | 'absent' | 'late' | 'excused';
          check_in_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          session_date?: string;
          status?: 'present' | 'absent' | 'late' | 'excused';
          check_in_time?: string | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      session_reports: {
        Row: {
          id: string;
          booking_id: string;
          session_date: string;
          topics_covered: string | null;
          homework: string | null;
          score: number | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          session_date: string;
          topics_covered?: string | null;
          homework?: string | null;
          score?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          session_date?: string;
          topics_covered?: string | null;
          homework?: string | null;
          score?: number | null;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      reviews: {
        Row: {
          id: string;
          booking_id: string;
          parent_id: string;
          teacher_id: string;
          rating: number;
          comment: string | null;
          is_verified: boolean;
          is_visible: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          parent_id: string;
          teacher_id: string;
          rating: number;
          comment?: string | null;
          is_verified?: boolean;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          parent_id?: string;
          teacher_id?: string;
          rating?: number;
          comment?: string | null;
          is_verified?: boolean;
          is_visible?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          booking_id: string;
          parent_id: string;
          amount: number;
          currency: string;
          method: 'promptpay' | 'credit_card' | 'truemoney' | 'bank_transfer';
          status: 'pending' | 'paid' | 'failed' | 'refunded';
          transaction_id: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          booking_id: string;
          parent_id: string;
          amount: number;
          currency?: string;
          method: 'promptpay' | 'credit_card' | 'truemoney' | 'bank_transfer';
          status?: 'pending' | 'paid' | 'failed' | 'refunded';
          transaction_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          booking_id?: string;
          parent_id?: string;
          amount?: number;
          currency?: string;
          method?: 'promptpay' | 'credit_card' | 'truemoney' | 'bank_transfer';
          status?: 'pending' | 'paid' | 'failed' | 'refunded';
          transaction_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data: Json;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: string;
          title: string;
          body: string;
          data?: Json;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: string;
          title?: string;
          body?: string;
          data?: Json;
          is_read?: boolean;
          created_at?: string;
        };
      };
    };
  };
}
