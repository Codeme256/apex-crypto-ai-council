export type AgentId =
  | "SCOUT"
  | "NEWS"
  | "SENTIMENT"
  | "CHART"
  | "SKEPTIC"
  | "CHIEF"
  | "RISK";

export interface AgentMeta {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  initial: string;
}

export const AGENTS: AgentMeta[] = [
  {
    id: "SCOUT",
    name: "Scout",
    role: "Opportunity discovery",
    color: "text-apex-cyan",
    initial: "S",
  },
  {
    id: "NEWS",
    name: "News",
    role: "Event awareness",
    color: "text-sky-400",
    initial: "N",
  },
  {
    id: "SENTIMENT",
    name: "Sentiment",
    role: "Market mood",
    color: "text-apex-violet",
    initial: "M",
  },
  {
    id: "CHART",
    name: "Chart",
    role: "Technical structure",
    color: "text-apex-emerald",
    initial: "C",
  },
  {
    id: "SKEPTIC",
    name: "Skeptic",
    role: "Challenge weak setups",
    color: "text-apex-amber",
    initial: "K",
  },
  {
    id: "CHIEF",
    name: "Chief",
    role: "Final coordination",
    color: "text-white",
    initial: "\u03a3",
  },
];

export function agentMeta(id: string): AgentMeta {
  return (
    AGENTS.find((a) => a.id === id) || {
      id: id as AgentId,
      name: id,
      role: "",
      color: "text-slate-400",
      initial: id.slice(0, 1),
    }
  );
}
