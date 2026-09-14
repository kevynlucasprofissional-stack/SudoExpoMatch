import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- a lib não publica tipos próprios; o wrapper abaixo é tipado.
import ForceGraph2D from "react-force-graph-2d";

import type { GraphEdge, GraphNode } from "@/features/admin/graphSchemas";
import {
  HOVER_DIM_FACTOR,
  edgeStroke,
  isIncidentEdge,
  neighborsOf,
  segmentColor,
} from "@/features/admin/graphPresentation";
import {
  DEFAULT_GRAPH_SETTINGS,
  arrowMode,
  forcesFromSettings,
  scaledLinkWidth,
  scaledNodeRadius,
  shouldRenderLabel,
  type GraphSettings,
} from "@/features/admin/graphSettings";

/**
 * Componente de canvas do Mapa de conexões (estilo Obsidian).
 * Carregado somente no cliente: a lib usa canvas e mede o DOM.
 * Toda a regra de cor/tamanho vem de `graphPresentation.ts` e as preferências
 * visuais de `graphSettings.ts` — nada aqui altera a semântica das cores.
 */

interface FGNode extends GraphNode {
  id: string;
  x?: number;
  y?: number;
}
interface FGLink {
  source: string | FGNode;
  target: string | FGNode;
  edge: GraphEdge;
}

const coord = (end: string | FGNode | undefined): { x: number; y: number } | null => {
  if (!end || typeof end === "string") return null;
  if (typeof end.x !== "number" || typeof end.y !== "number") return null;
  return { x: end.x, y: end.y };
};

/** Ponta de seta desenhada manualmente (permite duas pontas no mútuo). */
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  radius: number,
  size: number,
  color: string,
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < radius + size) return;
  const ux = dx / len;
  const uy = dy / len;
  const tipX = to.x - ux * (radius + 0.6);
  const tipY = to.y - uy * (radius + 0.6);
  const angle = Math.atan2(uy, ux);
  const spread = 0.42;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(tipX - size * Math.cos(angle - spread), tipY - size * Math.sin(angle - spread));
  ctx.lineTo(tipX - size * Math.cos(angle + spread), tipY - size * Math.sin(angle + spread));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

export function MatchGraphCanvas({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
  settings = DEFAULT_GRAPH_SETTINGS,
  reheatToken = 0,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (profileId: string) => void;
  onEdgeClick: (matchId: string) => void;
  settings?: GraphSettings;
  reheatToken?: number;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState({ width: 800, height: 560 });
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setSize({
        width: Math.max(el.clientWidth, 320),
        height: Math.max(el.clientHeight, 360),
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const data = useMemo(() => {
    const present = new Set(nodes.map((n) => n.profile_id));
    return {
      nodes: nodes.map((n) => ({ ...n, id: n.profile_id })) as FGNode[],
      links: edges
        .filter((e) => present.has(e.a_profile_id) && present.has(e.b_profile_id))
        .map((e) => ({ source: e.a_profile_id, target: e.b_profile_id, edge: e })) as FGLink[],
    };
  }, [nodes, edges]);

  const forces = useMemo(() => forcesFromSettings(settings), [settings]);

  /** Aplica as forças do d3 sem recriar o payload de dados. */
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg || typeof fg.d3Force !== "function") return;
    const charge = fg.d3Force("charge");
    if (charge?.strength) charge.strength(forces.charge);
    const link = fg.d3Force("link");
    if (link?.strength) link.strength(forces.linkStrength);
    if (link?.distance) link.distance(forces.linkDistance);
    const center = fg.d3Force("center");
    if (center?.strength) center.strength(forces.center);
    if (typeof fg.d3ReheatSimulation === "function") fg.d3ReheatSimulation();
  }, [forces]);

  /** Botão "Animar": reaquece a simulação sem recarregar dados. */
  useEffect(() => {
    const fg = fgRef.current;
    if (reheatToken > 0 && fg && typeof fg.d3ReheatSimulation === "function") {
      fg.d3ReheatSimulation();
    }
  }, [reheatToken]);

  const highlight = useMemo(
    () => (hovered ? neighborsOf(edges, hovered) : null),
    [hovered, edges],
  );

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const dimmed = highlight != null && !highlight.has(node.profile_id);
      const r = scaledNodeRadius(node, settings.nodeSize);
      ctx.globalAlpha = dimmed ? 0.15 : 1;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = segmentColor(node.segment_id);
      ctx.fill();
      if (shouldRenderLabel(scale, settings.textThreshold, node.profile_id === hovered)) {
        ctx.font = `${Math.max(10 / scale, 2.5)}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(226,232,240,0.92)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.name, node.x ?? 0, (node.y ?? 0) + r + 1.5);
      }
      ctx.globalAlpha = 1;
    },
    [highlight, hovered, settings.nodeSize, settings.textThreshold],
  );

  /** Setas: direção do interesse humano, nunca arbitrária. */
  const paintLinkArrows = useCallback(
    (link: FGLink, ctx: CanvasRenderingContext2D) => {
      const mode = arrowMode(link.edge, settings.showArrows);
      if (mode === "none") return;
      const a = coord(link.source);
      const b = coord(link.target);
      if (!a || !b) return;
      const color = edgeStroke(link.edge, hovered);
      const size = 3 + settings.linkThickness;
      const rA = scaledNodeRadius({ degree: 0 }, settings.nodeSize) + 1;
      const rB = rA;
      if (mode === "forward" || mode === "both") drawArrowHead(ctx, a, b, rB, size, color);
      if (mode === "backward" || mode === "both") drawArrowHead(ctx, b, a, rA, size, color);
    },
    [settings.showArrows, settings.linkThickness, settings.nodeSize, hovered],
  );

  return (
    <div ref={wrapRef} className="h-[62vh] min-h-[380px] w-full overflow-hidden rounded-xl bg-[#02072A]">
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={data}
        backgroundColor="#02072A"
        cooldownTicks={80}
        d3VelocityDecay={0.35}
        nodeRelSize={4}
        nodeLabel={(n: FGNode) => `${n.name}${n.company ? ` — ${n.company}` : ""} · ${n.degree} matches`}
        nodeCanvasObject={paintNode}
        nodePointerAreaPaint={(n: FGNode, color: string, ctx: CanvasRenderingContext2D) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(n.x ?? 0, n.y ?? 0, scaledNodeRadius(n, settings.nodeSize) + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={(l: FGLink) => edgeStroke(l.edge, hovered)}
        linkWidth={(l: FGLink) => {
          const factor = !hovered
            ? 1
            : isIncidentEdge(l.edge, hovered)
              ? 1.6
              : HOVER_DIM_FACTOR * 3.3;
          return scaledLinkWidth(l.edge, settings.linkThickness, factor);
        }}
        linkCanvasObjectMode={() => "after"}
        linkCanvasObject={paintLinkArrows}
        linkDirectionalParticles={0}
        onNodeHover={(n: FGNode | null) => setHovered(n ? n.profile_id : null)}
        onNodeClick={(n: FGNode) => onNodeClick(n.profile_id)}
        onLinkClick={(l: FGLink) => onEdgeClick(l.edge.match_id)}
      />
    </div>
  );
}

export default MatchGraphCanvas;
