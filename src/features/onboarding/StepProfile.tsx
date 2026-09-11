import { useState, type ReactNode } from "react";
import {
  User,
  Building2,
  Phone,
  Instagram,
  LayoutGrid,
  BarChart2,
  Briefcase,
  FileText,
  ArrowRight,
  Loader2,
} from "lucide-react";
import type { SocialLookupUiState } from "./steps";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { EventCatalog } from "@/features/participant/types";
import type { BusinessSize, BusinessType, WizardDraft, WizardMode } from "./types";
import {
  BUSINESS_SIZE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  profileSelectableSegments,
} from "./BusinessProfileCriteria";
import { phoneCreateSchema, phoneEditSchema } from "./schemas";

interface StepProfileProps {
  draft: WizardDraft;
  update: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void;
  phone: string;
  onPhoneChange: (val: string) => void;
  catalog: EventCatalog;
  mode: WizardMode;
  onNext: () => void;
  resetAction?: ReactNode;
  manualMode?: boolean;
  social?: SocialLookupUiState;
}

export function StepProfile({
  draft,
  update,
  phone,
  onPhoneChange,
  catalog,
  mode,
  onNext,
  manualMode = false,
  social,
}: StepProfileProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const selectableSegments = profileSelectableSegments(catalog.segments);

  function handleSegmentChange(segmentId: string) {
    if (draft.segmentId && draft.segmentId !== segmentId) {
      const prev = draft.segmentId;
      update(
        "offers",
        draft.offers.map((o) =>
          !o.taxonomyItemId && o.segmentId === prev ? { ...o, segmentId } : o,
        ),
      );
      update(
        "needs",
        draft.needs.map((n) =>
          !n.taxonomyItemId && n.segmentId === prev ? { ...n, segmentId } : n,
        ),
      );
    }
    update("segmentId", segmentId);
  }

  function handleContinue() {
    const errs: Record<string, string> = {};

    if (draft.name.trim().length < 2) {
      errs.name = "Informe seu nome completo.";
    }
    if (draft.company.trim().length < 2) {
      errs.company = "Informe o nome da sua empresa.";
    }

    const phoneSchema = mode === "create" ? phoneCreateSchema : phoneEditSchema;
    const phoneResult = phoneSchema.safeParse(phone);
    if (!phoneResult.success) {
      errs.whatsapp = phoneResult.error.issues[0]?.message ?? "Informe um WhatsApp válido.";
    }

    if (!draft.segmentId) {
      errs.segmentId = "Selecione o segmento de atuação.";
    }
    if (!draft.businessSize) {
      errs.businessSize = "Selecione o porte da empresa.";
    }
    if (!draft.businessType) {
      errs.businessType = "Selecione o tipo principal.";
    }
    if (draft.summary.trim().length === 0) {
      errs.summary = "Descreva brevemente o que sua empresa faz.";
    }
    if (!draft.consent) {
      errs.consent = "É necessário aceitar os termos de consentimento para continuar.";
    }

    // Default city to Rio Verde if not set
    if (!draft.city.trim()) {
      update("city", "Rio Verde");
    }

    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      onNext();
    }
  }

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl border border-blue-500/30 bg-[#0c1533]/95 p-5 sm:p-8 shadow-[0_0_40px_rgba(15,30,80,0.4)] backdrop-blur-xl transition-all">
      {/* Top progress indicator */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs sm:text-sm font-medium text-slate-400">
          <span>Etapa 1 de 2</span>
          <span>Seu perfil</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
          <div
            className="h-full w-1/2 rounded-full bg-gradient-to-r from-cyan-400 to-[#00d2ff] shadow-[0_0_10px_rgba(0,210,255,0.5)] transition-all duration-500"
            role="progressbar"
            aria-valuenow={50}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Header with Icon and Title */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-500/40 bg-blue-600/20 text-cyan-400 shadow-inner">
          <User className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Seu perfil
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Conte o essencial sobre você e sua empresa.
          </p>
        </div>
      </div>

      {/* Form Fields Grid */}
      <div className="space-y-4">
        {/* Row 1: Nome and Empresa */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="input-name" className="text-xs font-semibold text-slate-300">
              Nome
            </Label>
            <div className="relative mt-1.5">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <User className="h-4 w-4" />
              </div>
              <Input
                id="input-name"
                value={draft.name}
                onChange={(e) => update("name", e.target.value)}
                placeholder="Ex.: Ana Ribeiro"
                autoComplete="name"
                className="h-11 rounded-xl border-blue-900/60 bg-[#09122c] pl-10 text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
            {errors.name && <p className="mt-1 text-xs text-rose-400">{errors.name}</p>}
          </div>

          <div>
            <Label htmlFor="input-company" className="text-xs font-semibold text-slate-300">
              Empresa
            </Label>
            <div className="relative mt-1.5">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Building2 className="h-4 w-4" />
              </div>
              <Input
                id="input-company"
                value={draft.company}
                onChange={(e) => update("company", e.target.value)}
                placeholder="Ex.: Ribeiro Consultoria"
                autoComplete="organization"
                className="h-11 rounded-xl border-blue-900/60 bg-[#09122c] pl-10 text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
            {errors.company && <p className="mt-1 text-xs text-rose-400">{errors.company}</p>}
          </div>
        </div>

        {/* Row 2: WhatsApp and Instagram */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="input-phone" className="text-xs font-semibold text-slate-300">
              WhatsApp
            </Label>
            <div className="relative mt-1.5">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Phone className="h-4 w-4" />
              </div>
              <Input
                id="input-phone"
                value={phone}
                onChange={(e) => onPhoneChange(e.target.value)}
                placeholder="(64) 99999-9999"
                inputMode="tel"
                autoComplete="tel"
                className="h-11 rounded-xl border-blue-900/60 bg-[#09122c] pl-10 text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
            {errors.whatsapp && <p className="mt-1 text-xs text-rose-400">{errors.whatsapp}</p>}
          </div>

          <div>
            <Label htmlFor="input-instagram" className="text-xs font-semibold text-slate-300">
              Instagram (opcional)
            </Label>
            <div className="relative mt-1.5">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Instagram className="h-4 w-4" />
              </div>
              <Input
                id="input-instagram"
                value={draft.instagram}
                onChange={(e) => update("instagram", e.target.value)}
                placeholder="@seuinstagram"
                autoComplete="off"
                className="h-11 rounded-xl border-blue-900/60 bg-[#09122c] pl-10 text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
              />
            </div>
            {social && social.status === "done" && social.message && (
              <p
                className={`mt-1 text-xs ${
                  social.result?.status === "ok" ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                {social.message}
              </p>
            )}
          </div>
        </div>

        {/* Row 3: Segmento and Porte da empresa */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-slate-300">Segmento</Label>
            <div className="mt-1.5">
              <Select
                value={draft.segmentId || undefined}
                onValueChange={handleSegmentChange}
                disabled={manualMode}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-blue-900/60 bg-[#09122c] text-white hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40">
                  <div className="flex items-center gap-2 text-slate-200">
                    <LayoutGrid className="h-4 w-4 text-slate-400 shrink-0" />
                    <SelectValue placeholder="Selecione seu segmento" />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-blue-800 bg-[#0b1432] text-white">
                  {selectableSegments.map((seg) => (
                    <SelectItem
                      key={seg.id}
                      value={seg.id}
                      className="cursor-pointer focus:bg-blue-600/30 focus:text-cyan-300"
                    >
                      {seg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.segmentId && <p className="mt-1 text-xs text-rose-400">{errors.segmentId}</p>}
          </div>

          <div>
            <Label className="text-xs font-semibold text-slate-300">Porte da empresa</Label>
            <div className="mt-1.5">
              <Select
                value={draft.businessSize || undefined}
                onValueChange={(v) => update("businessSize", v as BusinessSize)}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-blue-900/60 bg-[#09122c] text-white hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40">
                  <div className="flex items-center gap-2 text-slate-200">
                    <BarChart2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <SelectValue placeholder="Selecione o porte" />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-blue-800 bg-[#0b1432] text-white">
                  {BUSINESS_SIZE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="cursor-pointer focus:bg-blue-600/30 focus:text-cyan-300"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.businessSize && (
              <p className="mt-1 text-xs text-rose-400">{errors.businessSize}</p>
            )}
          </div>
        </div>

        {/* Row 4: Tipo principal */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="text-xs font-semibold text-slate-300">Tipo principal</Label>
            <div className="mt-1.5">
              <Select
                value={draft.businessType || undefined}
                onValueChange={(v) => update("businessType", v as BusinessType)}
              >
                <SelectTrigger className="h-11 w-full rounded-xl border-blue-900/60 bg-[#09122c] text-white hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40">
                  <div className="flex items-center gap-2 text-slate-200">
                    <Briefcase className="h-4 w-4 text-slate-400 shrink-0" />
                    <SelectValue placeholder="Selecione o tipo" />
                  </div>
                </SelectTrigger>
                <SelectContent className="border-blue-800 bg-[#0b1432] text-white">
                  {BUSINESS_TYPE_OPTIONS.map((opt) => (
                    <SelectItem
                      key={opt.value}
                      value={opt.value}
                      className="cursor-pointer focus:bg-blue-600/30 focus:text-cyan-300"
                    >
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {errors.businessType && (
              <p className="mt-1 text-xs text-rose-400">{errors.businessType}</p>
            )}
          </div>
        </div>

        {/* Row 5: O que sua empresa faz? */}
        <div>
          <Label htmlFor="input-summary" className="text-xs font-semibold text-slate-300">
            O que sua empresa faz?
          </Label>
          <div className="relative mt-1.5">
            <div className="pointer-events-none absolute top-3 left-3.5 text-slate-400">
              <FileText className="h-4 w-4" />
            </div>
            <Textarea
              id="input-summary"
              value={draft.summary}
              onChange={(e) => update("summary", e.target.value.slice(0, 300))}
              placeholder="Descreva brevemente..."
              maxLength={300}
              className="min-h-[105px] resize-none rounded-xl border-blue-900/60 bg-[#09122c] pt-2.5 pl-10 pr-14 pb-7 text-sm text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40"
            />
            <span className="pointer-events-none absolute right-3 bottom-2.5 text-xs text-slate-500 font-mono">
              {draft.summary.length}/300
            </span>
          </div>
          {errors.summary && <p className="mt-1 text-xs text-rose-400">{errors.summary}</p>}
        </div>
      </div>

      {/* Footer of Card 1 */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-blue-500/20 pt-6">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <Checkbox
            checked={draft.consent}
            onCheckedChange={(v) => update("consent", Boolean(v))}
            className="mt-0.5 border-blue-500/50 data-[state=checked]:bg-cyan-400 data-[state=checked]:border-cyan-400 data-[state=checked]:text-[#02182b]"
          />
          <span className="text-xs sm:text-sm text-slate-300 leading-snug">
            Concordo com o uso das minhas informações para gerar conexões durante o evento.
          </span>
        </label>
        {errors.consent && (
          <p className="text-xs text-rose-400 sm:hidden">{errors.consent}</p>
        )}

        <Button
          type="button"
          onClick={handleContinue}
          disabled={social?.status === "loading"}
          className="h-11 shrink-0 rounded-xl bg-[#00c8ff] px-6 text-sm font-bold text-[#02182b] hover:bg-cyan-300 shadow-[0_0_20px_rgba(0,200,255,0.3)] transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-75"
        >
          {social?.status === "loading" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-[#02182b]" />
              Preparando sugestões…
            </>
          ) : (
            <>
              Continuar
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
      {errors.consent && (
        <p className="mt-2 hidden text-xs text-rose-400 sm:block">{errors.consent}</p>
      )}
    </div>
  );
}
