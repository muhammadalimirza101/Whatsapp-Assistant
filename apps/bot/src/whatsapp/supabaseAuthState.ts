// Custom Baileys auth-state provider backed by the `baileys_auth` Postgres table.
// Replaces useMultiFileAuthState so the session survives redeploys/restarts on
// Render's ephemeral filesystem (per spec: credentials live in Supabase, never on disk).
//
// Storage model: one row per blob, keyed by (session_id, key).
//   key = "creds"                        -> the credentials object
//   key = "<type>-<id>" e.g. "app-state-sync-key-AAAA" -> individual signal keys
// Values are serialized with Baileys' BufferJSON so Buffers survive jsonb.
// DB access goes through @wa/core (apps/bot never imports drizzle-orm directly).
import baileys, {
  initAuthCreds,
  BufferJSON,
  type AuthenticationCreds,
  type AuthenticationState,
  type SignalDataTypeMap,
} from "@whiskeysockets/baileys";

// `proto` is a runtime value on the (CJS) module; accessing it via the default
// import keeps it available under tsx/ESM interop where the named export isn't.
const { proto } = baileys;
import { getAuthBlob, setAuthBlob, deleteAuthBlobs } from "@wa/core";

export interface AuthStateHandle {
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}

function encode(value: unknown): object {
  // Round-trip through BufferJSON so Buffers become {type:'Buffer',data:[...]}.
  return JSON.parse(JSON.stringify(value, BufferJSON.replacer)) as object;
}

function decode<T>(value: unknown): T {
  return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
}

/**
 * Build a Baileys auth state persisted in Supabase for the given session id.
 * Mirrors the shape of useMultiFileAuthState but backed by Postgres rows.
 */
export async function useSupabaseAuthState(sessionId: string): Promise<AuthStateHandle> {
  const storedCreds = await getAuthBlob(sessionId, "creds");
  const creds: AuthenticationCreds = storedCreds
    ? decode<AuthenticationCreds>(storedCreds)
    : initAuthCreds();

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
        await Promise.all(
          ids.map(async (id) => {
            const stored = await getAuthBlob(sessionId, `${type}-${id}`);
            if (stored === undefined) return;
            let value = decode<unknown>(stored);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as Record<string, unknown>,
              );
            }
            result[id] = value as SignalDataTypeMap[typeof type];
          }),
        );
        return result;
      },
      set: async (data): Promise<void> => {
        const writes: Array<Promise<void>> = [];
        const deletes: string[] = [];
        for (const type of Object.keys(data) as Array<keyof SignalDataTypeMap>) {
          const category = data[type];
          if (!category) continue;
          for (const id of Object.keys(category)) {
            const value = category[id];
            const key = `${type}-${id}`;
            if (value) {
              writes.push(setAuthBlob(sessionId, key, encode(value)));
            } else {
              deletes.push(key);
            }
          }
        }
        await Promise.all(writes);
        await deleteAuthBlobs(sessionId, deletes);
      },
    },
  };

  return {
    state,
    saveCreds: async () => {
      await setAuthBlob(sessionId, "creds", encode(state.creds));
    },
  };
}
