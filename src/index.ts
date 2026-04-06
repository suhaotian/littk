/**
 * Hides/shows or repositions elements based on scroll direction.
 * SSR-safe: all DOM access is deferred to init() / refresh().
 *
 * Attributes:
 *   data-scroll-top | data-scroll-bottom | data-scroll-left | data-scroll-right
 *     Declares the role and mode of the element. Only the first matched attr is used.
 *
 *     Hide mode   — attr has no value or empty string:
 *       data-scroll-top          → slides element up out of viewport (translateY)
 *       data-scroll-bottom       → slides element down out of viewport (translateY)
 *       data-scroll-left         → slides element left out of viewport (translateX)
 *       data-scroll-right        → slides element right out of viewport (translateX)
 *       Element must be position: fixed | sticky | absolute.
 *
 *     Distance mode — attr has a CSS value:
 *       data-scroll-top="0"      → sets top to 0px when hidden, reverts when shown
 *       data-scroll-top="1rem"   → sets top to 1rem when hidden, reverts when shown
 *       Bare numbers get "px" appended. Any CSS unit is accepted.
 *       Element is never hidden — only repositioned.
 *
 *   data-offset="px"
 *     Override the auto-computed hide distance (positive number). Hide mode only.
 *
 *   data-duration="300"
 *     Transition duration in ms. Default: 300.
 *
 *   data-delay="0"
 *     ms to wait after scroll stops before executing. Applies to both modes. Default: 0.
 *     Scrolling again resets the timer. Showing is always immediate.
 *
 *   data-trigger="0.67"
 *     Fraction of the element's size (height for top/bottom, width for left/right)
 *     that must be scrolled past the scroll position at which the downward scroll began
 *     before hiding triggers. Range: 0 to infinity (values > 1 = more than the element size).
 *     Default: 0.67 (2/3 of element size). Per-element override of the global triggerRatio.
 *     Only applies to hide mode; distance-mode items always trigger immediately.
 *
 * Usage:
 *   const ctrl = littkk()
 *   ctrl.refresh()   // re-scan DOM after lazy-loaded elements mount
 *   ctrl.destroy()   // call on route change / component unmount
 *
 *   littkk({ scrollTarget: '#my-div' })
 *   littkk({ scrollTarget: containerRef.current })
 */

export interface LittkkOptions {
  /** window (default), CSS selector string, or HTMLElement. */
  scrollTarget?: Window | HTMLElement | string;
  /** Minimum px delta before direction change triggers show/hide. Default: 5 */
  threshold?: number;
  /** Force-show all elements when scrolled to the very top. Default: true */
  showAtTop?: boolean;
  /** Default: true */
  enable?: boolean;
  /**
   * Fraction of the element's relevant dimension (height for top/bottom,
   * width for left/right) that must be scrolled past the hide-start position
   * before the element actually hides. Default: 0.67 (2/3).
   * Per-element data-trigger attribute overrides this value.
   * Only applies to hide-mode elements.
   */
  triggerRatio?: number;
}

export interface LittkkController {
  /** Re-scan DOM and sync new elements to current scroll state. */
  refresh: () => void;
  /** Remove scroll listener and reset all element styles. */
  destroy: () => void;
  /** Enable or disable scroll handling without removing the listener. */
  setEnable: (enable: boolean) => void;
}

