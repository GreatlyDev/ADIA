import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseServerClientEnv {
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  SUPABASE_INGESTION_ACCESS_TOKEN?: string;
}

export interface CreateSupabaseServerClientOptions {
  env?: SupabaseServerClientEnv;
}

export const createSupabaseServerClient = (
  options: CreateSupabaseServerClientOptions = {},
): SupabaseClient => {
  assertServerOnly();

  const env = options.env ?? process.env;
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const accessToken = env.SUPABASE_INGESTION_ACCESS_TOKEN;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required for ingestion.");
  }

  if (accessToken) {
    if (!env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      throw new Error(
        "NEXT_PUBLIC_SUPABASE_ANON_KEY is required when SUPABASE_INGESTION_ACCESS_TOKEN is used.",
      );
    }

    return createClient(supabaseUrl, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    });
  }

  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY or SUPABASE_INGESTION_ACCESS_TOKEN is required for ingestion.",
    );
  }

  return createClient(supabaseUrl, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

const assertServerOnly = (): void => {
  if (typeof window !== "undefined") {
    throw new Error("ADIA Supabase ingestion clients are server-only.");
  }
};
