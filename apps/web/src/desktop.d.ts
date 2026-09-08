interface Window {
  deuceDesktop?: {
    focus: () => void;
    connectAgent?: (connection: { agentId: string; token: string; provider: 'codex' | 'claude' }) => Promise<{ ok: boolean; persisted?: boolean }>;
  };
}
