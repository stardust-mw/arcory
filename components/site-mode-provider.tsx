"use client";

import { Bodies, Body as MatterBody, Engine, Sleeping, World, type Body as MatterBodyInstance, type Engine as MatterEngine } from "matter-js";
import { createContext, useContext, useEffect, useEffectEvent, useRef, useState, type ReactNode } from "react";

import { SiteModeAtmosphere } from "@/components/site-mode-atmosphere";
import {
  SITE_MODE_ATMOSPHERES,
  SITE_MODE_PENDING_SHORTCUT_KEY,
  SITE_MODE_PENDING_SHORTCUT_MAX_AGE_MS,
  SITE_MODE_SHORTCUT_KEYS,
  applySiteMode,
  clearManualSiteMode,
  getActiveManualSiteMode,
  getTimeBasedSiteMode,
  getModeFromShortcut,
  resolveAdaptiveSiteMode,
  saveManualSiteMode,
  type SiteMode,
} from "@/lib/site-mode";

type SiteModeContextValue = {
  mode: SiteMode;
  setMode: (mode: SiteMode) => void;
  toggleDayNight: () => void;
  toggleChaos: () => void;
};

type ChaosKind = "block" | "word" | "separator";

type ChaosRect = {
  bottom: number;
  height: number;
  left: number;
  right: number;
  top: number;
  width: number;
};

type ChaosSeparatorSide = "left" | "right";

type ChaosCandidate = {
  content: HTMLElement | string;
  isTempElement?: boolean;
  kind: ChaosKind;
  originalElement?: HTMLElement;
  rect: ChaosRect;
  separatorColor?: string;
  separatorSide?: ChaosSeparatorSide;
  separatorWidth?: number;
  styleSource?: HTMLElement;
};

type ChaosRestoreTarget = {
  element: HTMLElement;
  html: string | null;
  visibility: string;
};

type ChaosStyleRestore = {
  element: HTMLElement;
  property: "borderLeft" | "borderRight" | "borderTop" | "borderBottom" | "borderBottomColor";
  value: string;
};

type ChaosItem = {
  body: MatterBodyInstance;
  height: number;
  isTempElement: boolean;
  kind: ChaosKind;
  node: HTMLDivElement;
  originalElement?: HTMLElement;
  originalVisibility?: string;
  originX: number;
  originY: number;
  width: number;
};

type ChaosState = {
  bodyOverflow: string;
  borderRestores: ChaosStyleRestore[];
  cleanup: () => void;
  engine: MatterEngine;
  hiddenRoot?: HTMLElement;
  items: ChaosItem[];
  overlay: HTMLDivElement;
  rafId: number;
  restoreTargets: ChaosRestoreTarget[];
  rootVisibility?: string;
};


const SiteModeContext = createContext<SiteModeContextValue | null>(null);
const SITE_MODE_SHORTCUT_KEY_SET = new Set<string>(SITE_MODE_SHORTCUT_KEYS);

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

function toChaosRect(rect: Pick<DOMRect, "bottom" | "height" | "left" | "right" | "top" | "width">): ChaosRect {
  return {
    bottom: rect.bottom,
    height: rect.height,
    left: rect.left,
    right: rect.right,
    top: rect.top,
    width: rect.width,
  };
}

