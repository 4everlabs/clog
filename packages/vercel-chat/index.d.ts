export type ChatHandler<T = unknown> = {
  id: string;
  send: (payload: T) => Promise<{ ok: true; payload: T }>;
};

const chatAdapter: {
  createHandler: (name?: string) => ChatHandler;
};

export default chatAdapter;
