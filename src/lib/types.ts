// Domain types for Matchmaker SudoExpo.
// These mirror the future Supabase schema so swapping the mock store for a
// real backend is a mechanical change.

export type UUID = string;

export type MatchKind =
  | "direto"
  | "inverso"
  | "bidirecional"
  | "complementar"
  | "hibrido";

export type MatchLabel =
  | "alta_compatibilidade"
  | "boa_oportunidade"
  | "conexao_possivel";

export type Decision = "interesse" | "agora_nao" | "sem_decisao";

export type ConnectionStatus =
  | "aguardando"
  | "em_atendimento"
  | "apresentados"
  | "contato_trocado"
  | "concluido"
  | "cancelado";

export interface Segment {
  id: string;
  label: string;
  emoji?: string;
}

export interface TaxonomyItem {
  id: string;
  segmentId: string;
  label: string;
  kind: "offer" | "need";
}

export interface OfferItem {
  id: string;
  label: string;
  detail?: string;
}

export type NeedKind =
  | "servico"
  | "fornecedor"
  | "parceiro"
  | "compradores"
  | "distribuidores"
  | "profissionais"
  | "produtos"
  | "outro";

export interface NeedItem {
  id: string;
  kind: NeedKind;
  label: string;
  detail?: string;
  isPriority?: boolean;
}

export interface Profile {
  id: UUID;
  eventId: string;
  name: string;
  company: string;
  city: string;
  neighborhood?: string;
  whatsapp: string; // stored plain in the mock; real backend keeps it in private schema
  segmentId: string;
  summary: string;
  offers: OfferItem[];
  needs: NeedItem[];
  consent: boolean;
  isDemo?: boolean;
  createdAt: string;
  updatedAt: string;
  recoveryCode: string; // in real backend, only the hash is stored
}

export interface MatchReason {
  code:
    | "outro_oferece_o_que_procuro"
    | "outro_procura_o_que_ofereco"
    | "prioridade"
    | "complementaridade"
    | "atualidade"
    | "proximidade";
  weight: number;
  detail: string;
}

export interface Match {
  id: UUID;
  eventId: string;
  aProfileId: UUID;
  bProfileId: UUID;
  kind: MatchKind;
  scoreForA: number;
  scoreForB: number;
  label: MatchLabel;
  reasonsForA: MatchReason[];
  reasonsForB: MatchReason[];
  decisionA: Decision;
  decisionB: Decision;
  createdAt: string;
  updatedAt: string;
}

export interface Connection {
  id: UUID;
  matchId: UUID;
  eventId: string;
  aProfileId: UUID;
  bProfileId: UUID;
  status: ConnectionStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