function isFullyVisible(rect: Pick<ChaosRect, "bottom" | "height" | "left" | "right" | "top" | "width">) {
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

function normalizeColor(value: string) {
  const normalized = value.trim().toLowerCase();
  const match = normalized.match(/^okl(ab|ch)\((.+)\)$/);
  if (!match) return value;

  const [channelsPart, alphaPart] = match[2].split("/").map((part) => part.trim());
  const channels = channelsPart.split(/\s+/).map(Number);
  const alpha = alphaPart ? Number(alphaPart) : 1;
  if (channels.some((channel) => Number.isNaN(channel)) || Number.isNaN(alpha)) return value;

  const [l, second, third] = channels;
  const [a, b] =
    match[1] === "ch"
      ? [second * Math.cos((third * Math.PI) / 180), second * Math.sin((third * Math.PI) / 180)]
      : [second, third];

  const lComponent = l + 0.3963377774 * a + 0.2158037573 * b;
  const mComponent = l - 0.1055613458 * a - 0.0638541728 * b;
  const sComponent = l - 0.0894841775 * a - 1.291485548 * b;

  const lCube = lComponent ** 3;
  const mCube = mComponent ** 3;
  const sCube = sComponent ** 3;

  const toSrgb = (channel: number) => {
    const clamped = Math.max(0, Math.min(1, channel));
    if (clamped <= 0.0031308) return 12.92 * clamped;
    return 1.055 * clamped ** (1 / 2.4) - 0.055;
  };

  const redLinear = 4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube;
  const greenLinear = -1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube;
  const blueLinear = -0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube;

  const red = Math.round(toSrgb(redLinear) * 255);
  const green = Math.round(toSrgb(greenLinear) * 255);
  const blue = Math.round(toSrgb(blueLinear) * 255);
  const opacity = Math.max(0, Math.min(1, alpha));

  return `rgba(${red}, ${green}, ${blue}, ${opacity})`;
}

function createOverlayItem(candidate: ChaosCandidate) {
  const width = candidate.kind === "separator" ? Math.max(1, Math.round(candidate.separatorWidth ?? candidate.rect.width)) : Math.max(2, candidate.rect.width);
  const height = candidate.kind === "separator" ? Math.max(2, candidate.rect.height) : Math.max(2, candidate.rect.height);
  const originX = candidate.rect.left + width / 2;
  const originY = candidate.rect.top + height / 2;
  const node = document.createElement("div");

  node.className = "arcory-chaos-piece";
  node.dataset.kind = candidate.kind;
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.transform = `translate(${originX - width / 2}px, ${originY - height / 2}px)`;

  if (candidate.kind === "separator") {
    const line = document.createElement("div");
    line.style.position = "absolute";
    line.style.top = "0";
    line.style.bottom = "0";
    line.style.width = `${candidate.separatorWidth ?? 1}px`;
    line.style.pointerEvents = "none";
    line.style.backgroundColor = candidate.separatorColor ?? "currentColor";

    if (candidate.separatorSide === "left") {
      line.style.left = "0";
    } else {
      line.style.right = "0";
    }

    node.appendChild(line);
  } else if (typeof candidate.content === "string") {
    node.textContent = candidate.content;
    node.classList.add("arcory-chaos-word");
  } else {
    const clone = candidate.content.cloneNode(true) as HTMLElement;
    const position = window.getComputedStyle(candidate.content).position;
    if (position === "fixed" || position === "sticky") {
      clone.style.position = "static";
    }
    clone.style.width = `${width}px`;
    clone.style.height = `${height}px`;
    clone.style.margin = "0";
    clone.style.pointerEvents = "none";
    clone.style.overflow = "hidden";
    node.appendChild(clone);
  }

  return { node, width, height, originX, originY };
}

function wrapTextNodes(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    if (!text.trim()) return;

    const fragment = document.createDocumentFragment();
    for (const part of text.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }

      const span = document.createElement("span");
      span.className = "_cw";
      span.style.display = "inline-block";
      span.textContent = part;
      fragment.appendChild(span);
    }

    node.parentNode?.replaceChild(fragment, node);
    return;
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const element = node as HTMLElement;
  if (["IMG", "VIDEO", "SVG", "CANVAS", "BUTTON", "INPUT"].includes(element.tagName)) return;

  Array.from(element.childNodes).forEach(wrapTextNodes);
}

