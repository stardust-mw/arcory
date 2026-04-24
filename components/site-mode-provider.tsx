"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Body, Engine } from "matter-js";

type SiteMode = "day" | "night" | "summer" | "midnight" | "rain";

type SiteModeContextValue = {
  mode: SiteMode;
  setMode: (mode: SiteMode) => void;
  toggleDayNight: () => void;
  toggleChaos: () => void;
};

type ChaosItem = {
  body: Body;
  node: HTMLDivElement;
  width: number;
  height: number;
  originX: number;
  originY: number;
};

type ChaosState = {
  overlay: HTMLDivElement;
  engine: Engine;
  items: ChaosItem[];
  rafId: number;
  rootVisibility: string;
  bodyOverflow: string;
  cleanup: () => void;
};

type MatterModule = typeof import("matter-js");

const STORAGE_KEY = "arcory-site-mode";
const MODE_CLASSES = [
  "dark",
  "arcory-mode-day",
  "arcory-mode-night",
  "arcory-mode-summer",
  "arcory-mode-midnight",
  "arcory-mode-rain",
];

const SiteModeContext = createContext<SiteModeContextValue | null>(null);

function isSiteMode(value: string | null): value is SiteMode {
  return value === "day" || value === "night" || value === "summer" || value === "midnight" || value === "rain";
}

function getInitialMode(): SiteMode {
  if (typeof window === "undefined") return "day";

  const savedMode = window.localStorage.getItem(STORAGE_KEY);
  if (isSiteMode(savedMode)) return savedMode;

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day";
}

function applyMode(mode: SiteMode) {
  const root = document.documentElement;
  root.classList.remove(...MODE_CLASSES);
  root.classList.add(`arcory-mode-${mode}`);
  root.classList.toggle("dark", mode === "night" || mode === "midnight");
  root.dataset.siteMode = mode;
}

function shouldIgnoreShortcut(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return true;
  const target = event.target as HTMLElement | null;
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

function isVisibleElement(element: Element) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
}

function isFullyVisible(rect: DOMRect) {
  return rect.width > 1 && rect.height > 1 && rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth;
}

function copyTextStyles(source: HTMLElement, target: HTMLElement) {
  const style = window.getComputedStyle(source);
  target.style.fontFamily = style.fontFamily;
  target.style.fontSize = style.fontSize;
  target.style.fontWeight = style.fontWeight;
  target.style.letterSpacing = style.letterSpacing;
  target.style.lineHeight = style.lineHeight;
  target.style.color = style.color;
  target.style.textTransform = style.textTransform;
  target.style.textDecoration = style.textDecoration;
  target.style.whiteSpace = "nowrap";
}

function createOverlayItem(candidate: {
  rect: DOMRect;
  content: Node | string;
  kind: "block" | "word";
}) {
  const width = Math.max(2, candidate.rect.width);
  const height = Math.max(2, candidate.rect.height);
  const originX = candidate.rect.left + width / 2;
  const originY = candidate.rect.top + height / 2;
  const node = document.createElement("div");

  node.className = "arcory-chaos-piece";
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.transform = `translate(${originX - width / 2}px, ${originY - height / 2}px)`;

  if (typeof candidate.content === "string") {
    node.textContent = candidate.content;
    node.classList.add("arcory-chaos-word");
  } else {
    const clone = candidate.content.cloneNode(true) as HTMLElement;
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.margin = "0";
    clone.style.pointerEvents = "none";
    clone.style.overflow = "hidden";
    node.appendChild(clone);
  }

  return { node, width, height, originX, originY };
}

function collectChaosCandidates(root: HTMLElement) {
  const candidates: Array<{ rect: DOMRect; content: Node | string; kind: "block" | "word"; styleSource?: HTMLElement }> = [];
  const blockElements = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, input, img, video, svg, canvas, [role='button'], .arcory-chaos-block",
    ),
  );
  const blockedTextRoots = new WeakSet<Node>();

  for (const element of blockElements) {
    if (!isVisibleElement(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!isFullyVisible(rect)) continue;
    if (rect.width >= window.innerWidth * 0.92 || rect.height >= window.innerHeight * 0.92) continue;
    candidates.push({ rect, content: element, kind: "block" });
    element.querySelectorAll("*").forEach((child) => blockedTextRoots.add(child));
    blockedTextRoots.add(element);
  }

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent?.trim()) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent || blockedTextRoots.has(parent) || !isVisibleElement(parent)) return NodeFilter.FILTER_REJECT;
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const text = textNode.textContent ?? "";
    const parent = textNode.parentElement;
    if (!parent) continue;

    for (const match of text.matchAll(/\S+/g)) {
      const word = match[0];
      const start = match.index ?? 0;
      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + word.length);
      const rect = range.getBoundingClientRect();
      range.detach();
      if (!isFullyVisible(rect)) continue;
      candidates.push({ rect, content: word, kind: "word", styleSource: parent });
    }
  }

  candidates.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  return candidates.slice(0, 900);
}

