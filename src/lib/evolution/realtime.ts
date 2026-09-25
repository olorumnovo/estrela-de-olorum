type RealtimePayload = {
  type: "conversation" | "message" | "status";
  channel: string;
  templeId: string;
  remoteJid?: string;
  phone?: string;
  data?: unknown;
};

type Listener = (payload: RealtimePayload) => void;

const globalBus = globalThis as typeof globalThis & {
  evolutionRealtimeListeners?: Set<Listener>;
};

function listeners() {
  if (!globalBus.evolutionRealtimeListeners) {
    globalBus.evolutionRealtimeListeners = new Set<Listener>();
  }

  return globalBus.evolutionRealtimeListeners;
}

export function subscribeEvolutionRealtime(listener: Listener) {
  listeners().add(listener);

  return () => {
    listeners().delete(listener);
  };
}

export function publishEvolutionRealtime(payload: RealtimePayload) {
  for (const listener of listeners()) {
    listener(payload);
  }
}
