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
  Heart,
  HeartHandshake,
  KeyRound,
  Loader2,
  LogOut,
  MapPin,
  MessageCircle,
  Sparkles,
  X,
} from "lucide-react";

import { store, useStoreSelector } from "@/lib/store";
import { supabase } from "@/integrations/supabase/client";
import { LABEL_TEXT } from "@/domains/matching/score";
import { SEGMENTS, NEED_KIND_LABELS } from "@/lib/mock-data";
import type { Match, Profile } from "@/lib/types";
import { RecoveryCodeDialog } from "@/components/RecoveryCodeDialog";
import {
  translateRevealError,
  useRevealContact,
  type RevealedContact,
} from "@/features/connections/useRevealContact";

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
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const data = useStoreSelector(() => {
    const sessionId = store.session.get();
    if (!sessionId) return { sessionId: null as string | null, profile: null as Profile | null, matches: [] as Match[] };
    const profile = store.getProfile(sessionId) ?? null;
    const matches = profile ? store.matchesFor(profile.id) : [];
    return { sessionId, profile, matches };
  });

  // Session referencing a missing profile → clear once, in an effect (never during render).
  useEffect(() => {
    if (hydrated && data.sessionId && !data.profile) {
      store.session.clear();
    }
  }, [hydrated, data.sessionId, data.profile]);

  if (!hydrated) {
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

  if (!data.sessionId || !data.profile) return <RecoveryView />;
  const profile = data.profile;
  const matches = data.matches;
  const mutual = matches.filter(
    (m) => m.decisionA === "interesse" && m.decisionB === "interesse",
  );
  const interested = matches.filter(
    (m) =>
      (m.aProfileId === profile.id && m.decisionA === "interesse") ||
      (m.bProfileId === profile.id && m.decisionB === "interesse"),
  );


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
              onClick={() => {
                store.session.clear();
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
            <MatchesList profile={profile} matches={matches} />
          </TabsContent>
          <TabsContent value="interested" className="mt-6">
            <MatchesList profile={profile} matches={interested} emptyMessage="Você ainda não marcou interesse em ninguém." />
          </TabsContent>
          <TabsContent value="connections" className="mt-6">
            <ConnectionsList profile={profile} matches={mutual} />
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

  async function rotate() {
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
      <Button variant="outline" size="sm" onClick={rotate} disabled={loading}>
        {loading ? (
          <Loader2 className="mr-1 h-4 w-4 animate-spin" />
        ) : (
          <KeyRound className="mr-1 h-4 w-4" />
        )}
        Gerar novo código
      </Button>
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
  profile,
  matches,
  emptyMessage,
}: {
  profile: Profile;
  matches: Match[];
  emptyMessage?: string;
}) {
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
        <MatchCard key={m.id} match={m} profile={profile} />
      ))}
    </div>
  );
}

function MatchCard({ match, profile }: { match: Match; profile: Profile }) {
  const isA = match.aProfileId === profile.id;
  const otherId = isA ? match.bProfileId : match.aProfileId;
  const other = store.getProfile(otherId);
  if (!other) return null;
  const myDecision = isA ? match.decisionA : match.decisionB;
  const theirDecision = isA ? match.decisionB : match.decisionA;
  const reasons = isA ? match.reasonsForA : match.reasonsForB;
  const mutual = myDecision === "interesse" && theirDecision === "interesse";
  const seg = SEGMENTS.find((s) => s.id === other.segmentId);

  function decide(d: "interesse" | "agora_nao") {
    store.decideMatch(match.id, profile.id, d);
    if (d === "interesse" && theirDecision === "interesse") {
      toast.success("Deu match! 🎉 A equipe vai apresentar vocês.");
    } else if (d === "interesse") {
      toast("Interesse registrado. Aguardando a outra parte.");
    }
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
              {other.name} · {seg?.emoji} {seg?.label}
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
            {reasons.map((r) => (
              <li key={r.code} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-secondary" />
                <span>{r.detail}</span>
              </li>
            ))}
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
                {other.offers.map((o) => (
                  <Badge key={o.id} variant="secondary">
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
                {other.needs.map((n) => (
                  <li key={n.id}>
                    <Badge variant="outline" className="mr-1">
                      {NEED_KIND_LABELS[n.kind]}
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
              disabled={myDecision === "interesse"}
            >
              <Heart className="mr-1 h-4 w-4" />
              {myDecision === "interesse" ? "Interesse enviado" : "Tenho interesse"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => decide("agora_nao")}
              disabled={myDecision === "agora_nao"}
            >
              <X className="mr-1 h-4 w-4" /> Agora não
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function ConnectionsList({
  profile,
  matches,
}: {
  profile: Profile;
  matches: Match[];
}) {
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
      {matches.map((m) => {
        const otherId = m.aProfileId === profile.id ? m.bProfileId : m.aProfileId;
        const other = store.getProfile(otherId);
        if (!other) return null;
        return <ConnectionRow key={m.id} matchId={m.id} other={other} />;
      })}
    </div>
  );
}

function ConnectionRow({ matchId, other }: { matchId: string; other: Profile }) {
  const { contact, error, loading, reveal, clear } = useRevealContact();
  const [open, setOpen] = useState(false);

  async function handleReveal() {
    setOpen(true);
    await reveal(matchId);
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h4 className="font-display font-semibold">{other.company}</h4>
          <p className="text-sm text-muted-foreground">
            {other.name} · {other.city}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleReveal} disabled={loading}>
          {loading ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : (
            <MessageCircle className="mr-1 h-4 w-4" />
          )}
          Ver contato
        </Button>
      </div>

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
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-3 text-sm">
      <p className="font-semibold">{contact.name}</p>
      <p className="text-xs text-muted-foreground">{contact.company}</p>
      {contact.phone ? (
        <a
          href={`https://wa.me/${contact.phone.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-primary hover:underline"
        >
          <MessageCircle className="h-4 w-4" /> {contact.phone}
        </a>
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

function ProfileCard({ profile }: { profile: Profile }) {
  const seg = SEGMENTS.find((s) => s.id === profile.segmentId);
  return (
    <Card className="p-6">
      <h3 className="font-display text-lg font-semibold">{profile.company}</h3>
      <p className="text-sm text-muted-foreground">
        {profile.name} · {seg?.emoji} {seg?.label} · {profile.city}
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
                  {NEED_KIND_LABELS[n.kind]}
                </Badge>
                {n.label}
                {n.isPriority && (
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

  async function recover() {
    setError(null);
    const p = await store.recoverProfile(whatsapp, code);
    if (!p) {
      setError("Não encontramos um perfil com esses dados, ou o código está bloqueado por tentativas. Tente novamente em alguns minutos.");
      return;
    }
    store.session.set(p.id);
    toast.success(`Bem-vindo(a) de volta, ${p.name.split(" ")[0]}!`);
    navigate({ to: "/participante" });
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
            <Button onClick={recover} className="w-full" disabled={!whatsapp || !code}>
              Entrar
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
    </PageShell>
  );
}
