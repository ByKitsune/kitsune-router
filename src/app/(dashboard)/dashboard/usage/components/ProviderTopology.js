"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import PropTypes from "prop-types";
import Image from "next/image";
import {
  ReactFlow,
  Handle,
  Position,
  Controls,
  BaseEdge,
  getBezierPath,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./topology.css";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { getProviderIconSrc, markProviderIconMissing } from "@/shared/utils/providerIcon";

// Force-stop FE animation if a provider stays active longer than this
const FE_ACTIVE_TIMEOUT_MS = 60000;
const FE_ACTIVE_TICK_MS = 1000;

function getProviderConfig(providerId) {
  return AI_PROVIDERS[providerId] || { color: "#6b7280", name: providerId };
}

function getProviderImageUrl(providerId) {
  return getProviderIconSrc(providerId);
}

// Custom provider node - rectangle with image + name
function ProviderNode({ data }) {
  const { label, color, imageUrl, textIcon, active, error, last, phase, compact } = data;
  const [imgError, setImgError] = useState(false);
  return (
    <div
      className="topology-provider flex items-center gap-2.5 rounded-2xl border bg-surface px-3.5 py-2.5"
      data-state={active ? "active" : error ? "error" : last ? "recent" : "connected"}
      style={{
        "--provider-accent": color,
        "--topology-phase": `${phase}s`,
        width: compact ? "156px" : "190px",
      }}
    >
      <Handle type="target" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="target" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      {/* Provider icon */}
      <div
        className="topology-provider-icon flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}15` }}
      >
        {imageUrl && !imgError ? (
          <Image
            src={imageUrl}
            alt={label}
            width={24}
            height={24}
            className="rounded-sm object-contain"
            loading="lazy"
            onError={() => {
              const m = imageUrl?.match(/^\/providers\/([^/]+)\.png$/i);
              if (m) markProviderIconMissing(m[1]);
              setImgError(true);
            }}
          />
        ) : (
          <span className="text-sm font-bold" style={{ color }}>{textIcon}</span>
        )}
      </div>

      {/* Provider name */}
      <span
        className="truncate text-sm font-medium text-text-main"
      >
        {label}
      </span>

      <span aria-hidden="true" className="topology-provider-status ml-auto size-1.5 shrink-0 rounded-full" />
    </div>
  );
}

ProviderNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// Ambient connection motion stays distinct from actual request activity.
function RouterNode({ data }) {
  const powering = (data.activeCount || 0) > 0;
  return (
    <div
      className="topology-hub relative z-[1] flex items-center justify-center rounded-2xl border px-4 py-3.5"
      data-state={powering ? "active" : "connected"}
      style={{ width: data.compact ? "196px" : "210px" }}
    >
      <span aria-hidden="true" className="topology-hub-orbit topology-hub-orbit-outer" />
      <span aria-hidden="true" className="topology-hub-orbit topology-hub-orbit-inner" />
      <Handle type="source" position={Position.Top} id="top" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Bottom} id="bottom" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Left} id="left" className="!bg-transparent !border-0 !w-0 !h-0" />
      <Handle type="source" position={Position.Right} id="right" className="!bg-transparent !border-0 !w-0 !h-0" />

      <Image
        src="/icons/logo.svg"
        alt="Kitsune Router"
        width={24}
        height={24}
        className="topology-hub-logo mr-2.5 object-contain"
        loading="lazy"
      />
      <span className="text-xs font-bold text-text-main sm:text-sm">
        Kitsune Router
      </span>
      {data.activeCount > 0 && (
        <span className="topology-hub-count ml-2 rounded-full px-1.5 py-0.5 text-xs font-bold text-primary">
          {data.activeCount}
        </span>
      )}
    </div>
  );
}

RouterNode.propTypes = {
  data: PropTypes.object.isRequired,
};

// One CSS-driven flow layer per edge; React never updates on animation frames.
function TopologyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data,
}) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const state = data?.active ? "active" : data?.error ? "error" : data?.last ? "recent" : "connected";
  return (
    <g
      className="topology-connection"
      data-state={state}
      style={{ "--topology-phase": `${data?.phase || 0}s` }}
    >
      <BaseEdge id={id} path={edgePath} style={style} className="topology-connection-base" />
      <path d={edgePath} className="topology-connection-glow" fill="none" aria-hidden="true" />
      <path d={edgePath} pathLength="1" className="topology-connection-flow" fill="none" aria-hidden="true" />
    </g>
  );
}

TopologyEdge.propTypes = {
  id: PropTypes.string,
  sourceX: PropTypes.number,
  sourceY: PropTypes.number,
  targetX: PropTypes.number,
  targetY: PropTypes.number,
  sourcePosition: PropTypes.string,
  targetPosition: PropTypes.string,
  style: PropTypes.object,
  data: PropTypes.object,
};

const nodeTypes = { provider: ProviderNode, router: RouterNode };
const edgeTypes = { topology: TopologyEdge };

