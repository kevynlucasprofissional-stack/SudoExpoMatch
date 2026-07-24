import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogOut, ShieldAlert, Trash2, UserPlus } from "lucide-react";

import { PageShell } from "@/components/brand/BrandShell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

import { EVENT_ID } from "@/lib/mock-data";
import { useSession } from "@/features/auth/useSession";
import { useEventRole } from "@/features/staff/useEventRole";
import { signOut } from "@/features/auth/actions";
import {
  addMemberSchema,
  parseActiveConnectionsCount,
  translateStaffError,
  useAddStaffMember,
  useChangeStaffRole,
  useEventStaffMembers,
  useRemoveStaffMember,
  type StaffMember,
  type AppRole,
} from "@/features/admin/useEventStaff";
import { OperationalStatsCard } from "@/features/staff/OperationalStatsCard";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — Matchmaker SudoExpo" },
      {
        name: "description",
        content: "Gestão de equipe e permissões do Matchmaker SudoExpo.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading } = useSession();
  const roleQuery = useEventRole(EVENT_ID);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/equipe" });
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <PageShell>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Skeleton className="h-8 w-64" />
        </div>
      </PageShell>
    );
  }

  if (roleQuery.isLoading) {
    return (
      <PageShell>
        <div className="mx-auto max-w-3xl px-4 py-12">
          <Skeleton className="h-40 w-full" />
        </div>
      </PageShell>
    );
  }

  if (roleQuery.data !== "admin") {
    return (
      <PageShell>
        <section className="mx-auto max-w-md px-4 py-12">
          <Card className="p-6 text-center">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-3 font-display text-xl font-semibold">Acesso negado</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Apenas administradores do evento acessam esta página.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button asChild variant="outline">
                <Link to="/equipe">Voltar</Link>
              </Button>
              <Button variant="ghost" onClick={() => signOut()}>
                <LogOut className="mr-1 h-4 w-4" /> Sair
              </Button>
            </div>
          </Card>
        </section>
      </PageShell>
    );
  }

  return <AdminDashboard email={user?.email ?? ""} userId={user?.id ?? ""} />;
}

