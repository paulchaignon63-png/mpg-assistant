/**
 * Petit stockage clé → valeur côté serveur.
 *
 * - Supabase si SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont définis
 *   (table `onze_parfait_kv`, cf. supabase/migrations/001_onze_parfait_kv.sql) :
 *   c'est le mode prévu
 *   en production (Vercel n'a pas de disque persistant).
 * - Sinon, un dossier local .data/ (développement).
 *
 * Sert aux abonnements push, à la fiabilité mesurée des sources de compos,
 * aux pronostics figés avant chaque journée et à l'état des alertes.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface Store {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  /** Clés commençant par `prefix`, avec leur valeur. */
  list<T>(prefix: string): Promise<Array<{ key: string; value: T }>>;
  readonly kind: "supabase" | "file";
}

/** Table préfixée : le projet Supabase est partagé avec d'autres apps. */
const TABLE = "onze_parfait_kv";

class SupabaseStore implements Store {
  readonly kind = "supabase" as const;
  constructor(private db: SupabaseClient) {}
  async get<T>(key: string): Promise<T | null> {
    const { data } = await this.db.from(TABLE).select("value").eq("key", key).maybeSingle();
    return (data?.value as T) ?? null;
  }
  async set<T>(key: string, value: T): Promise<void> {
    const { error } = await this.db.from(TABLE).upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(`Stockage : ${error.message}`);
  }
  async delete(key: string): Promise<void> {
    await this.db.from(TABLE).delete().eq("key", key);
  }
  async list<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    const { data } = await this.db.from(TABLE).select("key, value").like("key", `${prefix}%`).limit(5000);
    return (data ?? []).map((r) => ({ key: r.key as string, value: r.value as T }));
  }
}

class FileStore implements Store {
  readonly kind = "file" as const;
  private dir = path.join(process.cwd(), ".data");
  private file(key: string) {
    return path.join(this.dir, `${encodeURIComponent(key)}.json`);
  }
  async get<T>(key: string): Promise<T | null> {
    try {
      return JSON.parse(await fs.readFile(this.file(key), "utf8")) as T;
    } catch {
      return null;
    }
  }
  async set<T>(key: string, value: T): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(key), JSON.stringify(value));
  }
  async delete(key: string): Promise<void> {
    await fs.rm(this.file(key), { force: true });
  }
  async list<T>(prefix: string): Promise<Array<{ key: string; value: T }>> {
    try {
      const names = await fs.readdir(this.dir);
      const out: Array<{ key: string; value: T }> = [];
      for (const n of names) {
        const key = decodeURIComponent(n.replace(/\.json$/, ""));
        if (!key.startsWith(prefix)) continue;
        const value = await this.get<T>(key);
        if (value != null) out.push({ key, value });
      }
      return out;
    } catch {
      return [];
    }
  }
}

let instance: Store | null = null;

export function getStore(): Store {
  if (instance) return instance;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  instance = url && key ? new SupabaseStore(createClient(url, key, { auth: { persistSession: false } })) : new FileStore();
  return instance;
}

/** Le stockage est-il durable (utilisable en production) ? */
export function storeIsDurable(): boolean {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) || process.env.NODE_ENV !== "production";
}