async function createChaos(root: HTMLElement, matter: MatterModule): Promise<ChaosState | null> {
  const candidates = collectChaosCandidates(root);
  if (candidates.length === 0) return null;

  const { Engine, Bodies, Body: MatterBody, World, Sleeping } = matter;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const wallWidth = 120;
  const engine = Engine.create({ gravity: { y: 3.5 }, enableSleeping: true });
  const world = engine.world;
  const overlay = document.createElement("div");
  const items: ChaosItem[] = [];
  let dragBody: Body | null = null;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  let dragLastX = 0;
  let dragLastY = 0;
  let dragVelocityX = 0;
  let dragVelocityY = 0;

  overlay.className = "arcory-chaos-overlay";
  document.body.appendChild(overlay);

  World.add(world, [
    Bodies.rectangle(viewportWidth / 2, viewportHeight + wallWidth / 2, viewportWidth + 400, wallWidth, {
      isStatic: true,
      friction: 0.9,
      restitution: 0.04,
    }),
    Bodies.rectangle(-wallWidth / 2, viewportHeight / 2, wallWidth, viewportHeight * 4, { isStatic: true }),
    Bodies.rectangle(viewportWidth + wallWidth / 2, viewportHeight / 2, wallWidth, viewportHeight * 4, {
      isStatic: true,
    }),
  ]);

  for (const candidate of candidates) {
    const overlayItem = createOverlayItem(candidate);
    if (candidate.kind === "word" && candidate.styleSource) {
      copyTextStyles(candidate.styleSource, overlayItem.node);
    }

    overlay.appendChild(overlayItem.node);
    const body = Bodies.rectangle(overlayItem.originX, overlayItem.originY, overlayItem.width, overlayItem.height, {
      friction: candidate.kind === "word" ? 0.42 : 0.72,
      frictionAir: candidate.kind === "word" ? 0.0032 : 0.0046,
      restitution: candidate.kind === "word" ? 0.16 : 0.08,
    });
    World.add(world, body);
    MatterBody.setAngle(body, (Math.random() - 0.5) * 0.08);
    MatterBody.setVelocity(body, {
      x: (Math.random() - 0.5) * (candidate.kind === "word" ? 0.8 : 0.45),
      y: Math.random() * (candidate.kind === "word" ? 0.35 : 0.18),
    });

    overlayItem.node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 && event.pointerType === "mouse") return;
      overlayItem.node.setPointerCapture(event.pointerId);
      Sleeping.set(body, false);
      dragBody = body;
      dragOffsetX = body.position.x - event.clientX;
      dragOffsetY = body.position.y - event.clientY;
      dragLastX = event.clientX;
      dragLastY = event.clientY;
      dragVelocityX = 0;
      dragVelocityY = 0;
      overlayItem.node.classList.add("is-grabbing");
      event.preventDefault();
    });

    overlayItem.node.addEventListener("pointerup", (event) => {
      overlayItem.node.classList.remove("is-grabbing");
      overlayItem.node.releasePointerCapture(event.pointerId);
      if (!dragBody) return;
      MatterBody.setVelocity(dragBody, { x: dragVelocityX * 4, y: dragVelocityY * 4 });
      dragBody = null;
    });

    items.push({ body, ...overlayItem });
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragBody) return;
    dragVelocityX = event.clientX - dragLastX;
    dragVelocityY = event.clientY - dragLastY;
    dragLastX = event.clientX;
    dragLastY = event.clientY;
    MatterBody.setPosition(dragBody, { x: event.clientX + dragOffsetX, y: event.clientY + dragOffsetY });
    MatterBody.setVelocity(dragBody, { x: dragVelocityX * 2, y: dragVelocityY * 2 });
  }

  function onPointerUp() {
    dragBody = null;
    overlay.querySelectorAll(".is-grabbing").forEach((node) => node.classList.remove("is-grabbing"));
  }

  document.addEventListener("pointermove", onPointerMove);
  document.addEventListener("pointerup", onPointerUp);

  const rootVisibility = root.style.visibility;
  const bodyOverflow = document.body.style.overflow;
  root.style.visibility = "hidden";
  document.body.style.overflow = "hidden";

  let rafId = 0;
  function tick() {
    Engine.update(engine, 1000 / 60);
    for (const item of items) {
      const { x, y } = item.body.position;
      item.node.style.transform = `translate(${x - item.width / 2}px, ${y - item.height / 2}px) rotate(${item.body.angle}rad)`;
    }
    rafId = window.requestAnimationFrame(tick);
  }
  rafId = window.requestAnimationFrame(tick);

  return {
    overlay,
    engine,
    items,
    rafId,
    rootVisibility,
    bodyOverflow,
    cleanup: () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    },
  };
}

