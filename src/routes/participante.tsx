import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { PageShell } from "@/components/brand/BrandShell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Heart,
  HeartHandshake,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Sparkles,
  X,
  Copy,
  Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { LABEL_TEXT } from "@/domains/matching/score";
import { EVENT_ID, SEGMENTS, NEED_KIND_LABELS } from "@/lib/mock-data";
import type { ConnectionStatus } from "@/lib/types";
import { RecoveryCodeDialog } from "@/components/RecoveryCodeDialog";
import {
  canParticipantRevealContact,
  PARTICIPANT_STATUS_MESSAGE,
} from "@/features/connections/eligibility";
import {
  translateRevealError,
  useRevealContact,
  type RevealedContact,
} from "@/features/connections/useRevealContact";
import { useSession } from "@/features/auth/useSession";
import {
  useOwnProfile,
  type OwnProfileDTO,
} from "@/features/participant/useOwnProfile";
import {
  useDecideMatch,
  useOwnMatches,
  type OwnMatchDTO,
} from "@/features/participant/useOwnMatches";
import { useRecoverProfile } from "@/features/participant/useRecoverProfile";
import { ensureAnonSession } from "@/features/participant/session";

export const Route = createFileRoute("/participante")({
  head: () => ({
    meta: [
      { title: "Área do participante — Matchmaker SudoExpo" },
      {
        name: "description",
        content: "Seus matches, interesses e conexões na SudoExpo.",
      },
    ],
  }),
  component: ParticipantPage,
});

function ParticipantPage() {
  const navigate = useNavigate();
  const { user, isLoading: sessionLoading } = useSession();

  // Garante sessão anônima assim que a página monta, caso não haja user.
  useEffect(() => {
    if (!sessionLoading && !user) void ensureAnonSession();
  }, [sessionLoading, user]);

  const profileQuery = useOwnProfile(EVENT_ID);
  const matchesQuery = useOwnMatches(EVENT_ID, { enabled: !!profileQuery.data });

  if (profileQuery.isLoading || sessionLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-3 h-4 w-96" />
          <Skeleton className="mt-8 h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  const profile = profileQuery.data;
  if (!profile) return <RecoveryView />;

  const matches = matchesQuery.data ?? [];
  const mutual = matches.filter((m) => m.connection != null);
  const interested = matches.filter((m) => m.my_decision === "interesse");

  return (
    <PageShell>
      <section className="mx-auto max-w-4xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">
              Área do participante
            </p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Olá, {profile.name.split(" ")[0]}!
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Seu código de recuperação fica apenas com você. Se perder, gere um novo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <RotateRecoveryButton />
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/" });
              }}
            >
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        <Tabs defaultValue="matches">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="matches">Matches ({matches.length})</TabsTrigger>
            <TabsTrigger value="interested">Interesses ({interested.length})</TabsTrigger>
            <TabsTrigger value="connections">Conexões ({mutual.length})</TabsTrigger>
            <TabsTrigger value="profile">Perfil</TabsTrigger>
          </TabsList>

          <TabsContent value="matches" className="mt-6">
            <MatchesList
              matches={matches}
              loading={matchesQuery.isLoading}
              error={matchesQuery.error}
            />
          </TabsContent>
          <TabsContent value="interested" className="mt-6">
            <MatchesList
              matches={interested}
              loading={matchesQuery.isLoading}
              error={matchesQuery.error}
              emptyMessage="Você ainda não marcou interesse em ninguém."
            />
          </TabsContent>
          <TabsContent value="connections" className="mt-6">
            <ConnectionsList matches={mutual} />
          </TabsContent>
          <TabsContent value="profile" className="mt-6">
            <ProfileCard profile={profile} />
          </TabsContent>
        </Tabs>
      </section>
    </PageShell>
  );
}