export function littkk(options: LittkkOptions = {}): LittkkController {
  const {
    scrollTarget,
    threshold = 5,
    showAtTop = true,
    enable: _enable = true,
    triggerRatio = 0.67,
  } = options;

  type ScrollAttr =
    | "data-scroll-top"
    | "data-scroll-bottom"
    | "data-scroll-left"
    | "data-scroll-right";
  type EdgeProp = "top" | "bottom" | "left" | "right";

  enum Kind {
    hide = 1,
    distance = 2,
  }

  type HideItem = {
    kind: Kind.hide;
    el: HTMLElement;
    duration: number;
    delay: number;
    /** Resolved per-element trigger ratio (fraction of element size). */
    triggerRatio: number;
    /** Size dimension used to compute trigger distance (px). */
    sizeProp: "offsetHeight" | "offsetWidth";
    hideTransform: string;
    /**
     * Whether this item has already been triggered in the current downward run.
     * Prevents repeated rescheduling (and timer resets) on every scroll frame
     * after the threshold is first crossed. Reset to false in showAll().
     */
    triggered: boolean;
  };

  type DistanceItem = {
    kind: Kind.distance;
    el: HTMLElement;
    edgeProp: EdgeProp;
    duration: number;
    delay: number;
    targetValue: string;
    originalValue: string;
    /** Same as HideItem.triggered — prevents repeated timer resets. */
    triggered: boolean;
    /**
     * Trigger ratio for this distance item — mirrors HideItem.triggerRatio so
     * distance-mode elements move in sync with their paired hide-mode element.
     */
    triggerRatio: number;
    /** Size dimension used to compute trigger distance (px). */
    sizeProp: "offsetHeight" | "offsetWidth";
  };

  type Item = HideItem | DistanceItem;

  const TRANSFORM = "transform";
  const TRANSITION = "transition";
  const NONE = "none";
  const PREFIX = `data-scroll-`;

  /**
   * Ordered list — first match wins when multiple data-scroll-* attrs are present.
   * [scrollAttr, translateFn, edgeProp, sizeProp, sign]
   */
  const SCROLL_ATTRS: [
    ScrollAttr,
    string,
    EdgeProp,
    "offsetHeight" | "offsetWidth",
    1 | -1
  ][] = [
    [`${PREFIX}top`, "translateY", "top", "offsetHeight", -1],
    [`${PREFIX}bottom`, "translateY", "bottom", "offsetHeight", 1],
    [`${PREFIX}left`, "translateX", "left", "offsetWidth", -1],
    [`${PREFIX}right`, "translateX", "right", "offsetWidth", 1],
  ];

  let enable = _enable;
  let managed: Item[] = [];
  let eventTarget: Window | HTMLElement | null = null;
  let getScrollTop: () => number = () => 0;
  let prevScrollTop = 0;
  let currentlyVisible = true;
  let ticking = false;
  let destroyed = false;

  /**
   * Scroll position where the most recent downward scroll run began.
   * Set to the previous scroll position on the first downward frame.
   * Reset to null on upward scroll or showAll().
   */
  let downScrollOrigin: number | null = null;

  /** Keyed by element to avoid stale-index bugs. */
  const hideTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  /**
   * Monotonic counter incremented on every showAll() call.
   * Callbacks scheduled by triggerHide() capture this at scheduling time
   * and bail if the counter has advanced (bounce protection: prevents stale
   * hide callbacks firing after a show).
   */
  let showGeneration = 0;

  /** Cache of original edge values per element per prop, persisted across re-scans. */
  const originalEdgeValues = new Map<HTMLElement, Record<string, string>>();

  /**
   * Normalise a data-scroll-* value to a valid CSS value.
   * Bare numbers get "px" appended; values with units are used as-is.
   */
  function normaliseCSSValue(raw: string): string {
    return `${parseFloat(raw)}` === raw.trim() ? `${raw}px` : raw;
  }

  function setHideTransform(
    el: HTMLElement,
    value: string,
    animated: boolean,
    duration: number
  ) {
    el.style[TRANSITION] = animated ? `${TRANSFORM} ${duration}ms ease` : NONE;
    el.style[TRANSFORM] = value;
  }

  function setDistanceEdge(item: DistanceItem, toTarget: boolean) {
    item.el.style[TRANSITION] = `all ${item.duration}ms ease`;
    item.el.style[item.edgeProp] = toTarget
      ? item.targetValue
      : item.originalValue;
  }

  /**
   * Compute CSS transform to fully slide an element out of the viewport.
   * +2px guards against box-shadow bleed. Falls back to 110% if the
   * computed edge property is unparseable (e.g. "auto").
   */
  function computeHideTransform(
    el: HTMLElement,
    fn: string,
    edgeProp: EdgeProp,
    sizeProp: "offsetHeight" | "offsetWidth",
    sign: 1 | -1
  ): string {
    const override = parseFloat(el.getAttribute("data-offset") ?? "");
    if (!isNaN(override)) return `${fn}(${sign * override}px)`;
    const v = parseFloat(
      getComputedStyle(el)[edgeProp as keyof CSSStyleDeclaration] as string
    );
    const dist = isNaN(v)
      ? "110%"
      : `${Math.abs(sign) * (v + el[sizeProp] + 2)}px`;
    return `${fn}(${sign < 0 ? "-" : ""}${dist})`;
  }

  /**
   * Returns the px distance that must be scrolled in a single continuous
   * downward run before this item (hide or distance) triggers.
   */
  function resolveTriggerDistance(item: HideItem | DistanceItem): number {
    return item.triggerRatio * item.el[item.sizeProp];
  }

  function scanElements() {
    const selector = SCROLL_ATTRS.map(([attr]) => `[${attr}]`).join(",");
    managed = Array.from(
      document.querySelectorAll<HTMLElement>(selector)
    ).flatMap((el): Item[] => {
      const duration = parseInt(el.getAttribute("data-duration") ?? "300", 10);
      const delay = parseInt(el.getAttribute("data-delay") ?? "0", 10);

      // Collect all distance-mode attrs — multiple edge props are independent.
      const distanceEdges: DistanceItem[] = SCROLL_ATTRS.flatMap(
        ([attr, , edgeProp, sizeProp]) => {
          if (!el.hasAttribute(attr)) return [];
          const raw = el.getAttribute(attr) ?? "";
          if (raw.trim() === "" || raw === "true") return [];
          const cacheKey = `${edgeProp}`;
          if (!originalEdgeValues.has(el)) originalEdgeValues.set(el, {});
          const cache = originalEdgeValues.get(el)!;
          if (!(cacheKey in cache)) {
            cache[cacheKey] =
              el.style[edgeProp] ||
              (getComputedStyle(el)[
                edgeProp as keyof CSSStyleDeclaration
              ] as string);
          }
          // Per-element triggerRatio from data-trigger, falls back to global option.
          const rawTrigger = el.getAttribute("data-trigger");
          const resolvedTriggerRatio =
            rawTrigger !== null && rawTrigger.trim() !== ""
              ? parseFloat(rawTrigger)
              : triggerRatio;
          return [
            {
              kind: Kind.distance,
              el,
              edgeProp,
              sizeProp,
              duration,
              delay,
              targetValue: normaliseCSSValue(raw),
              originalValue: cache[cacheKey] as string,
              triggered: false,
              triggerRatio: isNaN(resolvedTriggerRatio)
                ? triggerRatio
                : resolvedTriggerRatio,
            },
          ];
        }
      );

      if (distanceEdges.length > 0) return distanceEdges;

      // Hide mode — first matching attr wins (only one transform axis allowed).
      const hideMatch = SCROLL_ATTRS.find(([attr]) => el.hasAttribute(attr));
      if (!hideMatch) return [];
      const [, fn, edgeProp, sizeProp, sign] = hideMatch;

      // Per-element triggerRatio from data-trigger, falls back to global option.
      const rawTrigger = el.getAttribute("data-trigger");
      const resolvedTriggerRatio =
        rawTrigger !== null && rawTrigger.trim() !== ""
          ? parseFloat(rawTrigger)
          : triggerRatio;

      return [
        {
          kind: Kind.hide,
          el,
          duration,
          delay,
          triggerRatio: isNaN(resolvedTriggerRatio)
            ? triggerRatio
            : resolvedTriggerRatio,
          sizeProp,
          hideTransform: computeHideTransform(el, fn, edgeProp, sizeProp, sign),
          triggered: false,
        },
      ];
    });
  }

  /** Show all managed items and reset all per-run state. */
  function showAll(animated = true) {
    showGeneration++;
    currentlyVisible = true;
    downScrollOrigin = null;
    hideTimers.forEach(clearTimeout);
    hideTimers.clear();
    for (const item of managed) {
      item.triggered = false;
      if (item.kind === Kind.hide) {
        setHideTransform(item.el, "", animated, item.duration);
      } else {
        setDistanceEdge(item, false);
      }
    }
  }

  /**
   * Schedule or immediately apply the hide for one item.
   * item.triggered must be false before calling — callers must guard this.
   * The gen snapshot prevents stale callbacks from firing after a showAll().
   */
  function triggerHide(item: Item, gen: number) {
    item.triggered = true;

    const apply =
      item.kind === Kind.hide
        ? () => {
            hideTimers.delete(item.el);
            if (!destroyed && gen === showGeneration)
              setHideTransform(
                item.el,
                item.hideTransform,
                true,
                item.duration
              );
          }
        : () => {
            hideTimers.delete(item.el);
            if (!destroyed && gen === showGeneration)
              setDistanceEdge(item, true);
          };

    if (item.delay <= 0) {
      apply();
    } else {
      hideTimers.set(item.el, setTimeout(apply, item.delay));
    }
  }

  /**
   * Called on each downward scroll frame with total px scrolled in the
   * current continuous downward run.
   *
   * Each item is evaluated once per run — item.triggered gates repeat calls.
   * currentlyVisible is only set false when at least one item actually fires,
   * keeping it accurate even while items are still below their threshold.
   */
  function evaluateHide(scrolledInRun: number) {
    const gen = showGeneration;
    for (const item of managed) {
      if (item.triggered) continue;
      if (scrolledInRun < resolveTriggerDistance(item)) continue;
      currentlyVisible = false;
      triggerHide(item, gen);
    }
  }

  function onScroll() {
    if (destroyed || ticking || !enable) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (destroyed) return;

      const current = getScrollTop();
      const prev = prevScrollTop;
      const delta = current - prev;
      prevScrollTop = current;

      if (Math.abs(delta) < threshold) return;

      if (showAtTop && current <= 0) {
        if (!currentlyVisible) showAll();
        return;
      }

      if (delta < 0) {
        // Scrolling up — show immediately, reset downward run.
        downScrollOrigin = null;
        if (!currentlyVisible) showAll();
      } else {
        // Scrolling down — record the start of this run on first downward frame.
        if (downScrollOrigin === null) downScrollOrigin = prev;
        evaluateHide(current - downScrollOrigin);
      }
    });
  }

  function init() {
    if (!scrollTarget || scrollTarget === window) {
      eventTarget = window;
      getScrollTop = () => window.scrollY;
    } else if (scrollTarget instanceof HTMLElement) {
      eventTarget = scrollTarget;
      getScrollTop = () => (scrollTarget as HTMLElement).scrollTop;
    } else if (typeof scrollTarget === "string") {
      const el = document.querySelector<HTMLElement>(scrollTarget);
      if (!el) return;
      eventTarget = el;
      getScrollTop = () => el.scrollTop;
    }
    if (!eventTarget) return;
    scanElements();
    prevScrollTop = getScrollTop();
    eventTarget.addEventListener("scroll", onScroll, { passive: true });
  }

  function refresh() {
    if (destroyed) return;
    scanElements();
    if (currentlyVisible) {
      showAll(false);
    } else {
      hideTimers.forEach(clearTimeout);
      hideTimers.clear();
      for (const item of managed) {
        // Mark as triggered so evaluateHide won't re-fire on next scroll frame.
        item.triggered = true;
        if (item.kind === Kind.hide) {
          setHideTransform(item.el, item.hideTransform, false, 0);
        } else {
          setDistanceEdge(item, true);
        }
      }
    }
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    hideTimers.forEach(clearTimeout);
    hideTimers.clear();
    if (eventTarget) eventTarget.removeEventListener("scroll", onScroll);
    for (const item of managed) {
      if (item.kind === Kind.hide) {
        item.el.style[TRANSITION] = "";
        item.el.style[TRANSFORM] = "";
      } else {
        item.el.style[TRANSITION] = "";
        item.el.style[item.edgeProp] = item.originalValue;
        const cache = originalEdgeValues.get(item.el);
        if (cache) delete cache[item.edgeProp];
      }
    }
    managed = [];
    eventTarget = null;
  }

  init();
  return {
    refresh,
    destroy,
    setEnable(value: boolean) {
      enable = value;
    },
  };
}