function reverseChaos(root: HTMLElement, state: ChaosState, onDone: () => void) {
  window.cancelAnimationFrame(state.rafId);
  state.cleanup();

  const snapshots = state.items.map((item) => ({
    ...item,
    fromX: item.body.position.x,
    fromY: item.body.position.y,
    fromAngle: item.body.angle,
  }));
  const startedAt = window.performance.now();
  const duration = 720;
  const ease = (value: number) => (value < 0.5 ? 2 * value * value : -1 + (4 - 2 * value) * value);

  function animate(now: number) {
    const progress = Math.min((now - startedAt) / duration, 1);
    const eased = ease(progress);

    for (const item of snapshots) {
      const x = item.fromX + (item.originX - item.fromX) * eased;
      const y = item.fromY + (item.originY - item.fromY) * eased;
      const angle = item.fromAngle * (1 - eased);
      item.node.style.transform = `translate(${x - item.width / 2}px, ${y - item.height / 2}px) rotate(${angle}rad)`;
    }

    if (progress < 1) {
      state.rafId = window.requestAnimationFrame(animate);
      return;
    }

    root.style.visibility = state.rootVisibility;
    document.body.style.overflow = state.bodyOverflow;
    state.overlay.remove();
    matterCleanup(state.engine);
    onDone();
  }

  state.rafId = window.requestAnimationFrame(animate);
}

function matterCleanup(engine: Engine) {
  engine.world.bodies.length = 0;
  engine.world.constraints.length = 0;
  engine.world.composites.length = 0;
}

export function useSiteMode() {
  const context = useContext(SiteModeContext);
  if (!context) {
    throw new Error("useSiteMode must be used within SiteModeProvider");
  }
  return context;
}