function collectDesktopChaos(root: HTMLElement) {
  if (window.innerWidth < 1024) return null;

  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;
  const columns = Array.from(root.querySelectorAll<HTMLElement>(".arcory-chaos-column"));
  if (columns.length === 0) return null;

  const candidates: ChaosCandidate[] = [];
  const restoreTargets: ChaosRestoreTarget[] = [];
  const borderRestores: ChaosStyleRestore[] = [];

  const hideElement = (element: HTMLElement | null | undefined) => {
    if (!element) return;
    restoreTargets.push({
      element,
      html: null,
      visibility: element.style.visibility,
    });
    element.style.visibility = "hidden";
  };

  const addBlock = (element: HTMLElement | null | undefined, kind: ChaosKind = "block") => {
    if (!element || !isVisibleElement(element)) return;
    const rect = element.getBoundingClientRect();
    if (!isFullyVisible(rect)) return;
    candidates.push({
      content: element,
      kind,
      originalElement: element,
      rect: toChaosRect(rect),
    });
  };

  const addSeparator = (rect: ChaosRect, separatorColor: string, separatorSide: ChaosSeparatorSide, separatorWidth: number) => {
    if (rect.width < 1 || rect.height < 1 || rect.top < 0 || rect.left < 0 || rect.bottom > viewportHeight || rect.right > viewportWidth) {
      return;
    }

    candidates.push({
      content: root,
      kind: "separator",
      rect,
      separatorColor: normalizeColor(separatorColor),
      separatorSide,
      separatorWidth,
    });
  };

  const splitContainer = (element: HTMLElement | null | undefined) => {
    if (!element || !isVisibleElement(element) || !element.textContent?.trim()) return;

    restoreTargets.push({
      element,
      html: element.innerHTML,
      visibility: element.style.visibility,
    });

    Array.from(element.childNodes).forEach(wrapTextNodes);
    element.querySelectorAll<HTMLElement>("._cw").forEach((span) => {
      const rect = span.getBoundingClientRect();
      if (!isFullyVisible(rect)) return;
      candidates.push({
        content: span.textContent ?? "",
        kind: "word",
        rect: toChaosRect(rect),
        styleSource: span,
      });
    });

    element.style.visibility = "hidden";
  };

  hideElement(root.querySelector<HTMLElement>(".arcory-chaos-logo-mark"));
  splitContainer(root.querySelector<HTMLElement>(".arcory-chaos-logo-copy"));

  const toolbar = root.querySelector<HTMLElement>(".arcory-chaos-toolbar");
  toolbar?.querySelectorAll<HTMLElement>("button, input").forEach((element) => addBlock(element));

  const siteRows = Array.from(root.querySelectorAll<HTMLElement>(".arcory-site-row"));
  if (siteRows.length === 0) {
    root.querySelectorAll<HTMLElement>(".animate-pulse").forEach((element) => addBlock(element));
  }

  siteRows.forEach((row) => {
    const rect = row.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1 || rect.bottom < 0 || rect.top > viewportHeight) return;

    addBlock(row.querySelector<HTMLElement>(".arcory-site-row-chevron"));
    addBlock(row.querySelector<HTMLElement>(".arcory-site-row-avatar"));
    splitContainer(row.querySelector<HTMLElement>(".arcory-site-row-copy"));
    borderRestores.push({
      element: row,
      property: "borderBottomColor",
      value: row.style.borderBottomColor,
    });
    row.style.borderBottomColor = "transparent";
  });

  splitContainer(root.querySelector<HTMLElement>(".arcory-chaos-summary"));
  root.querySelectorAll<HTMLElement>(".arcory-chaos-empty").forEach((element) => splitContainer(element));
  root.querySelectorAll<HTMLElement>(".arcory-chaos-preview").forEach((element) => hideElement(element));

  for (const column of columns) {
    const rect = column.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const style = window.getComputedStyle(column);
    const rightWidth = parseFloat(style.borderRightWidth) || 0;
    const rightColor = style.borderRightColor;
    if (rightWidth >= 1 && rect.right > 0 && rect.left < viewportWidth) {
      borderRestores.push({
        element: column,
        property: "borderRight",
        value: column.style.borderRight,
      });
      column.style.borderRight = "none";

      addSeparator(
        {
          bottom: viewportHeight,
          height: viewportHeight,
          left: rect.right - rightWidth,
          right: rect.right,
          top: 0,
          width: rightWidth,
        },
        rightColor,
        "right",
        rightWidth,
      );
    }

    const leftWidth = parseFloat(style.borderLeftWidth) || 0;
    const leftColor = style.borderLeftColor;
    if (leftWidth >= 1 && rect.right > 0 && rect.left < viewportWidth) {
      borderRestores.push({
        element: column,
        property: "borderLeft",
        value: column.style.borderLeft,
      });
      column.style.borderLeft = "none";

      addSeparator(
        {
          bottom: viewportHeight,
          height: viewportHeight,
          left: rect.left - leftWidth,
          right: rect.left,
          top: 0,
          width: leftWidth,
        },
        leftColor,
        "left",
        leftWidth,
      );
    }
  }

  const ordered = candidates
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
    .slice(0, 700);

  if (ordered.length === 0) return null;

  return {
    borderRestores,
    candidates: ordered,
    hideRoot: false,
    restoreTargets,
  };
}

