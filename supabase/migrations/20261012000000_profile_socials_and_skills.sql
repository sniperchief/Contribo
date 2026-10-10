-- =============================================================================
-- Contribo — profile social links and skills
--
-- Users can list other social accounts and the tech stacks they work with.
-- The database enforces the allowed social platforms and skill identifiers;
-- the app validates formats before saving.
-- =============================================================================

alter table public.profiles
  add column social_links jsonb not null default '{}'::jsonb,
  add column skills text[] not null default '{}',
  add constraint profiles_social_links_object check (jsonb_typeof(social_links) = 'object'),
  -- Only known platforms; removing every allowed key must leave an empty object.
  add constraint profiles_social_links_keys
    check ((social_links - array['x', 'linkedin', 'discord', 'telegram', 'farcaster']) = '{}'::jsonb),
  add constraint profiles_social_links_size check (pg_column_size(social_links) <= 2048),
  add constraint profiles_skills_allowed check (
    cardinality(skills) <= 20
    and skills <@ array[
      'solidity', 'rust', 'go', 'typescript', 'javascript', 'python', 'cpp', 'react', 'nextjs', 'vue',
      'svelte', 'nodejs', 'tailwindcss', 'foundry', 'hardhat', 'viem-wagmi', 'ethersjs', 'postgresql',
      'graphql', 'docker'
    ]::text[]
  );

-- Users edit their own social links and skills (RLS limits updates to their own row).
grant update (social_links, skills) on public.profiles to authenticated;
