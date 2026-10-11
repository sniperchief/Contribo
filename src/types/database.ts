/**
 * Database types for supabase-js, mirroring supabase/migrations.
 *
 * Hand-written for Phase 1. Once a Supabase project is linked, regenerate with:
 *   npx supabase gen types typescript --linked > src/types/database.ts
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type ProjectStatus = "draft" | "published" | "archived";
export type RewardPolicyStatus = "draft" | "published" | "retired";
export type RewardModel = "bounty" | "funding_share" | "hybrid";
export type ContributionStatus = "submitted" | "verified" | "accepted" | "rejected";

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          website_url: string | null;
          wallet_address: string | null;
          wallet_verified_at: string | null;
          /** Other social accounts, keyed by platform (x, linkedin, discord, telegram, farcaster). */
          social_links: Json;
          /** Tech stack identifiers from src/lib/profile.ts. */
          skills: string[];
          /** Onboarding preference; never restricts access. */
          primary_role: "contributor" | "founder" | null;
          onboarded_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Rows are created by the auth trigger (or the server's identity sync). */
        Insert: {
          id: string;
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
        };
        /** Clients may update profile fields; wallet_* is written only by the server after a signature check. */
        Update: {
          username?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          website_url?: string | null;
          wallet_address?: string | null;
          wallet_verified_at?: string | null;
          social_links?: Json;
          skills?: string[];
          primary_role?: "contributor" | "founder" | null;
          onboarded_at?: string | null;
        };
        Relationships: [];
      };
      github_identities: {
        Row: {
          user_id: string;
          github_user_id: number;
          github_login: string;
          avatar_url: string | null;
          linked_at: string;
          updated_at: string;
        };
        /** Written by the auth trigger or the server's identity sync only. */
        Insert: {
          user_id: string;
          github_user_id: number;
          github_login: string;
          avatar_url?: string | null;
        };
        Update: {
          github_user_id?: number;
          github_login?: string;
          avatar_url?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "github_identities_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          slug: string;
          name: string;
          tagline: string | null;
          description: string | null;
          website_url: string | null;
          logo_url: string | null;
          status: ProjectStatus;
          published_at: string | null;
          onchain_project_id: string | null;
          onchain_asset: string | null;
          onchain_registration_tx: string | null;
          /** Unfinished guided setup (see `SetupPlan` in src/lib/project-setup.ts). */
          setup_plan: Json | null;
          created_at: string;
          updated_at: string;
        };
        /** onchain_*, status and published_at are written by the server only. */
        Insert: {
          id?: string;
          owner_id?: string;
          slug: string;
          name: string;
          tagline?: string | null;
          description?: string | null;
          website_url?: string | null;
          logo_url?: string | null;
          status?: ProjectStatus;
        };
        Update: {
          slug?: string;
          name?: string;
          tagline?: string | null;
          description?: string | null;
          website_url?: string | null;
          logo_url?: string | null;
          status?: ProjectStatus;
          setup_plan?: Json | null;
          onchain_project_id?: string | null;
          onchain_asset?: string | null;
          onchain_registration_tx?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_repositories: {
        Row: {
          id: string;
          project_id: string;
          github_owner: string;
          github_name: string;
          github_repo_id: number | null;
          default_branch: string | null;
          verification_token: string;
          verified_at: string | null;
          verification_method: "owner" | "file" | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          github_owner: string;
          github_name: string;
          default_branch?: string | null;
        };
        /** Clients may change default_branch only; verification fields are server-written. */
        Update: {
          default_branch?: string | null;
          github_repo_id?: number | null;
          verified_at?: string | null;
          verification_method?: "owner" | "file" | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_repositories_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      reward_policies: {
        Row: {
          id: string;
          project_id: string;
          version: number;
          status: RewardPolicyStatus;
          title: string;
          summary: string | null;
          terms: string;
          reward_model: RewardModel;
          contributor_pool_bps: number | null;
          reward_asset: string;
          eligibility: Json;
          policy_hash: string | null;
          published_at: string | null;
          retired_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          version: number;
          status?: "draft";
          title: string;
          summary?: string | null;
          terms?: string;
          reward_model: RewardModel;
          contributor_pool_bps?: number | null;
          reward_asset?: string;
          eligibility?: Json;
        };
        /** status and policy_hash are written by the server when publishing or retiring. */
        Update: {
          status?: RewardPolicyStatus;
          policy_hash?: string | null;
          title?: string;
          summary?: string | null;
          terms?: string;
          reward_model?: RewardModel;
          contributor_pool_bps?: number | null;
          reward_asset?: string;
          eligibility?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "reward_policies_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      bounty_details: {
        Row: {
          bounty_id: string;
          project_id: string;
          title: string;
          tx_hash: string | null;
          created_at: string;
        };
        /** Written by the server after reading the BountyCreated event. */
        Insert: {
          bounty_id: string;
          project_id: string;
          title: string;
          tx_hash?: string | null;
        };
        Update: {
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "bounty_details_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      project_approvers: {
        Row: {
          project_id: string;
          address: string;
          tx_hash: string | null;
          created_at: string;
        };
        /** Written by the server after reading `isApprover` onchain. */
        Insert: {
          project_id: string;
          address: string;
          tx_hash?: string | null;
        };
        Update: {
          tx_hash?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "project_approvers_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
        ];
      };
      contributions: {
        Row: {
          id: string;
          project_id: string;
          repository_id: string;
          contributor_id: string | null;
          github_user_id: number;
          github_login: string;
          pr_number: number;
          pr_url: string;
          pr_title: string | null;
          status: ContributionStatus;
          reward_policy_id: string | null;
          merged_at: string | null;
          verified_at: string | null;
          status_changed_at: string;
          github_repo_id: number | null;
          contributor_wallet: string | null;
          reward_amount: string | null;
          bounty_id: string | null;
          onchain_ref: string | null;
          approval_tx_hash: string | null;
          approved_onchain_at: string | null;
          claim_tx_hash: string | null;
          claimed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        /** Verified contributions are inserted by the server after checking GitHub evidence. */
        Insert: {
          project_id: string;
          repository_id: string;
          contributor_id: string;
          github_user_id: number;
          github_login: string;
          pr_number: number;
          pr_url: string;
          pr_title?: string | null;
          status?: ContributionStatus;
          reward_policy_id?: string | null;
          merged_at?: string | null;
          verified_at?: string | null;
          github_repo_id?: number | null;
        };
        /** Contribution updates are performed by the server (service role) only. */
        Update: {
          status?: ContributionStatus;
          contributor_wallet?: string | null;
          reward_amount?: string | null;
          bounty_id?: string | null;
          onchain_ref?: string | null;
          approval_tx_hash?: string | null;
          approved_onchain_at?: string | null;
          claim_tx_hash?: string | null;
          claimed_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "contributions_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contributions_contributor_id_fkey";
            columns: ["contributor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contributions_repository_fk";
            columns: ["repository_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "project_repositories";
            referencedColumns: ["id", "project_id"];
          },
          {
            foreignKeyName: "contributions_reward_policy_fk";
            columns: ["reward_policy_id", "project_id"];
            isOneToOne: false;
            referencedRelation: "reward_policies";
            referencedColumns: ["id", "project_id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean };
      is_project_published: { Args: { p_project_id: string }; Returns: boolean };
    };
    Enums: {
      project_status: ProjectStatus;
      reward_policy_status: RewardPolicyStatus;
      reward_model: RewardModel;
      contribution_status: ContributionStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
