export interface Env {
  DASH2_DB: D1Database;
  DASH2_SESSIONS: KVNamespace;
  APP_VERSION: string;
}

export interface Variables {
  requestId: string;
}

export type AppEnv = { Bindings: Env; Variables: Variables };
