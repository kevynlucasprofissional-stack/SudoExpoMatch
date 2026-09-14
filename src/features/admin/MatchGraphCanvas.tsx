import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore -- a lib não publica tipos próprios; o wrapper abaixo é tipado.
import ForceGraph2D from "react-force-graph-2d";

import type { GraphEdge, GraphNode } from "@/features/admin/graphSchemas";
import {
  edgeColor,
  edgeWidth,
  neighborsOf,
  nodeRadius,
  segmentColor,
} from "@/features/admin/graphPresentation";

/**
 * Componente de canvas do Mapa de conexões (estilo Obsidian).
 * Carregado somente no cliente: a lib usa canvas e mede o DOM.
 * Toda a regra de cor/tamanho vem de `graphPresentation.ts`.
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

const idOf = (v: string | FGNode) => (typeof v === "string" ? v : v.profile_id);

export function MatchGraphCanvas({
  nodes,
  edges,
  onNodeClick,
  onEdgeClick,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick: (profileId: string) => void;
  onEdgeClick: (matchId: string) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
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

  const highlight = useMemo(
    () => (hovered ? neighborsOf(edges, hovered) : null),
    [hovered, edges],
  );

  const paintNode = useCallback(
    (node: FGNode, ctx: CanvasRenderingContext2D, scale: number) => {
      const dimmed = highlight != null && !highlight.has(node.profile_id);
      const r = nodeRadius(node);
      ctx.globalAlpha = dimmed ? 0.15 : 1;
      ctx.beginPath();
      ctx.arc(node.x ?? 0, node.y ?? 0, r, 0, 2 * Math.PI);
      ctx.fillStyle = segmentColor(node.segment_id);
      ctx.fill();
      if (scale > 1.6 || node.profile_id === hovered) {
        ctx.font = `${Math.max(10 / scale, 2.5)}px Inter, sans-serif`;
        ctx.fillStyle = "rgba(226,232,240,0.92)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(node.name, node.x ?? 0, (node.y ?? 0) + r + 1.5);
      }
      ctx.globalAlpha = 1;
    },
    [highlight, hovered],
  );

  return (
    <div ref={wrapRef} className="h-[62vh] min-h-[380px] w-full overflow-hidden rounded-xl bg-[#02072A]">
      <ForceGraph2D
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
          ctx.arc(n.x ?? 0, n.y ?? 0, nodeRadius(n) + 2, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkColor={(l: FGLink) => edgeColor(l.edge)}
        linkWidth={(l: FGLink) => {
          if (!highlight) return edgeWidth(l.edge);
          const on = highlight.has(idOf(l.source)) && highlight.has(idOf(l.target));
          return on ? edgeWidth(l.edge) * 1.6 : edgeWidth(l.edge) * 0.4;
        }}
        linkDirectionalParticles={0}
        onNodeHover={(n: FGNode | null) => setHovered(n ? n.profile_id : null)}
        onNodeClick={(n: FGNode) => onNodeClick(n.profile_id)}
        onLinkClick={(l: FGLink) => onEdgeClick(l.edge.match_id)}
      />
    </div>
  );
}

export default MatchGraphCanvas;
