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
      ai_evaluations: {
        Row: {
          application_id: string
          areas_to_review: Json | null
          cefr: string | null
          created_at: string
          error_message: string | null
          grammar_evidence: Json | null
          id: string
          overall_score: number | null
          scores: Json | null
          state: string
          strengths: Json | null
          updated_at: string
        }
        Insert: {
          application_id: string
          areas_to_review?: Json | null
          cefr?: string | null
          created_at?: string
          error_message?: string | null
          grammar_evidence?: Json | null
          id?: string
          overall_score?: number | null
          scores?: Json | null
          state?: string
          strengths?: Json | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          areas_to_review?: Json | null
          cefr?: string | null
          created_at?: string
          error_message?: string | null
          grammar_evidence?: Json | null
          id?: string
          overall_score?: number | null
          scores?: Json | null
          state?: string
          strengths?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_evaluations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          archive_reason: string | null
          archived_at: string | null
          archived_by: string | null
          callcenter_experience: boolean
          callcenter_experience_level: string
          city: string
          city_id: string | null
          city_other: string | null
          consent_at: string | null
          contact_consent: boolean
          country: string
          country_code: string | null
          created_at: string
          created_by: string | null
          eligibility_note: string | null
          eligibility_override: boolean | null
          eligibility_override_at: string | null
          eligibility_override_by: string | null
          email: string
          full_name: string
          id: string
          phone: string
          phone_country_code: string | null
          phone_e164: string | null
          source: string
          status: string
          submit_token: string
          submitted_at: string | null
          taught_children: boolean
          teaching_experience: string
          updated_at: string
        }
        Insert: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          callcenter_experience?: boolean
          callcenter_experience_level?: string
          city: string
          city_id?: string | null
          city_other?: string | null
          consent_at?: string | null
          contact_consent?: boolean
          country: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          eligibility_note?: string | null
          eligibility_override?: boolean | null
          eligibility_override_at?: string | null
          eligibility_override_by?: string | null
          email: string
          full_name: string
          id?: string
          phone: string
          phone_country_code?: string | null
          phone_e164?: string | null
          source?: string
          status?: string
          submit_token?: string
          submitted_at?: string | null
          taught_children: boolean
          teaching_experience: string
          updated_at?: string
        }
        Update: {
          archive_reason?: string | null
          archived_at?: string | null
          archived_by?: string | null
          callcenter_experience?: boolean
          callcenter_experience_level?: string
          city?: string
          city_id?: string | null
          city_other?: string | null
          consent_at?: string | null
          contact_consent?: boolean
          country?: string
          country_code?: string | null
          created_at?: string
          created_by?: string | null
          eligibility_note?: string | null
          eligibility_override?: boolean | null
          eligibility_override_at?: string | null
          eligibility_override_by?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string
          phone_country_code?: string | null
          phone_e164?: string | null
          source?: string
          status?: string
          submit_token?: string
          submitted_at?: string | null
          taught_children?: boolean
          teaching_experience?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      appointments: {
        Row: {
          application_id: string
          calendly_event_uri: string | null
          calendly_invitee_uri: string | null
          canceled_at: string | null
          candidate_timezone: string
          created_at: string
          ends_at: string
          id: string
          interviewer_id: string | null
          meeting_link: string
          notes: string | null
          reschedule_count: number
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          canceled_at?: string | null
          candidate_timezone?: string
          created_at?: string
          ends_at: string
          id?: string
          interviewer_id?: string | null
          meeting_link?: string
          notes?: string | null
          reschedule_count?: number
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          calendly_event_uri?: string | null
          calendly_invitee_uri?: string | null
          canceled_at?: string | null
          candidate_timezone?: string
          created_at?: string
          ends_at?: string
          id?: string
          interviewer_id?: string | null
          meeting_link?: string
          notes?: string | null
          reschedule_count?: number
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "interviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_role: string | null
          application_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          application_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_role?: string | null
          application_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: []
      }
      blocked_dates: {
        Row: {
          blocked_on: string
          created_at: string
          id: string
          interviewer_id: string | null
          reason: string
        }
        Insert: {
          blocked_on: string
          created_at?: string
          id?: string
          interviewer_id?: string | null
          reason?: string
        }
        Update: {
          blocked_on?: string
          created_at?: string
          id?: string
          interviewer_id?: string | null
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_dates_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "interviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      candidate_emails: {
        Row: {
          application_id: string
          body: string
          created_at: string
          error_message: string | null
          evaluation_id: string | null
          http_status: number | null
          id: string
          kind: string
          response_message: string | null
          sent_by: string | null
          status: string
          subject: string
          to_email: string
        }
        Insert: {
          application_id: string
          body: string
          created_at?: string
          error_message?: string | null
          evaluation_id?: string | null
          http_status?: number | null
          id?: string
          kind: string
          response_message?: string | null
          sent_by?: string | null
          status?: string
          subject: string
          to_email: string
        }
        Update: {
          application_id?: string
          body?: string
          created_at?: string
          error_message?: string | null
          evaluation_id?: string | null
          http_status?: number | null
          id?: string
          kind?: string
          response_message?: string | null
          sent_by?: string | null
          status?: string
          subject?: string
          to_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_emails_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "candidate_emails_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "interview_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          active: boolean
          country_code: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_code: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cities_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      countries: {
        Row: {
          active: boolean
          code: string
          created_at: string
          dial_code: string
          flag: string
          name: string
          sort_order: number
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          dial_code: string
          flag?: string
          name: string
          sort_order?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          dial_code?: string
          flag?: string
          name?: string
          sort_order?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      evaluation_audit: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          details: Json
          evaluation_id: string
          id: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          evaluation_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          details?: Json
          evaluation_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_audit_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "interview_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_jobs: {
        Row: {
          accomplishment: string
          biggest_mistake: string
          company: string
          created_at: string
          end_date: string
          evaluation_id: string
          gap_explanation: string
          hired_to_do: string
          id: string
          position: string
          rating_reason: string
          reason_for_leaving: string
          slot: number
          start_date: string
          supervisor_contact: string
          supervisor_name: string
          supervisor_rating: number | null
        }
        Insert: {
          accomplishment?: string
          biggest_mistake?: string
          company?: string
          created_at?: string
          end_date?: string
          evaluation_id: string
          gap_explanation?: string
          hired_to_do?: string
          id?: string
          position?: string
          rating_reason?: string
          reason_for_leaving?: string
          slot?: number
          start_date?: string
          supervisor_contact?: string
          supervisor_name?: string
          supervisor_rating?: number | null
        }
        Update: {
          accomplishment?: string
          biggest_mistake?: string
          company?: string
          created_at?: string
          end_date?: string
          evaluation_id?: string
          gap_explanation?: string
          hired_to_do?: string
          id?: string
          position?: string
          rating_reason?: string
          reason_for_leaving?: string
          slot?: number
          start_date?: string
          supervisor_contact?: string
          supervisor_name?: string
          supervisor_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_jobs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "interview_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      evaluation_verbs: {
        Row: {
          correct: boolean
          created_at: string
          evaluation_id: string
          id: string
          position: number
          verb: string
        }
        Insert: {
          correct?: boolean
          created_at?: string
          evaluation_id: string
          id?: string
          position?: number
          verb: string
        }
        Update: {
          correct?: boolean
          created_at?: string
          evaluation_id?: string
          id?: string
          position?: number
          verb?: string
        }
        Relationships: [
          {
            foreignKeyName: "evaluation_verbs_evaluation_id_fkey"
            columns: ["evaluation_id"]
            isOneToOne: false
            referencedRelation: "interview_evaluations"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_evaluations: {
        Row: {
          application_id: string
          appointment_id: string | null
          attempt_number: number
          category_scores: Json
          comments: string | null
          compliance_score: number | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          decision_stage: string | null
          evaluator_id: string
          final_result: string | null
          hiring_bonus: string | null
          id: string
          interview_date: string | null
          last_edited_by: string | null
          last_roleplay_date: string | null
          live_cefr: string | null
          not_approved_other: string | null
          not_approved_reasons: Json
          red_flags: string | null
          reopened_at: string | null
          retake_date: string | null
          retake_reason: string | null
          sections: Json
          start_section: string | null
          started_at: string
          status: string
          submitted_at: string | null
          total_score: number | null
          updated_at: string
        }
        Insert: {
          application_id: string
          appointment_id?: string | null
          attempt_number?: number
          category_scores?: Json
          comments?: string | null
          compliance_score?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          decision_stage?: string | null
          evaluator_id: string
          final_result?: string | null
          hiring_bonus?: string | null
          id?: string
          interview_date?: string | null
          last_edited_by?: string | null
          last_roleplay_date?: string | null
          live_cefr?: string | null
          not_approved_other?: string | null
          not_approved_reasons?: Json
          red_flags?: string | null
          reopened_at?: string | null
          retake_date?: string | null
          retake_reason?: string | null
          sections?: Json
          start_section?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          appointment_id?: string | null
          attempt_number?: number
          category_scores?: Json
          comments?: string | null
          compliance_score?: number | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          decision_stage?: string | null
          evaluator_id?: string
          final_result?: string | null
          hiring_bonus?: string | null
          id?: string
          interview_date?: string | null
          last_edited_by?: string | null
          last_roleplay_date?: string | null
          live_cefr?: string | null
          not_approved_other?: string | null
          not_approved_reasons?: Json
          red_flags?: string | null
          reopened_at?: string | null
          retake_date?: string | null
          retake_reason?: string | null
          sections?: Json
          start_section?: string | null
          started_at?: string
          status?: string
          submitted_at?: string | null
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "interview_evaluations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "interview_evaluations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      interview_settings: {
        Row: {
          allow_reapply_days: number
          assignment_mode: string
          buffer_minutes: number
          created_at: string
          default_meeting_link: string
          duration_minutes: number
          id: boolean
          max_booking_days: number
          max_per_slot: number
          min_notice_hours: number
          minimum_download_mbps: number
          minimum_upload_mbps: number
          reminder_offsets_minutes: number[]
          templates: Json
          timezone: string
          token_expiry_days: number
          updated_at: string
          weekly_hours: Json
        }
        Insert: {
          allow_reapply_days?: number
          assignment_mode?: string
          buffer_minutes?: number
          created_at?: string
          default_meeting_link?: string
          duration_minutes?: number
          id?: boolean
          max_booking_days?: number
          max_per_slot?: number
          min_notice_hours?: number
          minimum_download_mbps?: number
          minimum_upload_mbps?: number
          reminder_offsets_minutes?: number[]
          templates?: Json
          timezone?: string
          token_expiry_days?: number
          updated_at?: string
          weekly_hours?: Json
        }
        Update: {
          allow_reapply_days?: number
          assignment_mode?: string
          buffer_minutes?: number
          created_at?: string
          default_meeting_link?: string
          duration_minutes?: number
          id?: boolean
          max_booking_days?: number
          max_per_slot?: number
          min_notice_hours?: number
          minimum_download_mbps?: number
          minimum_upload_mbps?: number
          reminder_offsets_minutes?: number[]
          templates?: Json
          timezone?: string
          token_expiry_days?: number
          updated_at?: string
          weekly_hours?: Json
        }
        Relationships: []
      }
      interviewer_availability: {
        Row: {
          created_at: string
          end_time: string
          id: string
          interviewer_id: string
          start_time: string
          weekday: number
        }
        Insert: {
          created_at?: string
          end_time: string
          id?: string
          interviewer_id: string
          start_time: string
          weekday: number
        }
        Update: {
          created_at?: string
          end_time?: string
          id?: string
          interviewer_id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "interviewer_availability_interviewer_id_fkey"
            columns: ["interviewer_id"]
            isOneToOne: false
            referencedRelation: "interviewers"
            referencedColumns: ["id"]
          },
        ]
      }
      interviewers: {
        Row: {
          active: boolean
          country_codes: string[]
          created_at: string
          email: string
          full_name: string
          id: string
          meeting_link: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          country_codes?: string[]
          created_at?: string
          email: string
          full_name: string
          id?: string
          meeting_link?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          country_codes?: string[]
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          meeting_link?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      recruitment_progress: {
        Row: {
          application_id: string
          created_at: string
          device_confirmed: boolean
          grammar_test_confirmed: boolean
          grammar_test_notes: string
          grammar_test_score: number | null
          grammar_test_status: string
          grammar_test_verified: boolean
          grammar_topics_confirmed: boolean
          internet_download_mbps: number | null
          internet_override: boolean
          internet_override_at: string | null
          internet_override_by: string | null
          internet_override_note: string | null
          internet_ping_ms: number | null
          internet_speed_mbps: number | null
          internet_test_passed: boolean
          internet_tested_at: string | null
          internet_upload_mbps: number | null
          jobs_count: number | null
          references_declaration: boolean
          resume_filename: string | null
          resume_path: string | null
          resume_replaced_at: string | null
          resume_uploaded_at: string | null
          sample_class_confirmed: boolean
          scheduling_status: string
          system_info_filename: string | null
          system_info_path: string | null
          system_info_uploaded_at: string | null
          updated_at: string
          work_modality: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          device_confirmed?: boolean
          grammar_test_confirmed?: boolean
          grammar_test_notes?: string
          grammar_test_score?: number | null
          grammar_test_status?: string
          grammar_test_verified?: boolean
          grammar_topics_confirmed?: boolean
          internet_download_mbps?: number | null
          internet_override?: boolean
          internet_override_at?: string | null
          internet_override_by?: string | null
          internet_override_note?: string | null
          internet_ping_ms?: number | null
          internet_speed_mbps?: number | null
          internet_test_passed?: boolean
          internet_tested_at?: string | null
          internet_upload_mbps?: number | null
          jobs_count?: number | null
          references_declaration?: boolean
          resume_filename?: string | null
          resume_path?: string | null
          resume_replaced_at?: string | null
          resume_uploaded_at?: string | null
          sample_class_confirmed?: boolean
          scheduling_status?: string
          system_info_filename?: string | null
          system_info_path?: string | null
          system_info_uploaded_at?: string | null
          updated_at?: string
          work_modality?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          device_confirmed?: boolean
          grammar_test_confirmed?: boolean
          grammar_test_notes?: string
          grammar_test_score?: number | null
          grammar_test_status?: string
          grammar_test_verified?: boolean
          grammar_topics_confirmed?: boolean
          internet_download_mbps?: number | null
          internet_override?: boolean
          internet_override_at?: string | null
          internet_override_by?: string | null
          internet_override_note?: string | null
          internet_ping_ms?: number | null
          internet_speed_mbps?: number | null
          internet_test_passed?: boolean
          internet_tested_at?: string | null
          internet_upload_mbps?: number | null
          jobs_count?: number | null
          references_declaration?: boolean
          resume_filename?: string | null
          resume_path?: string | null
          resume_replaced_at?: string | null
          resume_uploaded_at?: string | null
          sample_class_confirmed?: boolean
          scheduling_status?: string
          system_info_filename?: string | null
          system_info_path?: string | null
          system_info_uploaded_at?: string | null
          updated_at?: string
          work_modality?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recruitment_progress_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      reminder_logs: {
        Row: {
          appointment_id: string
          attempts: number
          channel: string
          created_at: string
          id: string
          kind: string
          provider_response: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          appointment_id: string
          attempts?: number
          channel: string
          created_at?: string
          id?: string
          kind: string
          provider_response?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_id?: string
          attempts?: number
          channel?: string
          created_at?: string
          id?: string
          kind?: string
          provider_response?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminder_logs_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      retake_access_tokens: {
        Row: {
          application_id: string
          attempts: number
          code_hash: string
          created_at: string
          expires_at: string
          id: string
          sent_at: string
          session_expires_at: string | null
          session_hash: string | null
          used_at: string | null
        }
        Insert: {
          application_id: string
          attempts?: number
          code_hash: string
          created_at?: string
          expires_at: string
          id?: string
          sent_at?: string
          session_expires_at?: string | null
          session_hash?: string | null
          used_at?: string | null
        }
        Update: {
          application_id?: string
          attempts?: number
          code_hash?: string
          created_at?: string
          expires_at?: string
          id?: string
          sent_at?: string
          session_expires_at?: string | null
          session_hash?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "retake_access_tokens_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduling_tokens: {
        Row: {
          application_id: string
          created_at: string
          expires_at: string
          id: string
          purpose: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          expires_at: string
          id?: string
          purpose?: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          purpose?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduling_tokens_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      scorecard_weights: {
        Row: {
          id: boolean
          thresholds: Json
          updated_at: string
          weights: Json
        }
        Insert: {
          id?: boolean
          thresholds?: Json
          updated_at?: string
          weights?: Json
        }
        Update: {
          id?: boolean
          thresholds?: Json
          updated_at?: string
          weights?: Json
        }
        Relationships: []
      }
      staff_countries: {
        Row: {
          country_code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          country_code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_countries_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      staff_profiles: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          email: string
          full_name: string
          last_login_at: string | null
          must_change_password: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string
          last_login_at?: string | null
          must_change_password?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string
          last_login_at?: string | null
          must_change_password?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          application_id: string
          content: string
          created_at: string
          id: string
          slot: number
          video_id: string
        }
        Insert: {
          application_id: string
          content: string
          created_at?: string
          id?: string
          slot: number
          video_id: string
        }
        Update: {
          application_id?: string
          content?: string
          created_at?: string
          id?: string
          slot?: number
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transcripts_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: true
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
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
      verification_codes: {
        Row: {
          application_id: string | null
          attempts: number
          code_hash: string
          created_at: string
          email: string
          expires_at: string
          id: string
          sent_at: string
          session_expires_at: string | null
          session_hash: string | null
          used_at: string | null
        }
        Insert: {
          application_id?: string | null
          attempts?: number
          code_hash: string
          created_at?: string
          email: string
          expires_at: string
          id?: string
          sent_at?: string
          session_expires_at?: string | null
          session_hash?: string | null
          used_at?: string | null
        }
        Update: {
          application_id?: string | null
          attempts?: number
          code_hash?: string
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          sent_at?: string
          session_expires_at?: string | null
          session_hash?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "verification_codes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          application_id: string
          audio_path: string | null
          created_at: string
          duration_seconds: number | null
          id: string
          question: string
          slot: number
          video_path: string
        }
        Insert: {
          application_id: string
          audio_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          question: string
          slot: number
          video_path: string
        }
        Update: {
          application_id?: string
          audio_path?: string | null
          created_at?: string
          duration_seconds?: number | null
          id?: string
          question?: string
          slot?: number
          video_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "videos_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
      work_references: {
        Row: {
          application_id: string
          company: string
          country_code: string | null
          created_at: string
          currently_working: boolean
          end_date: string | null
          id: string
          may_contact: boolean
          position: string
          reason_for_leaving: string
          slot: number
          start_date: string | null
          supervisor_email: string
          supervisor_name: string
          supervisor_phone: string
          supervisor_position: string | null
          updated_at: string
          verification_notes: string
          verification_status: string
        }
        Insert: {
          application_id: string
          company?: string
          country_code?: string | null
          created_at?: string
          currently_working?: boolean
          end_date?: string | null
          id?: string
          may_contact?: boolean
          position?: string
          reason_for_leaving?: string
          slot: number
          start_date?: string | null
          supervisor_email?: string
          supervisor_name?: string
          supervisor_phone?: string
          supervisor_position?: string | null
          updated_at?: string
          verification_notes?: string
          verification_status?: string
        }
        Update: {
          application_id?: string
          company?: string
          country_code?: string | null
          created_at?: string
          currently_working?: boolean
          end_date?: string | null
          id?: string
          may_contact?: boolean
          position?: string
          reason_for_leaving?: string
          slot?: number
          start_date?: string | null
          supervisor_email?: string
          supervisor_name?: string
          supervisor_phone?: string
          supervisor_position?: string | null
          updated_at?: string
          verification_notes?: string
          verification_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_references_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_appointment: {
        Args: {
          _application_id: string
          _candidate_timezone: string
          _ends_at: string
          _interviewer_id: string
          _meeting_link: string
          _starts_at: string
        }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_active_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "admin"
        | "recruiter"
        | "viewer"
        | "evaluator"
        | "recruitment"
        | "manager"
        | "applicant"
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
  public: {
    Enums: {
      app_role: [
        "admin",
        "recruiter",
        "viewer",
        "evaluator",
        "recruitment",
        "manager",
        "applicant",
      ],
    },
  },
} as const