function collectFallbackChaos(root: HTMLElement) {
  const candidates: ChaosCandidate[] = [];
  const blockElements = Array.from(
    root.querySelectorAll<HTMLElement>(
      "button, input, img, video, svg, canvas, [role='button'], .arcory-chaos-block",
    ),
  );
  const blockedTextRoots = new WeakSet<Node>();
  const restoreTargets: ChaosRestoreTarget[] = [];

  root.querySelectorAll<HTMLElement>(".arcory-chaos-image, .arcory-chaos-preview").forEach((element) => {
    restoreTargets.push({ element, html: null, visibility: element.style.visibility });
    element.style.visibility = "hidden";
  });

  for (const element of blockElements) {
    if (element.closest(".arcory-chaos-image, .arcory-chaos-preview")) continue;
    if (!isVisibleElement(element)) continue;
    const rect = element.getBoundingClientRect();
    if (!isFullyVisible(rect)) continue;
    if (rect.width >= window.innerWidth * 0.92 || rect.height >= window.innerHeight * 0.92) continue;
    candidates.push({
      content: element,
      kind: "block",
      rect: toChaosRect(rect),
    });
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
      candidates.push({
        content: word,
        kind: "word",
        rect: toChaosRect(rect),
        styleSource: parent,
      });
    }
  }

  return {
    borderRestores: [],
    candidates: candidates
      .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left)
      .slice(0, 900),
    hideRoot: true,
    restoreTargets,
  };
}