// Place N nodes evenly along an ellipse around the router center.
function buildLayout(providers, activeSet, lastSet, errorSet, compact) {
  const nodeW = compact ? 156 : 190;
  const nodeH = 54;
  const routerW = compact ? 196 : 210;
  const routerH = 62;
  const nodeGap = 14;

  const count = providers.length;

  // Compute rx so arc spacing between nodes >= nodeW + nodeGap
  const minRx = ((nodeW + nodeGap) * count) / (2 * Math.PI);
  const rx = Math.max(300, minRx);
  const ry = Math.max(170, rx * 0.42);
  if (count === 0) {
    return {
      nodes: [{ id: "router", type: "router", position: { x: 0, y: 0 }, data: { activeCount: 0 }, draggable: false }],
      edges: [],
    };
  }

  const nodes = [];
  const edges = [];

  nodes.push({
    id: "router",
    type: "router",
    position: { x: -routerW / 2, y: compact ? 0 : -routerH / 2 },
    data: { activeCount: activeSet.size, compact },
    draggable: false,
  });

  const edgeStyle = (active, last, error) => {
    if (error) return { stroke: "var(--color-danger)", strokeWidth: 2, opacity: 0.9 };
    if (active) return { stroke: "var(--color-primary)", strokeWidth: 2.5, opacity: 1 };
    if (last) return { stroke: "var(--color-warning)", strokeWidth: 1.6, opacity: 0.75 };
    return { stroke: "var(--topology-line)", strokeWidth: 1.15, opacity: 0.65 };
  };

  providers.forEach((p, i) => {
    const config = getProviderConfig(p.provider);
    const active = activeSet.has(p.provider?.toLowerCase());
    const last = !active && lastSet.has(p.provider?.toLowerCase());
    const error = !active && errorSet.has(p.provider?.toLowerCase());
    const nodeId = `provider-${p.provider}`;
    const data = {
      label: (config.name !== p.provider ? config.name : null) || p.nodeName || p.name || p.provider,
      color: config.color || "#6b7280",
      imageUrl: getProviderImageUrl(p.provider),
      textIcon: config.textIcon || (p.provider || "?").slice(0, 2).toUpperCase(),
      active,
      last,
      error,
      phase: -i * 0.61,
      compact,
    };

    // Distribute evenly starting from top (−π/2), clockwise
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / count;
    // On phones, a two-column fan keeps provider names readable instead of
    // shrinking an entire wide ellipse into a few hundred pixels.
    const cx = compact ? (i % 2 === 0 ? -1 : 1) * (nodeW / 2 + 10) : rx * Math.cos(angle);
    const cy = compact ? 130 + Math.floor(i / 2) * 66 : ry * Math.sin(angle);

    // Pick router handle closest to the node direction
    let sourceHandle, targetHandle;
    if (compact) {
      sourceHandle = "bottom"; targetHandle = "top";
    } else if (Math.abs(angle + Math.PI / 2) < Math.PI / 4 || Math.abs(angle - 3 * Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "top"; targetHandle = "bottom";
    } else if (Math.abs(angle - Math.PI / 2) < Math.PI / 4) {
      sourceHandle = "bottom"; targetHandle = "top";
    } else if (cx > 0) {
      sourceHandle = "right"; targetHandle = "left";
    } else {
      sourceHandle = "left"; targetHandle = "right";
    }

    nodes.push({
      id: nodeId,
      type: "provider",
      position: { x: cx - nodeW / 2, y: cy - nodeH / 2 },
      data,
      draggable: false,
    });

    edges.push({
      id: `e-${nodeId}`,
      type: "topology",
      source: "router",
      sourceHandle,
      target: nodeId,
      targetHandle,
      animated: false,
      data: { active, last, error, phase: -i * 0.61 },
      style: edgeStyle(active, last, error),
    });
  });

  return { nodes, edges };
}

export default function ProviderTopology({ providers = [], activeRequests = [], lastProvider = "", errorProvider = "" }) {
  const [compact, setCompact] = useState(false);
  // Serialize to stable string keys so useMemo only re-runs when values actually change
  const activeKey = useMemo(
    () => activeRequests.map((r) => r.provider?.toLowerCase()).filter(Boolean).sort().join(","),
    [activeRequests]
  );
  const lastKey = lastProvider?.toLowerCase() || "";
  const errorKey = errorProvider?.toLowerCase() || "";

  const rawActiveSet = useMemo(() => new Set(activeKey ? activeKey.split(",") : []), [activeKey]);
  const lastSet = useMemo(() => new Set(lastKey ? [lastKey] : []), [lastKey]);
  const errorSet = useMemo(() => new Set(errorKey ? [errorKey] : []), [errorKey]);

  // Track firstSeen per active provider; drop provider if running too long (BE stuck)
  const firstSeenRef = useRef({});
  // Clock as state (never Date.now() during render) so expiry re-evaluates cleanly.
  const [now, setNow] = useState(0);

  useEffect(() => {
    const seen = firstSeenRef.current;
    const at = Date.now();
    for (const p of rawActiveSet) {
      if (!seen[p]) seen[p] = at;
    }
    for (const p of Object.keys(seen)) {
      if (!rawActiveSet.has(p)) delete seen[p];
    }
  }, [rawActiveSet]);

  useEffect(() => {
    if (rawActiveSet.size === 0) return;
    const id = setInterval(() => setNow(Date.now()), FE_ACTIVE_TICK_MS);
    return () => clearInterval(id);
  }, [rawActiveSet]);

  const [activeSet, setActiveSet] = useState(() => new Set(rawActiveSet));
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const seen = firstSeenRef.current;
      const filtered = new Set();
      for (const p of rawActiveSet) {
        const ts = seen[p];
        if (!ts || now - ts < FE_ACTIVE_TIMEOUT_MS) filtered.add(p);
      }
      if (!cancelled) setActiveSet(previous => previous.size === filtered.size && [...filtered].every(p => previous.has(p)) ? previous : filtered);
    })();
    return () => { cancelled = true; };
  }, [rawActiveSet, now]);

  const { nodes, edges } = useMemo(
    () => buildLayout(providers, activeSet, lastSet, errorSet, compact),
    [providers, activeSet, lastSet, errorSet, compact]
  );

  // Stable key — only remount when provider list changes
  const providersKey = useMemo(
    () => providers.map((p) => p.provider).sort().join(","),
    [providers]
  );

  const [reduceMotion, setReduceMotion] = useState(false);
  const rfInstance = useRef(null);
  const containerRef = useRef(null);
  const initFitTimer = useRef(null);
  const [inView, setInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(true);
  const motionRunning = !reduceMotion && inView && pageVisible;
  const fitOpts = useMemo(() => ({ padding: 0.12, duration: reduceMotion ? 0 : 450, maxZoom: 1.15 }), [reduceMotion]);
  const onInit = useCallback((instance) => {
    rfInstance.current = instance;
    clearTimeout(initFitTimer.current);
    initFitTimer.current = setTimeout(() => instance.fitView(fitOpts), 50);
  }, [fitOpts]);

  useEffect(() => () => clearTimeout(initFitTimer.current), []);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setReduceMotion(preference.matches);
    updatePreference();
    preference.addEventListener("change", updatePreference);
    return () => preference.removeEventListener("change", updatePreference);
  }, []);

  // Pause decorative work outside the viewport and in hidden tabs. A single
  // observer/listener controls CSS play state without a per-frame JS loop.
  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting));
    if (containerRef.current) observer.observe(containerRef.current);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      observer.disconnect();
    };
  }, []);

  // Re-fit on container resize
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setCompact(el.clientWidth < 560);
      if (rfInstance.current) rfInstance.current.fitView(fitOpts);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fitOpts]);

  // Re-fit when node count/layout changes
  useEffect(() => {
    if (rfInstance.current) {
      const id = setTimeout(() => rfInstance.current.fitView(fitOpts), 50);
      return () => clearTimeout(id);
    }
  }, [nodes.length, compact, fitOpts]);

  return (
    <div
      ref={containerRef}
      className="usage-topology relative h-[340px] w-full min-w-0 overflow-hidden rounded-[18px] sm:h-[420px] lg:h-[460px]"
      data-motion={motionRunning ? "running" : "paused"}
      data-layout={compact ? "fan" : "radial"}
      style={compact ? { height: Math.max(360, Math.ceil(providers.length / 2) * 66 + 142) } : undefined}
      aria-label="Routing map"
      role="region"
    >
      {providers.length === 0 ? (
        <div className="h-full flex items-center justify-center text-text-muted text-sm">
          No providers connected
        </div>
      ) : (
        <>
        <div className="topology-legend pointer-events-none absolute right-3 top-3 z-10 flex items-center gap-3 rounded-full border border-border-subtle px-3 py-1.5 text-[10px] font-medium text-text-muted">
          <span className="flex items-center gap-1.5"><span className="topology-legend-connected size-1.5 rounded-full" aria-hidden="true" />Connected</span>
          {activeSet.size > 0 && <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" aria-hidden="true" />Active</span>}
        </div>
        <ReactFlow
          key={providersKey}
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={fitOpts}
          minZoom={0.1}
          maxZoom={2}
          onInit={onInit}
          proOptions={{ hideAttribution: true }}
          panOnDrag
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick
          preventScrolling={false}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
        >
          <Controls showInteractive={false} className="react-flow-controls-custom" />
        </ReactFlow>
        </>
      )}
    </div>
  );
}

ProviderTopology.propTypes = {
  providers: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string,
    provider: PropTypes.string,
    name: PropTypes.string,
  })),
  activeRequests: PropTypes.arrayOf(PropTypes.shape({
    provider: PropTypes.string,
    model: PropTypes.string,
    account: PropTypes.string,
  })),
  lastProvider: PropTypes.string,
  errorProvider: PropTypes.string,
};
