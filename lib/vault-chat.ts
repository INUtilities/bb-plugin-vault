type ChatStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export const chatKey = (projectId: string | null) => `vault:new-chat:${projectId ?? "none"}`;

export function createChatSession(storage?: ChatStorage) {
  const connected = new Map<string, string | null>();
  const pending = new Map<string, Promise<void>>();
  const listeners = new Set<() => void>();
  const writers = new Map<string, Set<(id: string | null) => void>>();
  const receive = (key: string, id: string | null) => {
    connected.set(key, id);
    try { storage?.setItem(key, id ?? ""); } catch { /* Memory only. */ }
    listeners.forEach(listener => listener());
  };
  const connect = (key: string, id: string | null) => {
    receive(key, id);
    writers.get(key)?.values().next().value?.(id);
  };
  return {
    receive,
    hasCache(key: string) {
      if (connected.has(key)) return true;
      try { return storage?.getItem(key) != null; } catch { return false; }
    },
    registerWriter(key: string, writer: (id: string | null) => void) {
      const group = writers.get(key) ?? new Set();
      group.add(writer); writers.set(key, group);
      return () => { group.delete(writer); if (!group.size) writers.delete(key); };
    },
    read(key: string): string | null {
      if (connected.has(key)) return connected.get(key) ?? null;
      try { return storage?.getItem(key) || null; } catch { return null; }
    },
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    connect,
    submit<Request>(key: string, request: Request, spawn: (request: Request) => Promise<{ id: string }>): Promise<void> {
      const existing = pending.get(key);
      if (existing) return existing;
      // Preserve the native selections; panel conversations start hidden from the thread list.
      const writer = writers.get(key)?.values().next().value;
      const operation = spawn({ ...request, visibility: "hidden" }).then(thread => { receive(key, thread.id); writer?.(thread.id); }).finally(() => { pending.delete(key); });
      pending.set(key, operation);
      return operation;
    },
  };
}

type MetadataSdk = {
  projects: { get: (input: { projectId: string }) => Promise<{ id: string; sources: { hostId: string | null }[] }> };
  threads: { get: (input: { threadId: string }) => Promise<{ projectId: string; environmentId: string | null }> };
  environments: { get: (input: { environmentId: string }) => Promise<{ id: string; projectId: string; hostId: string; status: string }> };
};
export type ChatSeeds = { defaultProjectId?: string; defaultEnvironment?: { type: "reuse"; environmentId: string } };

// A vault registration is a read-only folder, not a BB project mapping.
export async function resolveChatSeeds(sdk: MetadataSdk, context: { projectId: string | null; threadId: string | null }): Promise<ChatSeeds> {
  if (!context.projectId) return {};
  let seeds: ChatSeeds = {};
  try {
    const project = await sdk.projects.get({ projectId: context.projectId });
    if (project.id !== context.projectId) return {};
    seeds = { defaultProjectId: project.id };
    if (!context.threadId) return seeds;
    const thread = await sdk.threads.get({ threadId: context.threadId });
    if (thread.projectId !== project.id || !thread.environmentId) return seeds;
    const environment = await sdk.environments.get({ environmentId: thread.environmentId });
    if (environment.id === thread.environmentId && environment.projectId === project.id && environment.status === "ready"
      && project.sources.some(source => source.hostId === environment.hostId)) {
      seeds.defaultEnvironment = { type: "reuse", environmentId: environment.id };
    }
  } catch { /* Unresolved metadata leaves the official pickers unseeded. */ }
  return seeds;
}

export const vaultChatSession = createChatSession(typeof sessionStorage === "undefined" ? undefined : sessionStorage);
