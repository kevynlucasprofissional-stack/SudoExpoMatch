import { useState, useMemo, useRef, useEffect, type ReactNode } from "react";
import {
  Network,
  Upload,
  Target,
  Search,
  Plus,
  Star,
  X,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Users,
  BarChart2,
  Briefcase,
  LayoutGrid,
  Loader2,
  Sparkles,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import type { EventCatalog, CatalogTaxonomyItem } from "@/features/participant/types";
import type {
  BusinessSize,
  BusinessType,
  NeedKind,
  SuggestionItem,
  TargetBusinessSize,
  TargetBusinessType,
  TargetSegmentId,
  WizardDraft,
  WizardNeed,
  WizardOffer,
} from "./types";
import { cryptoUid } from "./draft";
import {
  ANY_LABEL,
  BUSINESS_SIZE_OPTIONS,
  BUSINESS_TYPE_OPTIONS,
  profileSelectableSegments,
} from "./BusinessProfileCriteria";
import { useAutoAiSuggestions } from "./useAutoAiSuggestions";
import { buildSuggestionFeed, suggestionIdentity } from "./suggestionFeed";
import { heuristicSuggestionProvider } from "./suggestions";
import type { SharedAiAnalysis } from "./aiAnalysisState";
import type { SocialBusinessContext } from "@/lib/social-context";
import type { SocialBusinessAnalysis } from "@/lib/social-analysis";

interface StepConnectionsProps {
  draft: WizardDraft;
  update: <K extends keyof WizardDraft>(k: K, v: WizardDraft[K]) => void;
  catalog: EventCatalog;
  eventId: string;
  aiAnalysis?: SharedAiAnalysis;
  socialContext?: SocialBusinessContext | null;
  socialAnalysis?: SocialBusinessAnalysis | null;
  onBack: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  resetAction?: ReactNode;
}

export function StepConnections({
  draft,
  update,
  catalog,
  eventId,
  aiAnalysis,
  socialContext,
  socialAnalysis,
  onBack,
  onSubmit,
  isSubmitting = false,
}: StepConnectionsProps) {
  // Accordion state for "Quero refinar meus matches"
  const [refineOpen, setRefineOpen] = useState(false);

  // Search input states
  const [offerInput, setOfferInput] = useState("");
  const [needInput, setNeedInput] = useState("");
  const [offerDropdownOpen, setOfferDropdownOpen] = useState(false);
  const [needDropdownOpen, setNeedDropdownOpen] = useState(false);

  // Errors state
  const [errors, setErrors] = useState<{ offers?: string; needs?: string; general?: string }>({});

  const selectableSegments = profileSelectableSegments(catalog.segments);

  // Ensure default targets are "any"
  useEffect(() => {
    if (!draft.targetBusinessSize) update("targetBusinessSize", "any");
    if (!draft.targetBusinessType) update("targetBusinessType", "any");
    if (!draft.targetSegmentId) update("targetSegmentId", "any");
  }, [draft.targetBusinessSize, draft.targetBusinessType, draft.targetSegmentId, update]);

  // ------------------------------------------------------------------
  // AI and Heuristic Suggestions
  // ------------------------------------------------------------------
  const [heuristicOffers, setHeuristicOffers] = useState<SuggestionItem[]>([]);
  const [heuristicNeeds, setHeuristicNeeds] = useState<SuggestionItem[]>([]);

  useEffect(() => {
    if (!draft.segmentId) return;
    let cancelled = false;
    heuristicSuggestionProvider
      .suggest({
        segmentId: draft.segmentId,
        summary: draft.summary,
        catalog,
      })
      .then((res) => {
        if (cancelled) return;
        setHeuristicOffers(res.items.filter((i) => i.kind === "offer"));
        setHeuristicNeeds(res.items.filter((i) => i.kind === "need"));
      })
      .catch(() => {
        if (cancelled) return;
        setHeuristicOffers([]);
        setHeuristicNeeds([]);
      });
    return () => {
      cancelled = true;
    };
  }, [catalog, draft.segmentId, draft.summary]);

  const { items: aiOffers } = useAutoAiSuggestions({
    focus: "offers",
    enabled: Boolean(eventId && aiAnalysis),
    eventId,
    segmentId: draft.segmentId,
    summary: draft.summary,
    businessSize: draft.businessSize,
    businessType: draft.businessType,
    niche: draft.niche,
    socialContext: socialContext ?? null,
    socialAnalysis: socialAnalysis ?? null,
    existingLabels: draft.offers.map((o) => o.label),
    analysis: aiAnalysis,
  });

  const { items: aiNeeds } = useAutoAiSuggestions({
    focus: "needs",
    enabled: Boolean(eventId && aiAnalysis),
    eventId,
    segmentId: draft.segmentId,
    summary: draft.summary,
    businessSize: draft.businessSize,
    businessType: draft.businessType,
    niche: draft.niche,
    socialContext: socialContext ?? null,
    socialAnalysis: socialAnalysis ?? null,
    existingLabels: draft.needs.map((n) => n.label),
    analysis: aiAnalysis,
  });

  const offerFeed = useMemo(
    () =>
      buildSuggestionFeed({
        kind: "offer",
        heuristic: heuristicOffers,
        ai: aiOffers,
        existing: draft.offers,
      }),
    [heuristicOffers, aiOffers, draft.offers],
  );

  const needFeed = useMemo(
    () =>
      buildSuggestionFeed({
        kind: "need",
        heuristic: heuristicNeeds,
        ai: aiNeeds,
        existing: draft.needs,
      }),
    [heuristicNeeds, aiNeeds, draft.needs],
  );

  // Taxonomy catalog filtered by segment and kind
  const taxonomyOffers = useMemo(() => {
    const q = offerInput.trim().toLowerCase();
    return catalog.taxonomy
      .filter((t) => t.kind === "offer" || t.kind === "both")
      .filter((t) => {
        if (!q) return t.segment_id === draft.segmentId;
        return (
          t.label.toLowerCase().includes(q) ||
          t.synonyms.some((s) => s.toLowerCase().includes(q))
        );
      })
      .slice(0, 15);
  }, [catalog.taxonomy, draft.segmentId, offerInput]);

  const taxonomyNeeds = useMemo(() => {
    const q = needInput.trim().toLowerCase();
    return catalog.taxonomy
      .filter((t) => t.kind === "need" || t.kind === "both")
      .filter((t) => {
        if (!q) return true;
        return (
          t.label.toLowerCase().includes(q) ||
          t.synonyms.some((s) => s.toLowerCase().includes(q))
        );
      })
      .slice(0, 15);
  }, [catalog.taxonomy, needInput]);

  // ------------------------------------------------------------------
  // Add / Remove Offers
  // ------------------------------------------------------------------
  function addOffer(label: string, taxonomyItemId: string | null = null, segmentId?: string | null) {
    const clean = label.trim();
    if (clean.length < 2 || draft.offers.length >= 5) return;
    if (draft.offers.some((o) => o.label.toLowerCase() === clean.toLowerCase())) {
      setOfferInput("");
      return;
    }
    const newOffer: WizardOffer = {
      localId: cryptoUid(),
      label: clean.slice(0, 80),
      segmentId: segmentId || draft.segmentId,
      taxonomyItemId,
      source: "user",
    };
    update("offers", [...draft.offers, newOffer]);
    setOfferInput("");
    setOfferDropdownOpen(false);
    setErrors((prev) => ({ ...prev, offers: undefined }));
  }

  function removeOffer(localId: string) {
    update(
      "offers",
      draft.offers.filter((o) => o.localId !== localId),
    );
  }

  // ------------------------------------------------------------------
  // Add / Remove Needs
  // ------------------------------------------------------------------
  function addNeed(
    label: string,
    taxonomyItemId: string | null = null,
    segmentId?: string | null,
    needKind: NeedKind = "servico",
  ) {
    const clean = label.trim();
    if (clean.length < 2 || draft.needs.length >= 5) return;
    if (draft.needs.some((n) => n.label.toLowerCase() === clean.toLowerCase())) {
      setNeedInput("");
      return;
    }
    // If it's the first need, it automatically gets priority!
    const isPriority = draft.needs.length === 0;

    const newNeed: WizardNeed = {
      localId: cryptoUid(),
      label: clean.slice(0, 80),
      segmentId: segmentId || draft.segmentId,
      taxonomyItemId,
      needKind,
      isPriority,
      source: "user",
    };
    update("needs", [...draft.needs, newNeed]);
    setNeedInput("");
    setNeedDropdownOpen(false);
    setErrors((prev) => ({ ...prev, needs: undefined }));
  }

  function removeNeed(localId: string) {
    const filtered = draft.needs.filter((n) => n.localId !== localId);
    // If we removed the priority need and others remain, assign priority to the first one
    if (filtered.length > 0 && !filtered.some((n) => n.isPriority)) {
      filtered[0] = { ...filtered[0]!, isPriority: true };
    }
    update("needs", filtered);
  }

  function togglePriority(localId: string) {
    update(
      "needs",
      draft.needs.map((n) => ({
        ...n,
        isPriority: n.localId === localId,
      })),
    );
  }

  // ------------------------------------------------------------------
  // Submit Validation
  // ------------------------------------------------------------------
  function handleFormSubmit() {
    const errs: { offers?: string; needs?: string; general?: string } = {};

    if (draft.offers.length < 1) {
      errs.offers = "Adicione pelo menos 1 área de atuação que você oferece.";
    }
    if (draft.needs.length < 1) {
      errs.needs = "Adicione pelo menos 1 interesse que você procura.";
    } else {
      const priorityCount = draft.needs.filter((n) => n.isPriority).length;
      if (priorityCount === 0) {
        // Auto-fix by setting first as priority
        const fixed = draft.needs.map((n, idx) => ({ ...n, isPriority: idx === 0 }));
        update("needs", fixed);
      }
    }

    setErrors(errs);
    if (Object.keys(errs).length === 0) {
      onSubmit();
    }
  }

  return (
    <div className="w-full rounded-2xl sm:rounded-3xl border border-blue-500/30 bg-[#0c1533]/95 p-5 sm:p-8 shadow-[0_0_40px_rgba(15,30,80,0.4)] backdrop-blur-xl transition-all">
      {/* Top progress indicator */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs sm:text-sm font-medium text-slate-400">
          <span>Etapa 2 de 2</span>
          <span>Suas conexões</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
          <div
            className="h-full w-full rounded-full bg-gradient-to-r from-cyan-400 to-[#00d2ff] shadow-[0_0_10px_rgba(0,210,255,0.5)] transition-all duration-500"
            role="progressbar"
            aria-valuenow={100}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </div>

      {/* Header with Icon and Title */}
      <div className="mb-8 flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-blue-500/40 bg-blue-600/20 text-cyan-400 shadow-inner">
          <Network className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-white">
            Suas conexões
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Escolha o que você oferece e o que procura.
          </p>
        </div>
      </div>

      <div className="space-y-8">
        {/* ============================================================== */}
        {/* SECTION 1: O QUE VOCÊ OFERECE                                 */}
        {/* ============================================================== */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-emerald-500/40 bg-emerald-500/15 text-emerald-400">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">O que você oferece</h2>
              <p className="text-xs text-slate-400">Adicione até 5 áreas de atuação.</p>
            </div>
          </div>

          {/* Search / Add Input */}
          <div className="relative mt-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Search className="h-4 w-4" />
                </div>
                <Input
                  value={offerInput}
                  onChange={(e) => {
                    setOfferInput(e.target.value);
                    setOfferDropdownOpen(true);
                  }}
                  onFocus={() => setOfferDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addOffer(offerInput);
                    }
                  }}
                  placeholder="Buscar e adicionar..."
                  disabled={draft.offers.length >= 5}
                  className="h-11 rounded-xl border-blue-900/60 bg-[#09122c] pl-10 text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 disabled:opacity-50"
                />
              </div>
              <Button
                type="button"
                onClick={() => addOffer(offerInput)}
                disabled={draft.offers.length >= 5 || !offerInput.trim()}
                className="h-11 w-11 shrink-0 rounded-xl bg-[#00c8ff] p-0 text-[#02182b] hover:bg-cyan-300 shadow-[0_0_15px_rgba(0,200,255,0.3)] transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center"
              >
                <Plus className="h-5 w-5 stroke-[2.5]" />
              </Button>
            </div>

            {/* Dropdown Suggestions */}
            {offerDropdownOpen && draft.offers.length < 5 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setOfferDropdownOpen(false)}
                />
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-blue-800/80 bg-[#0a1435] p-2 shadow-2xl backdrop-blur-lg">
                  {offerInput.trim().length >= 2 &&
                    !taxonomyOffers.some(
                      (t) => t.label.toLowerCase() === offerInput.trim().toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={() => addOffer(offerInput)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-cyan-300 hover:bg-blue-600/20"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar <strong>"{offerInput.trim()}"</strong>
                      </button>
                    )}

                  {taxonomyOffers.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addOffer(item.label, item.id, item.segment_id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-blue-600/30 hover:text-white"
                    >
                      <span>{item.label}</span>
                      <Plus className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  ))}
                  {taxonomyOffers.length === 0 && !offerInput.trim() && (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      Digite para buscar na taxonomia ou adicionar texto livre.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Quick Suggestions Pills (if any available and space left) */}
          {draft.offers.length < 5 && offerFeed.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Sugestões:
              </span>
              {offerFeed.slice(0, 4).map((s) => (
                <button
                  key={s.identity}
                  type="button"
                  onClick={() => addOffer(s.label, s.taxonomyItemId, s.segmentId)}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-700/40 bg-blue-950/40 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-all cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Selected Chips */}
          <div className="mt-3.5 flex flex-wrap gap-2">
            {draft.offers.map((offer) => (
              <div
                key={offer.localId}
                className="inline-flex items-center gap-2 rounded-full border border-blue-500/40 bg-[#0e1d4a] px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white shadow-sm transition-all"
              >
                <span>{offer.label}</span>
                <button
                  type="button"
                  onClick={() => removeOffer(offer.localId)}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  aria-label={`Remover ${offer.label}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
          {errors.offers && <p className="mt-1.5 text-xs text-rose-400">{errors.offers}</p>}
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: O QUE VOCÊ PROCURA                                 */}
        {/* ============================================================== */}
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-500/40 bg-cyan-500/15 text-cyan-400">
              <Target className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">O que você procura</h2>
              <p className="text-xs text-slate-400">Adicione até 5 interesses.</p>
            </div>
          </div>

          {/* Search / Add Input */}
          <div className="relative mt-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Search className="h-4 w-4" />
                </div>
                <Input
                  value={needInput}
                  onChange={(e) => {
                    setNeedInput(e.target.value);
                    setNeedDropdownOpen(true);
                  }}
                  onFocus={() => setNeedDropdownOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addNeed(needInput);
                    }
                  }}
                  placeholder="Buscar e adicionar..."
                  disabled={draft.needs.length >= 5}
                  className="h-11 rounded-xl border-blue-900/60 bg-[#09122c] pl-10 text-white placeholder:text-slate-500 hover:border-blue-700/70 focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/40 disabled:opacity-50"
                />
              </div>
              <Button
                type="button"
                onClick={() => addNeed(needInput)}
                disabled={draft.needs.length >= 5 || !needInput.trim()}
                className="h-11 w-11 shrink-0 rounded-xl bg-[#00c8ff] p-0 text-[#02182b] hover:bg-cyan-300 shadow-[0_0_15px_rgba(0,200,255,0.3)] transition-all disabled:opacity-40 cursor-pointer flex items-center justify-center"
              >
                <Plus className="h-5 w-5 stroke-[2.5]" />
              </Button>
            </div>

            {/* Dropdown Suggestions */}
            {needDropdownOpen && draft.needs.length < 5 && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setNeedDropdownOpen(false)}
                />
                <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-blue-800/80 bg-[#0a1435] p-2 shadow-2xl backdrop-blur-lg">
                  {needInput.trim().length >= 2 &&
                    !taxonomyNeeds.some(
                      (t) => t.label.toLowerCase() === needInput.trim().toLowerCase(),
                    ) && (
                      <button
                        type="button"
                        onClick={() => addNeed(needInput)}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-cyan-300 hover:bg-blue-600/20"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar <strong>"{needInput.trim()}"</strong>
                      </button>
                    )}

                  {taxonomyNeeds.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => addNeed(item.label, item.id, item.segment_id)}
                      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-blue-600/30 hover:text-white"
                    >
                      <span>{item.label}</span>
                      <Plus className="h-3.5 w-3.5 text-slate-500" />
                    </button>
                  ))}
                  {taxonomyNeeds.length === 0 && !needInput.trim() && (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      Digite para buscar na taxonomia ou adicionar texto livre.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Quick Suggestions Pills */}
          {draft.needs.length < 5 && needFeed.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Sugestões:
              </span>
              {needFeed.slice(0, 4).map((s) => (
                <button
                  key={s.identity}
                  type="button"
                  onClick={() => addNeed(s.label, s.taxonomyItemId, s.segmentId)}
                  className="inline-flex items-center gap-1 rounded-full border border-blue-700/40 bg-blue-950/40 px-2.5 py-1 text-xs text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-all cursor-pointer"
                >
                  <Plus className="h-3 w-3" />
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {/* Selected Chips */}
          <div className="mt-3.5 flex flex-wrap gap-2">
            {draft.needs.map((need) => {
              const isPri = need.isPriority;
              return (
                <div
                  key={need.localId}
                  className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs sm:text-sm font-medium transition-all ${
                    isPri
                      ? "border-2 border-lime-400/90 bg-[#0e273d] text-white shadow-[0_0_12px_rgba(163,230,53,0.25)]"
                      : "border border-blue-500/40 bg-[#0e1d4a] text-white"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePriority(need.localId)}
                    title={isPri ? "Necessidade prioritária" : "Clique para marcar como prioridade"}
                    className="cursor-pointer"
                  >
                    <Star
                      className={`h-3.5 w-3.5 ${
                        isPri
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-slate-500 hover:text-yellow-400"
                      }`}
                    />
                  </button>
                  <span>{need.label}</span>
                  <button
                    type="button"
                    onClick={() => removeNeed(need.localId)}
                    className="rounded-full p-0.5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                    aria-label={`Remover ${need.label}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
          {errors.needs && <p className="mt-1.5 text-xs text-rose-400">{errors.needs}</p>}
        </div>

        {/* ============================================================== */}
        {/* SECTION 3: REFINAR MATCHES (ACCORDION)                         */}
        {/* ============================================================== */}
        <div className="rounded-xl border border-blue-900/60 bg-[#09122c]/80 p-4 transition-all">
          <button
            type="button"
            onClick={() => setRefineOpen(!refineOpen)}
            className="flex w-full items-center justify-between text-left text-sm font-semibold text-white hover:text-cyan-300 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-slate-300" />
              <span>Quero refinar meus matches</span>
            </div>
            {refineOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {refineOpen && (
            <div className="mt-4 grid grid-cols-1 gap-3 pt-3 border-t border-blue-900/40 md:grid-cols-3 animate-in fade-in duration-200">
              {/* Porte desejado */}
              <div>
                <Label className="text-xs font-semibold text-slate-300">Porte desejado</Label>
                <div className="mt-1">
                  <Select
                    value={draft.targetBusinessSize || "any"}
                    onValueChange={(v) => update("targetBusinessSize", v as TargetBusinessSize)}
                  >
                    <SelectTrigger className="h-10 w-full rounded-lg border-blue-900/60 bg-[#080e24] text-xs text-white hover:border-blue-700/70 focus:border-cyan-400">
                      <div className="flex items-center gap-2 text-slate-200">
                        <BarChart2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <SelectValue placeholder="Qualquer" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="border-blue-800 bg-[#0b1432] text-white text-xs">
                      <SelectItem value="any">{ANY_LABEL}</SelectItem>
                      {BUSINESS_SIZE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Tipo desejado */}
              <div>
                <Label className="text-xs font-semibold text-slate-300">Tipo desejado</Label>
                <div className="mt-1">
                  <Select
                    value={draft.targetBusinessType || "any"}
                    onValueChange={(v) => update("targetBusinessType", v as TargetBusinessType)}
                  >
                    <SelectTrigger className="h-10 w-full rounded-lg border-blue-900/60 bg-[#080e24] text-xs text-white hover:border-blue-700/70 focus:border-cyan-400">
                      <div className="flex items-center gap-2 text-slate-200">
                        <Briefcase className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <SelectValue placeholder="Qualquer" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="border-blue-800 bg-[#0b1432] text-white text-xs">
                      <SelectItem value="any">{ANY_LABEL}</SelectItem>
                      {BUSINESS_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Segmento desejado */}
              <div>
                <Label className="text-xs font-semibold text-slate-300">Segmento desejado</Label>
                <div className="mt-1">
                  <Select
                    value={draft.targetSegmentId || "any"}
                    onValueChange={(v) => update("targetSegmentId", v as TargetSegmentId)}
                  >
                    <SelectTrigger className="h-10 w-full rounded-lg border-blue-900/60 bg-[#080e24] text-xs text-white hover:border-blue-700/70 focus:border-cyan-400">
                      <div className="flex items-center gap-2 text-slate-200">
                        <LayoutGrid className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <SelectValue placeholder="Qualquer" />
                      </div>
                    </SelectTrigger>
                    <SelectContent className="border-blue-800 bg-[#0b1432] text-white text-xs">
                      <SelectItem value="any">{ANY_LABEL}</SelectItem>
                      {selectableSegments.map((seg) => (
                        <SelectItem key={seg.id} value={seg.id}>
                          {seg.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Footer of Card 2 */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-blue-500/20 pt-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          className="h-11 rounded-xl border-slate-700 bg-transparent px-5 text-sm font-medium text-slate-300 hover:bg-white/5 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <Button
          type="button"
          onClick={handleFormSubmit}
          disabled={isSubmitting}
          className="h-11 rounded-xl bg-[#a3e635] px-6 text-sm font-bold text-slate-950 hover:bg-[#8fe020] shadow-[0_0_20px_rgba(163,230,53,0.35)] transition-all cursor-pointer flex items-center justify-center gap-2.5"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-slate-950" />
              Processando…
            </>
          ) : (
            <>
              <Users className="h-5 w-5 text-slate-950" />
              Encontrar minhas conexões
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
