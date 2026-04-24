"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * TextScramble（文本随机解扰）组件
 *
 * 1) 组件用途
 * - 将最终文本先渲染为随机字符，再按时间逐字符“解锁”成真实文本。
 * - 适合 Hero 标题、分区标题、强调文案等需要轻动效的场景。
 *
 * 2) 动画机制
 * - 使用 requestAnimationFrame 驱动逐帧更新。
 * - 每个非空格字符会被分配一个揭示时间点（0 ~ durationMs）。
 * - 未到揭示时间时显示随机字符；到时切换为真实字符。
 * - 空格字符不参与随机，直接保持为空格，避免版式抖动。
 *
 * 3) 触发机制
 * - 默认使用 IntersectionObserver，元素进入视口后才开始播放。
 * - 可通过 once 控制是否只播放一次。
 * - 可通过 startDelayMs 控制延迟启动，用于多行文本错峰动效。
 *
 * 4) 可访问性与降级
 * - 当用户系统开启 prefers-reduced-motion: reduce 时，直接显示静态文本。
 * - span 使用 aria-label 始终暴露真实文案，避免读屏读到随机字符。
 *
 * 5) 复用建议
 * - 同一区域多行文案可复用本组件，并给副标题增加 100~300ms delay。
 * - charset 可按品牌风格替换，例如只保留符号或只保留大写字母。
 */
const DEFAULT_CHARSET = ".:-+~/\\=#ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/**
 * @param text 最终展示的真实文本
 * @param durationMs 从随机字符过渡到真实文本的总时长（毫秒）
 * @param startDelayMs 动画延迟开始时间（毫秒）
 * @param charset 随机字符池（会自动过滤空格）
 * @param startOnView 是否在进入视口时触发
 * @param once 是否只播放一次
 * @param replayOnReenter 是否在滚出后再次进入视口时重播动画
 * @param rootMargin 视口触发边界，语义同 IntersectionObserver rootMargin
 */
type TextScrambleProps = {
  text: string;
  className?: string;
  durationMs?: number;
  startDelayMs?: number;
  charset?: string;
  startOnView?: boolean;
  once?: boolean;
  replayOnReenter?: boolean;
  rootMargin?: string;
};

function shuffleIndexes(indexes: number[]) {
  // Fisher-Yates 洗牌，保证字符揭示顺序是随机且均匀的。
  const next = [...indexes];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function TextScramble({
  text,
  className,
  durationMs = 1500,
  startDelayMs = 0,
  charset = DEFAULT_CHARSET,
  startOnView = true,
  once = true,
  replayOnReenter = false,
  rootMargin = "-100px",
}: TextScrambleProps) {
  const containerRef = useRef<HTMLSpanElement | null>(null);
  const frameRef = useRef(0);
  const hasPlayedRef = useRef(false);
  const [isInView, setIsInView] = useState(!startOnView);
  const [displayText, setDisplayText] = useState(text);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const visibleIndexes = useMemo(() => {
    // 只记录非空格字符的索引，避免空格也参与“抖动”。
    const indexes: number[] = [];
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] !== " ") indexes.push(index);
    }
    return indexes;
  }, [text]);

  const randomChar = useMemo(() => {
    // 允许调用方自定义字符池；若为空则回退到默认字符池。
    const list = charset.split("").filter((char) => char !== " ");
    const chars = list.length > 0 ? list : DEFAULT_CHARSET.split("");
    return () => chars[Math.floor(Math.random() * chars.length)];
  }, [charset]);

  useEffect(() => {
    if (!startOnView && !replayOnReenter) return;
    const element = containerRef.current;
    if (!element) return;

    // 进入视口才开始动画，减少页面首屏渲染压力。
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once && !replayOnReenter) observer.disconnect();
        } else if (replayOnReenter) {
          setIsInView(false);
          // 允许下次回到视口时重新播放。
          hasPlayedRef.current = false;
        } else if (!once) {
          setIsInView(false);
        }
      },
      { rootMargin },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [once, replayOnReenter, rootMargin, startOnView]);

  useEffect(() => {
    // 尊重系统“减少动态效果”偏好，避免给敏感用户造成负担。
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(mediaQuery.matches);
    onChange();
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (!isInView) return;
    if (once && !replayOnReenter && hasPlayedRef.current) return;

    hasPlayedRef.current = true;

    // 无动画模式：直接渲染最终文本。
    if (prefersReducedMotion) return;

    const orderedIndexes = shuffleIndexes(visibleIndexes);
    const revealTimeMap = new Map<number, number>();
    orderedIndexes.forEach((charIndex, orderIndex) => {
      // 将“随机顺序”均匀映射到整段时长，形成逐字符揭示节奏。
      const progress = orderedIndexes.length <= 1 ? 1 : orderIndex / (orderedIndexes.length - 1);
      revealTimeMap.set(charIndex, progress * durationMs);
    });

    let startTime = 0;

    const tick = (timestamp: number) => {
      if (!startTime) startTime = timestamp;

      const elapsed = timestamp - startTime - startDelayMs;
      if (elapsed < 0) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      let next = "";
      for (let index = 0; index < text.length; index += 1) {
        const current = text[index];
        if (current === " ") {
          next += " ";
          continue;
        }

        const revealAt = revealTimeMap.get(index) ?? durationMs;
        // 未到该字符的揭示时刻 -> 随机字符；到时刻 -> 真实字符。
        next += elapsed >= revealAt ? current : randomChar();
      }

      setDisplayText(next);

      if (elapsed < durationMs) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayText(text);
      }
    };

    frameRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frameRef.current);
  }, [
    durationMs,
    isInView,
    once,
    prefersReducedMotion,
    randomChar,
    replayOnReenter,
    startDelayMs,
    text,
    visibleIndexes,
  ]);

  // 兜底策略：未进入视口或 reduced-motion 模式时，始终显示真实文本。
  const renderedText = prefersReducedMotion || !isInView ? text : displayText;

  return (
    <span aria-label={text} className={cn(className)} ref={containerRef}>
      {renderedText}
    </span>
  );
}
