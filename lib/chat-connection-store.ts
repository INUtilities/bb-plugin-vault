import { z } from "zod";

export const chatConnectionSchema = z.object({
  threadId: z.string().min(1).max(200).nullable(),
  revision: z.number().int().positive(),
}).strict();
export type ChatConnection = z.infer<typeof chatConnectionSchema>;

/** KV is durable; the realtime event only tells clients to read it again. */
export function createChatConnectionStore(kv: {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
}, publish: (projectId: string | null) => void) {
  const updates = new Map<string, Promise<ChatConnection>>();
  const keyFor = (projectId: string | null) => `chat-connection:${projectId ?? "none"}`;
  const read = async (projectId: string | null) => {
    const saved = chatConnectionSchema.safeParse(await kv.get(keyFor(projectId)));
    return saved.success ? saved.data : null;
  };
  return {
    read,
    async write(projectId: string | null, threadId: string | null, onlyIfMissing = false) {
      const key = keyFor(projectId);
      const operation = (updates.get(key) ?? Promise.resolve()).catch(() => undefined).then(async () => {
        const current = await read(projectId);
        if (onlyIfMissing && current) return current;
        const next = { threadId, revision: (current?.revision ?? 0) + 1 };
        await kv.set(key, next);
        publish(projectId);
        return next;
      });
      updates.set(key, operation);
      try { return await operation; }
      finally { if (updates.get(key) === operation) updates.delete(key); }
    },
  };
}