function AdminDashboard({ email, userId }: { email: string; userId: string }) {
  const listQuery = useEventStaffMembers(EVENT_ID, true);
  const add = useAddStaffMember(EVENT_ID);
  const change = useChangeStaffRole(EVENT_ID);
  const remove = useRemoveStaffMember(EVENT_ID);

  const [emailInput, setEmailInput] = useState("");
  const [roleInput, setRoleInput] = useState<AppRole>("staff");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [toRemove, setToRemove] = useState<StaffMember | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");
  const [pendingActiveCount, setPendingActiveCount] = useState<number | null>(
    null,
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = addMemberSchema.safeParse({
      email: emailInput,
      role: roleInput,
    });
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const i of parsed.error.issues) errs[String(i.path[0])] = i.message;
      setErrors(errs);
      return;
    }
    try {
      await add.mutateAsync(parsed.data);
      toast.success(`${parsed.data.email} adicionado como ${parsed.data.role}.`);
      setEmailInput("");
      setRoleInput("staff");
    } catch (err) {
      toast.error(translateStaffError(err));
    }
  }

  async function handleChange(m: StaffMember, newRole: AppRole) {
    if (m.role === newRole) return;
    try {
      await change.mutateAsync({ userId: m.userId, role: newRole });
      toast.success(`Papel de ${m.email} alterado para ${newRole}.`);
    } catch (err) {
      toast.error(translateStaffError(err));
    }
  }

  async function handleRemove() {
    if (!toRemove) return;
    const isSelf = toRemove.userId === userId;
    try {
      await remove.mutateAsync({
        userId: toRemove.userId,
        reassignTo: reassignTo || undefined,
        confirmSelf: isSelf,
      });
      toast.success(`${toRemove.email} removido da equipe.`);
      setToRemove(null);
      setReassignTo("");
      setPendingActiveCount(null);
    } catch (err) {
      const count = parseActiveConnectionsCount(err);
      if (count !== null) {
        // Não fechamos o diálogo — o usuário precisa escolher um substituto.
        setPendingActiveCount(count);
        toast.error(translateStaffError(err));
        return;
      }
      toast.error(translateStaffError(err));
      setToRemove(null);
      setReassignTo("");
    }
  }

  return (
    <PageShell>
      <section className="mx-auto max-w-3xl px-4 py-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-primary">Administração</p>
            <h1 className="font-display text-2xl font-bold md:text-3xl">
              Equipe do evento
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {email} · <Badge>admin</Badge>
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/equipe">Fila de conexões</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => signOut()}>
              <LogOut className="mr-1 h-4 w-4" /> Sair
            </Button>
          </div>
        </header>

        <section aria-labelledby="team-heading" className="space-y-6">
          <div className="flex items-end justify-between gap-4">
            <h2
              id="team-heading"
              className="font-display text-xl font-semibold"
            >
              Equipe do evento
            </h2>
            <p className="text-xs text-muted-foreground">
              Membros, papéis, convites e remoção com reatribuição.
            </p>
          </div>

          <Card className="p-6">
            <h3 className="mb-4 flex items-center gap-2 font-display text-lg font-semibold">
              <UserPlus className="h-5 w-5 text-primary" /> Adicionar membro
            </h3>
            <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
              <div>
                <Label htmlFor="member-email" className="sr-only">E-mail</Label>
                <Input
                  id="member-email"
                  type="email"
                  placeholder="pessoa@acirv.com.br"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  autoComplete="off"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-destructive">{errors.email}</p>
                )}
              </div>
              <Select value={roleInput} onValueChange={(v) => setRoleInput(v as AppRole)}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={add.isPending}>
                {add.isPending ? "Adicionando…" : "Adicionar"}
              </Button>
            </form>
            <p className="mt-3 text-xs text-muted-foreground">
              A pessoa precisa ter criado uma conta antes (via login). O convite por e-mail
              será enviado em uma próxima fase.
            </p>
          </Card>

          <Card>
            <div className="border-b p-4">
              <h3 className="font-display text-lg font-semibold">Membros da equipe</h3>
            </div>
            {listQuery.isLoading ? (
              <div className="p-4">
                <Skeleton className="h-24 w-full" />
              </div>
            ) : listQuery.isError ? (
              <p className="p-6 text-sm text-destructive">
                Falha ao carregar equipe.
              </p>
            ) : (listQuery.data ?? []).length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Ainda sem membros.</p>
            ) : (
              <ul className="divide-y">
                {(listQuery.data ?? []).map((m) => {
                  const self = m.userId === userId;
                  return (
                    <li key={m.userId} className="flex items-center justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {m.email}{" "}
                          {self && <span className="text-xs text-muted-foreground">(você)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          desde {new Date(m.createdAt).toLocaleDateString("pt-BR")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={m.role}
                          onValueChange={(v) => handleChange(m, v as AppRole)}
                          disabled={change.isPending}
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Remover ${m.email}`}
                          onClick={() => setToRemove(m)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>

        <section aria-labelledby="ops-heading" className="mt-10 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2
                id="ops-heading"
                className="font-display text-xl font-semibold"
              >
                Operação
              </h2>
              <p className="text-xs text-muted-foreground">
                Indicadores em tempo real e acesso rápido à fila de atendimento.
              </p>
            </div>
            <Button asChild size="sm">
              <Link to="/equipe">Abrir fila operacional</Link>
            </Button>
          </div>
          <OperationalStatsCard eventId={EVENT_ID} />
        </section>
      </section>

      <AlertDialog
        open={toRemove !== null}
        onOpenChange={(o) => {
          if (!o) {
            setToRemove(null);
            setReassignTo("");
            setPendingActiveCount(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {toRemove?.userId === userId
                ? "Remover você mesmo da equipe?"
                : "Remover da equipe?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {toRemove?.email} perderá o acesso à fila de conexões e às ações
              de equipe deste evento. Esta ação pode ser desfeita adicionando-
              o(a) novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingActiveCount !== null && (
            <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <p>
                Este membro tem <strong>{pendingActiveCount}</strong> conexão
                (ões) em andamento. Escolha quem receberá:
              </p>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger>
                  <SelectValue placeholder="Escolha um membro" />
                </SelectTrigger>
                <SelectContent>
                  {(listQuery.data ?? [])
                    .filter((m) => m.userId !== toRemove?.userId)
                    .map((m) => (
                      <SelectItem key={m.userId} value={m.userId}>
                        {m.email} ({m.role})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRemove}
              disabled={
                remove.isPending ||
                (pendingActiveCount !== null && !reassignTo)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