function createChaos(root: HTMLElement): ChaosState | null {
  const snapshot = collectDesktopChaos(root) ?? collectFallbackChaos(root);
  if (snapshot.candidates.length === 0) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const wallWidth = 120;
  const engine = Engine.create({ gravity: { y: 3.5 }, enableSleeping: true });
  const world = engine.world;
  const overlay = document.createElement("div");
  const items: ChaosItem[] = [];
  let dragBody: MatterBodyInstance | null = null;
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

  for (const candidate of snapshot.candidates) {
    const overlayItem = createOverlayItem(candidate);
    if (candidate.kind === "word" && candidate.styleSource) {
      copyTextStyles(candidate.styleSource, overlayItem.node);
    }

    overlay.appendChild(overlayItem.node);
    const body = Bodies.rectangle(overlayItem.originX, overlayItem.originY, overlayItem.width, overlayItem.height, {
      ...(candidate.kind === "separator"
        ? { density: 0.0003, friction: 0.2, frictionAir: 0.001, restitution: 0.5 }
        : candidate.kind === "word"
          ? { friction: 0.42, frictionAir: 0.0032, restitution: 0.16 }
          : { friction: 0.72, frictionAir: 0.0046, restitution: 0.08 }),
    });
    World.add(world, body);

    MatterBody.setAngle(body, candidate.kind === "separator" ? (Math.random() - 0.5) * 0.12 : (Math.random() - 0.5) * 0.08);
    if (candidate.kind === "separator") {
      MatterBody.setAngularVelocity(body, (Math.random() - 0.5) * 0.04);
    }
    MatterBody.setVelocity(body, {
      x: (Math.random() - 0.5) * (candidate.kind === "word" ? 0.8 : candidate.kind === "separator" ? 0.9 : 0.45),
      y: Math.random() * (candidate.kind === "word" ? 0.35 : candidate.kind === "separator" ? 0.16 : 0.18),
    });

    const originalVisibility = candidate.originalElement?.style.visibility ?? "";
    if (candidate.originalElement && !candidate.isTempElement) {
      candidate.originalElement.style.visibility = "hidden";
    }

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

    items.push({
      body,
      height: overlayItem.height,
      isTempElement: Boolean(candidate.isTempElement),
      kind: candidate.kind,
      node: overlayItem.node,
      originalElement: candidate.originalElement,
      originalVisibility,
      originX: overlayItem.originX,
      originY: overlayItem.originY,
      width: overlayItem.width,
    });
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

  const bodyOverflow = document.body.style.overflow;
  let hiddenRoot: HTMLElement | undefined;
  let rootVisibility: string | undefined;
  if (snapshot.hideRoot) {
    hiddenRoot = root;
    rootVisibility = root.style.visibility;
    root.style.visibility = "hidden";
  }
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
    bodyOverflow,
    borderRestores: snapshot.borderRestores,
    cleanup: () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerUp);
    },
    engine,
    hiddenRoot,
    items,
    overlay,
    rafId,
    restoreTargets: snapshot.restoreTargets,
    rootVisibility,
  };
}