function RotateRecoveryButton() {
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function rotate() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("rotate_own_recovery_code");
      if (error) throw error;
      setCode(data as string);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao gerar código.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={loading}
      >
        {loading ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="mr-1 h-4 w-4" />
        )}
        Gerar novo código
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar um novo código de recuperação?</AlertDialogTitle>
            <AlertDialogDescription>
              O código anterior deixará de funcionar imediatamente. Você precisará
              salvar o novo código em local seguro — ele será exibido apenas uma vez.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={rotate}>
              Gerar novo código
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <RecoveryCodeDialog
        open={code !== null}
        code={code}
        onConfirm={() => setCode(null)}
        title="Seu novo código de recuperação"
        description="Guarde-o em local seguro. O código anterior deixou de funcionar."
      />
    </>
  );
}

function MatchesList({
  matches,
  loading,
  error,
  emptyMessage,
}: {
  matches: OwnMatchDTO[];
  loading: boolean;
  error: unknown;
  emptyMessage?: string;
}) {
  if (error) {
    return (
      <Card className="p-6 text-sm text-destructive">
        Não conseguimos carregar seus matches. Recarregue a página.
      </Card>
    );
  }
  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (matches.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Sparkles className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-lg font-semibold">
          {emptyMessage ?? "Nenhum match ainda"}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Seu perfil segue ativo. Buscaremos novas conexões conforme mais gente entra.
        </p>
        <Button asChild className="mt-4">
          <Link to="/participar">Ajustar meu perfil</Link>
        </Button>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <MatchCard key={m.match_id} match={m} />
      ))}
    </div>
  );
}