export function SiteModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<SiteMode>("day");
  const [isModeReady, setIsModeReady] = useState(false);
  const [isSummerVideoReady, setIsSummerVideoReady] = useState(false);
  const [isRainVideoReady, setIsRainVideoReady] = useState(false);
  const [isMidnightVideoReady, setIsMidnightVideoReady] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chaosStateRef = useRef<ChaosState | null>(null);
  const chaosLockedRef = useRef(false);
  const summerVideoRef = useRef<HTMLVideoElement | null>(null);
  const rainVideoRef = useRef<HTMLVideoElement | null>(null);
  const midnightVideoRef = useRef<HTMLVideoElement | null>(null);

  const setMode = (nextMode: SiteMode) => {
    setModeState(nextMode);
  };

  const toggleDayNight = () => {
    setModeState((current) => (current === "night" || current === "midnight" ? "day" : "night"));
  };

  const toggleChaos = async () => {
    if (chaosLockedRef.current) return;
    const root = rootRef.current;
    if (!root) return;

    const activeChaos = chaosStateRef.current;
    if (activeChaos) {
      chaosLockedRef.current = true;
      reverseChaos(root, activeChaos, () => {
        chaosStateRef.current = null;
        chaosLockedRef.current = false;
      });
      return;
    }

    chaosLockedRef.current = true;
    const matter = await import("matter-js");
    const chaos = await createChaos(root, matter);
    chaosStateRef.current = chaos;
    chaosLockedRef.current = false;
  };

  useEffect(() => {
    const initialMode = getInitialMode();
    setModeState(initialMode);
    applyMode(initialMode);
    setIsModeReady(true);
  }, []);

  useEffect(() => {
    if (!isModeReady) return;
    applyMode(mode);
    window.localStorage.setItem(STORAGE_KEY, mode);
  }, [isModeReady, mode]);

  useEffect(() => {
    const video = summerVideoRef.current;
    if (!video) return;

    if (mode === "summer") {
      if (video.readyState >= 2) {
        setIsSummerVideoReady(true);
        void video.play().catch(() => {});
        return;
      }

      setIsSummerVideoReady(false);

      const handleLoadedData = () => {
        setIsSummerVideoReady(true);
        void video.play().catch(() => {});
      };

      video.addEventListener("loadeddata", handleLoadedData, { once: true });
      video.load();

      return () => {
        video.removeEventListener("loadeddata", handleLoadedData);
      };
    }
    setIsSummerVideoReady(false);

    video.pause();
    video.currentTime = 0;
  }, [mode]);

  useEffect(() => {
    const video = rainVideoRef.current;
    if (!video) return;

    if (mode === "rain") {
      if (video.readyState >= 2) {
        setIsRainVideoReady(true);
        void video.play().catch(() => {});
        return;
      }

      setIsRainVideoReady(false);

      const handleLoadedData = () => {
        setIsRainVideoReady(true);
        void video.play().catch(() => {});
      };

      video.addEventListener("loadeddata", handleLoadedData, { once: true });
      video.load();

      return () => {
        video.removeEventListener("loadeddata", handleLoadedData);
      };
    }

    setIsRainVideoReady(false);
    video.pause();
    video.currentTime = 0;
  }, [mode]);

  useEffect(() => {
    const video = midnightVideoRef.current;
    if (!video) return;

    if (mode === "midnight") {
      if (video.readyState >= 2) {
        setIsMidnightVideoReady(true);
        void video.play().catch(() => {});
        return;
      }

      setIsMidnightVideoReady(false);

      const handleLoadedData = () => {
        setIsMidnightVideoReady(true);
        void video.play().catch(() => {});
      };

      video.addEventListener("loadeddata", handleLoadedData, { once: true });
      video.load();

      return () => {
        video.removeEventListener("loadeddata", handleLoadedData);
      };
    }

    setIsMidnightVideoReady(false);
    video.pause();
    video.currentTime = 0;
  }, [mode]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (shouldIgnoreShortcut(event)) return;
      const key = event.key.toLowerCase();
      if (!["d", "s", "n", "m", "r", "c"].includes(key)) return;
      event.preventDefault();

      if (key === "d") setMode("day");
      if (key === "s") setMode("summer");
      if (key === "n") setMode("night");
      if (key === "m") setMode("midnight");
      if (key === "r") setMode("rain");
      if (key === "c") void toggleChaos();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  useEffect(() => {
    const rootElement = rootRef.current;

    return () => {
      const activeChaos = chaosStateRef.current;
      if (!activeChaos || !rootElement) return;
      window.cancelAnimationFrame(activeChaos.rafId);
      activeChaos.cleanup();
      rootElement.style.visibility = activeChaos.rootVisibility;
      document.body.style.overflow = activeChaos.bodyOverflow;
      activeChaos.overlay.remove();
    };
  }, []);

  return (
    <SiteModeContext.Provider value={{ mode, setMode, toggleDayNight, toggleChaos }}>
      <div className="arcory-chaos-root" ref={rootRef}>
        {children}
      </div>
      <video
        aria-hidden="true"
        className="arcory-summer-overlay"
        data-ready={isSummerVideoReady ? "true" : "false"}
        loop
        muted
        playsInline
        preload="auto"
        ref={summerVideoRef}
        src="/leaves.mp4"
      />
      <video
        aria-hidden="true"
        className="arcory-midnight-overlay"
        data-ready={isMidnightVideoReady ? "true" : "false"}
        loop
        muted
        playsInline
        preload="auto"
        ref={midnightVideoRef}
        src="/moon.mp4"
      />
      <video
        aria-hidden="true"
        className="arcory-rain-overlay"
        data-ready={isRainVideoReady ? "true" : "false"}
        loop
        muted
        playsInline
        preload="auto"
        ref={rainVideoRef}
        src="/rain.mp4"
      />
    </SiteModeContext.Provider>
  );
}