function reverseChaos(_root: HTMLElement, state: ChaosState, onDone: () => void) {
  window.cancelAnimationFrame(state.rafId);
  state.cleanup();

  const snapshots = state.items.map((item) => ({
    ...item,
    fromAngle: item.body.angle,
    fromX: item.body.position.x,
    fromY: item.body.position.y,
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

    for (const item of state.items) {
      if (item.isTempElement) {
        item.originalElement?.remove();
        continue;
      }
      if (item.kind !== "word" && item.originalElement) {
        item.originalElement.style.visibility = item.originalVisibility ?? "";
      }
    }

    state.restoreTargets.forEach(({ element, html, visibility }) => {
      if (html !== null) element.innerHTML = html;
      element.style.visibility = visibility;
    });
    state.borderRestores.forEach(({ element, property, value }) => {
      element.style[property] = value;
    });

    if (state.hiddenRoot) {
      state.hiddenRoot.style.visibility = state.rootVisibility ?? "";
    }
    document.body.style.overflow = state.bodyOverflow;
    state.overlay.remove();
    matterCleanup(state.engine);
    onDone();
  }

  state.rafId = window.requestAnimationFrame(animate);
}

function matterCleanup(engine: MatterEngine) {
  engine.world.bodies.length = 0;
  engine.world.constraints.length = 0;
  engine.world.composites.length = 0;
}

function consumePendingShortcut() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(SITE_MODE_PENDING_SHORTCUT_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(SITE_MODE_PENDING_SHORTCUT_KEY);

    const parsed = JSON.parse(raw) as { key?: string; timestamp?: number };
    if (!parsed.key || typeof parsed.timestamp !== "number") return null;
    if (Date.now() - parsed.timestamp > SITE_MODE_PENDING_SHORTCUT_MAX_AGE_MS) return null;
    return parsed.key.toLowerCase();
  } catch {
    return null;
  }
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
  const rootRef = useRef<HTMLDivElement | null>(null);
  const chaosStateRef = useRef<ChaosState | null>(null);
  const chaosLockedRef = useRef(false);
  const hasManualOverrideRef = useRef(false);
  const modeRef = useRef<SiteMode>("day");

  const setMode = (nextMode: SiteMode) => {
    hasManualOverrideRef.current = true;
    modeRef.current = nextMode;
    setModeState(nextMode);
  };

  const toggleDayNight = () => {
    hasManualOverrideRef.current = true;
    setModeState((current) => {
      const nextMode = current === "night" || current === "midnight" ? "day" : "night";
      modeRef.current = nextMode;
      return nextMode;
    });
  };

  const toggleChaos = () => {
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
    try {
      const chaos = createChaos(root);
      chaosStateRef.current = chaos;
    } catch (error) {
      console.error("Failed to toggle chaos mode", error);
    } finally {
      chaosLockedRef.current = false;
    }
  };

  useEffect(() => {
    let isCancelled = false;
    const pendingShortcut = consumePendingShortcut();
    const manualOverride = getActiveManualSiteMode();
    const root = document.documentElement;
    root.dataset.arcoryHydrated = "true";

    const shortcutMode = getModeFromShortcut(pendingShortcut);
    const nextMode = shortcutMode ?? manualOverride ?? getTimeBasedSiteMode();
    hasManualOverrideRef.current = Boolean(shortcutMode ?? manualOverride);
    modeRef.current = nextMode;
    setModeState(nextMode);
    applySiteMode(nextMode);
    setIsModeReady(true);

    if (!shortcutMode && !manualOverride) {
      void resolveAdaptiveSiteMode().then((adaptiveMode) => {
        if (isCancelled || hasManualOverrideRef.current || modeRef.current === adaptiveMode) return;

        modeRef.current = adaptiveMode;
        setModeState(adaptiveMode);
      });
    }

    if (pendingShortcut === "c") {
      window.setTimeout(() => {
        toggleChaos();
      }, 0);
    }

    return () => {
      isCancelled = true;
      delete root.dataset.arcoryHydrated;
    };
  }, []);

  useEffect(() => {
    if (!isModeReady) return;
    modeRef.current = mode;
    applySiteMode(mode);
    if (hasManualOverrideRef.current) {
      saveManualSiteMode(mode);
      return;
    }

    clearManualSiteMode();
  }, [isModeReady, mode]);

  const handleShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (shouldIgnoreShortcut(event)) return;
    const key = event.key.toLowerCase();
    if (!SITE_MODE_SHORTCUT_KEY_SET.has(key)) return;
    event.preventDefault();

    if (key === "c") {
      toggleChaos();
      return;
    }

    const nextMode = getModeFromShortcut(key);
    if (nextMode) setMode(nextMode);
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      handleShortcut(event);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const rootElement = rootRef.current;

    return () => {
      const activeChaos = chaosStateRef.current;
      if (!activeChaos || !rootElement) return;
      window.cancelAnimationFrame(activeChaos.rafId);
      activeChaos.cleanup();
      activeChaos.restoreTargets.forEach(({ element, html, visibility }) => {
        if (html !== null) element.innerHTML = html;
        element.style.visibility = visibility;
      });
      activeChaos.borderRestores.forEach(({ element, property, value }) => {
        element.style[property] = value;
      });
      activeChaos.items.forEach((item) => {
        if (item.isTempElement) {
          item.originalElement?.remove();
          return;
        }
        if (item.kind !== "word" && item.originalElement) {
          item.originalElement.style.visibility = item.originalVisibility ?? "";
        }
      });
      if (activeChaos.hiddenRoot) activeChaos.hiddenRoot.style.visibility = activeChaos.rootVisibility ?? "";
      document.body.style.overflow = activeChaos.bodyOverflow;
      activeChaos.overlay.remove();
    };
  }, []);

  return (
    <SiteModeContext.Provider value={{ mode, setMode, toggleDayNight, toggleChaos }}>
      <div className="arcory-chaos-root" ref={rootRef}>
        {children}
      </div>
      {SITE_MODE_ATMOSPHERES.map((config) => (
        <SiteModeAtmosphere activeMode={mode} config={config} key={config.mode} />
      ))}
    </SiteModeContext.Provider>
  );
}