function MatchCard({ match }: { match: OwnMatchDTO }) {
  const decideMutation = useDecideMatch(EVENT_ID);
  const myDecision = match.my_decision;
  const theirDecision = match.other_decision;
  const mutual = match.connection != null;
  const other = match.other;
  const seg = SEGMENTS.find((s) => s.id === other.segment_id);

  function decide(d: "interesse" | "agora_nao") {
    decideMutation.mutate(
      { matchId: match.match_id, decision: d },
      {
        onSuccess: (res) => {
          if (res.mutual && res.connection_created) {
            toast.success("Deu match! 🎉 A equipe vai apresentar vocês.");
          } else if (d === "interesse") {
            toast("Interesse registrado. Aguardando a outra parte.");
          }
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Falha ao registrar.");
        },
      },
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="border-b bg-muted/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge
                className={
                  match.label === "alta_compatibilidade"
                    ? "bg-success text-success-foreground"
                    : match.label === "boa_oportunidade"
                      ? "bg-accent text-accent-foreground"
                      : "bg-secondary text-secondary-foreground"
                }
              >
                {LABEL_TEXT[match.label]}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {match.kind}
              </Badge>
              {mutual && (
                <Badge className="bg-primary text-primary-foreground">
                  <HeartHandshake className="mr-1 h-3 w-3" /> Deu match
                </Badge>
              )}
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold">
              {other.company}
            </h3>
            <p className="text-sm text-muted-foreground">
              {other.name} · {seg?.emoji} {seg?.label ?? other.segment_id}
            </p>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {other.city}
            </p>
          </div>
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Por que este match
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {match.reasons.map((r) => (
              <li key={r.code} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                <span>{r.label}</span>
              </li>
            ))}
            {match.reasons.length === 0 && (
              <li className="text-muted-foreground">
                Motivos ainda estão sendo calculados…
              </li>
            )}
          </ul>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-primary hover:underline">
            Ver perfil resumido
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-muted-foreground">{other.summary}</p>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Oferece
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {match.other_offers.map((o, i) => (
                  <Badge key={`o-${i}`} variant="secondary">
                    {o.label}
                  </Badge>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Procura
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {match.other_needs.map((n, i) => (
                  <li key={`n-${i}`}>
                    <Badge variant="outline" className="mr-1">
                      {NEED_KIND_LABELS[n.need_kind] ?? n.need_kind}
                    </Badge>
                    {n.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </details>

        {mutual && (
          <div className="rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
            <p className="font-medium">
              🎉 Interesse mútuo! A equipe da ACIRV vai apresentar vocês pessoalmente na feira.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Contato liberado quando a equipe registrar a apresentação.
            </p>
          </div>
        )}

        {!mutual && (
          <div className="flex gap-2">
            <Button
              className="flex-1"
              variant={myDecision === "interesse" ? "secondary" : "default"}
              onClick={() => decide("interesse")}
              disabled={myDecision === "interesse" || decideMutation.isPending}
            >
              <Heart className="mr-1 h-4 w-4" />
              {myDecision === "interesse" ? "Interesse enviado" : "Tenho interesse"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => decide("agora_nao")}
              disabled={myDecision === "agora_nao" || decideMutation.isPending}
            >
              <X className="mr-1 h-4 w-4" /> Agora não
            </Button>
            {theirDecision === "interesse" && myDecision !== "interesse" && (
              <span className="self-center text-xs text-muted-foreground">
                A outra parte já demonstrou interesse.
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function ConnectionsList({ matches }: { matches: OwnMatchDTO[] }) {
  if (matches.length === 0) {
    return (
      <Card className="p-8 text-center">
        <HeartHandshake className="mx-auto h-8 w-8 text-muted-foreground" />
        <h3 className="mt-3 font-display text-lg font-semibold">
          Ainda sem conexões confirmadas
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Quando o interesse for mútuo, a conexão aparece aqui.
        </p>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {matches.map((m) => (
        <ConnectionRow key={m.match_id} match={m} />
      ))}
    </div>
  );
}

const CONN_LABEL: Record<ConnectionStatus, string> = {
  aguardando: "Aguardando equipe",
  em_atendimento: "Equipe organizando",
  apresentados: "Apresentados",
  contato_trocado: "Contato trocado",
  concluido: "Concluída",
  cancelado: "Cancelada",
};
const CONN_TONE: Record<ConnectionStatus, string> = {
  aguardando: "bg-warning/15 text-warning-foreground border-warning/40",
  em_atendimento: "bg-accent/15 text-accent-foreground border-accent/40",
  apresentados: "bg-primary/15 text-primary border-primary/30",
  contato_trocado: "bg-secondary/15 text-secondary-foreground border-secondary/40",
  concluido: "bg-success/15 text-success-foreground border-success/40",
  cancelado: "bg-muted text-muted-foreground border-muted",
};

function ConnectionRow({ match }: { match: OwnMatchDTO }) {
  const { contact, error, loading, reveal, clear } = useRevealContact();
  const [open, setOpen] = useState(false);
  const status: ConnectionStatus = match.connection?.status ?? "aguardando";
  const canReveal = canParticipantRevealContact(status);
  const isCancelled = status === "cancelado";
  const statusMessage = PARTICIPANT_STATUS_MESSAGE[status];
  const other = match.other;

  async function handleReveal() {
    setOpen(true);
    await reveal(match.match_id);
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-display font-semibold">{other.company}</h4>
          <p className="text-sm text-muted-foreground">
            {other.name} · {other.city}
          </p>
          <Badge variant="outline" className={`mt-2 border ${CONN_TONE[status]}`}>
            {CONN_LABEL[status]}
          </Badge>
        </div>
        {!isCancelled && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleReveal}
            disabled={loading || !canReveal}
          >
            {loading ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="mr-1 h-4 w-4" />
            )}
            Ver contato
          </Button>
        )}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{statusMessage}</p>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) clear();
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Contato de {other.name.split(" ")[0]}</DialogTitle>
            <DialogDescription>
              Só liberamos após a apresentação feita pela equipe da ACIRV no evento.
            </DialogDescription>
          </DialogHeader>
          {loading && <Skeleton className="h-20 w-full" />}
          {error && (
            <p className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
              {translateRevealError(error)}
            </p>
          )}
          {contact && <RevealedContactBlock contact={contact} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RevealedContactBlock({ contact }: { contact: RevealedContact }) {
  const [copied, setCopied] = useState(false);

  async function copyPhone() {
    if (!contact.phone) return;
    try {
      await navigator.clipboard.writeText(contact.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Não foi possível copiar o telefone.");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-semibold">{contact.name}</p>
      <p className="text-xs text-muted-foreground">{contact.company}</p>
      {contact.phone ? (
        <div className="flex items-center gap-2">
          <a
            href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1 text-primary hover:underline"
          >
            <MessageCircle className="h-4 w-4" /> {contact.phone}
          </a>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={copyPhone}
            aria-label="Copiar telefone"
          >
            {copied ? (
              <><Check className="mr-1 h-3.5 w-3.5" /> Copiado</>
            ) : (
              <><Copy className="mr-1 h-3.5 w-3.5" /> Copiar telefone</>
            )}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground">Sem WhatsApp cadastrado.</p>
      )}
      {contact.email && (
        <p>
          ✉️ <a href={`mailto:${contact.email}`} className="text-primary hover:underline">{contact.email}</a>
        </p>
      )}
    </div>
  );
}

function ProfileCard({ profile }: { profile: OwnProfileDTO }) {
  const seg = SEGMENTS.find((s) => s.id === profile.segment_id);
  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">{profile.company}</h3>
      <p className="text-sm text-muted-foreground">
        {profile.name} · {seg?.emoji} {seg?.label ?? profile.segment_id} · {profile.city}
      </p>
      <p className="mt-4 text-sm">{profile.summary}</p>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ofereço
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {profile.offers.map((o) => (
              <Badge key={o.id} variant="secondary">
                {o.label}
              </Badge>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Procuro
          </p>
          <ul className="mt-2 space-y-1 text-sm">
            {profile.needs.map((n) => (
              <li key={n.id}>
                <Badge variant="outline" className="mr-1">
                  {NEED_KIND_LABELS[n.need_kind] ?? n.need_kind}
                </Badge>
                {n.label}
                {n.is_priority && (
                  <span className="ml-1 text-xs text-warning">★ prioridade</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-6 flex gap-2">
        <Button asChild variant="outline">
          <Link to="/participar">Editar (recomeça o wizard)</Link>
        </Button>
      </div>
    </Card>
  );
}

function RecoveryView() {
  const navigate = useNavigate();
  const [whatsapp, setWhatsapp] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [rotatedCode, setRotatedCode] = useState<string | null>(null);
  const recoverMutation = useRecoverProfile();

  async function recover() {
    setError(null);
    try {
      const res = await recoverMutation.mutateAsync({
        eventId: EVENT_ID,
        whatsapp,
        code,
      });
      if (res.newRecoveryCode) {
        setRotatedCode(res.newRecoveryCode);
      } else {
        toast.success("Bem-vindo(a) de volta!");
        navigate({ to: "/participante" });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao recuperar.");
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-12">
        <Card className="p-6">
          <h1 className="font-display text-2xl font-bold">Recuperar meu perfil</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Informe o WhatsApp e o código pessoal recebidos quando criou o perfil.
          </p>
          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="wa">WhatsApp</Label>
              <Input
                id="wa"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
                placeholder="(64) 99999-9999"
                inputMode="tel"
              />
            </div>
            <div>
              <Label htmlFor="code">Código pessoal</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="Ex.: A1B2C3"
                className="font-mono uppercase"
              />
            </div>
            {error && (
              <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                {error}
              </p>
            )}
            <Button
              onClick={recover}
              className="w-full"
              disabled={!whatsapp || !code || recoverMutation.isPending}
            >
              {recoverMutation.isPending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Recuperando…</>
              ) : (
                "Entrar"
              )}
            </Button>
          </div>
          <div className="mt-6 text-center text-sm text-muted-foreground">
            Primeiro acesso?{" "}
            <Link to="/participar" className="font-medium text-primary hover:underline">
              Criar meu perfil
            </Link>
          </div>
        </Card>
      </section>

      <RecoveryCodeDialog
        open={rotatedCode !== null}
        code={rotatedCode}
        onConfirm={() => {
          setRotatedCode(null);
          toast.success("Bem-vindo(a) de volta!");
          navigate({ to: "/participante" });
        }}
        title="Seu novo código de recuperação"
        description="Rotacionamos seu código por segurança. Guarde-o em local seguro — o antigo deixou de funcionar."
      />
    </PageShell>
  );
}
