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
  /** default `enable: true` */
  enable?: boolean;
}

export interface LittkkController {
  /** Re-scan DOM and sync new elements to current scroll state. */
  refresh: () => void;
  /** Remove scroll listener and reset all element styles. */
  destroy: () => void;
  /** disable */
  disable: () => void;
  /** enable */
  enable: () => void;
}

export function littkk(options: LittkkOptions = {}): LittkkController {
  const {
    scrollTarget,
    threshold = 5,
    showAtTop = true,
    enable: _enable = true,
  } = options;

  type ScrollAttr =
    | "data-scroll-top"
    | "data-scroll-bottom"
    | "data-scroll-left"
    | "data-scroll-right";
  type EdgeProp = "top" | "bottom" | "left" | "right";

  type HideItem = {
    kind: "hide";
    el: HTMLElement;
    duration: number;
    delay: number;
    hideTransform: string;
  };

  type DistanceItem = {
    kind: "distance";
    el: HTMLElement;
    edgeProp: EdgeProp;
    duration: number;
    delay: number;
    targetValue: string;
    originalValue: string;
  };

  type Item = HideItem | DistanceItem;

  const TRANSFORM = "transform";
  const TRANSITION = "transition";
  const NONE = "none";

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
    ["data-scroll-top", "translateY", "top", "offsetHeight", -1],
    ["data-scroll-bottom", "translateY", "bottom", "offsetHeight", 1],
    ["data-scroll-left", "translateX", "left", "offsetWidth", -1],
    ["data-scroll-right", "translateX", "right", "offsetWidth", 1],
  ];

  let enable = _enable;
  let managed: Item[] = [];
  let eventTarget: Window | HTMLElement | null = null;
  let getScrollTop: () => number = () => 0;
  let lastScrollTop = 0;
  let currentlyVisible = true;
  let ticking = false;
  let destroyed = false;

  /** Keyed by element to avoid stale-index bugs. */
  const hideTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  /**
   * Persists the original edge value across re-scans so refresh() while hidden
   * doesn't capture the already-mutated targetValue as the original.
   */
  /** Cache of original edge values per element per prop, persisted across re-scans. */
  const originalEdgeValues = new WeakMap<HTMLElement, Record<string, string>>();

  /**
   * Normalise a data-scroll-* value to a valid CSS value.
   * Bare numbers get "px" appended; values with units are used as-is.
   */
  function normaliseCSSValue(raw: string): string {
    return String(parseFloat(raw)) === raw.trim() ? `${raw}px` : raw;
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
   * +2px guards against box-shadow bleed. Falls back to ±110% if the
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

  function scanElements() {
    const selector = SCROLL_ATTRS.map(([attr]) => `[${attr}]`).join(",");
    managed = Array.from(
      document.querySelectorAll<HTMLElement>(selector)
    ).flatMap((el): Item[] => {
      const duration = parseInt(el.getAttribute("data-duration") ?? "300", 10);
      const delay = parseInt(el.getAttribute("data-delay") ?? "0", 10);

      // Collect all distance-mode attrs — multiple edge props are independent (e.g. bottom + right).
      const distanceEdges: DistanceItem[] = SCROLL_ATTRS.flatMap(
        ([attr, , edgeProp]) => {
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
          return [
            {
              kind: "distance",
              el,
              edgeProp,
              duration,
              delay,
              targetValue: normaliseCSSValue(raw),
              originalValue: cache[cacheKey] as string,
            },
          ];
        }
      );

      if (distanceEdges.length > 0) return distanceEdges;

      // Hide mode — first matching attr wins (only one transform axis allowed).
      const hideMatch = SCROLL_ATTRS.find(([attr]) => el.hasAttribute(attr));
      if (!hideMatch) return [];
      const [, fn, edgeProp, sizeProp, sign] = hideMatch;
      return [
        {
          kind: "hide",
          el,
          duration,
          delay,
          hideTransform: computeHideTransform(el, fn, edgeProp, sizeProp, sign),
        },
      ];
    });
  }

  function showAll(animated = true) {
    currentlyVisible = true;
    hideTimers.forEach(clearTimeout);
    hideTimers.clear();
    for (const item of managed) {
      if (item.kind === "hide") {
        setHideTransform(item.el, "", animated, item.duration);
      } else {
        setDistanceEdge(item, false);
      }
    }
  }

  /** Both hide and distance items are debounced per element via data-delay. */
  function scheduleHide() {
    currentlyVisible = false;
    hideTimers.forEach(clearTimeout);
    hideTimers.clear();
    for (const item of managed) {
      const apply =
        item.kind === "hide"
          ? () => {
              hideTimers.delete(item.el);
              if (!destroyed)
                setHideTransform(
                  item.el,
                  item.hideTransform,
                  true,
                  item.duration
                );
            }
          : () => {
              hideTimers.delete(item.el);
              if (!destroyed) setDistanceEdge(item, true);
            };
      if (item.delay <= 0) {
        apply();
        continue;
      }
      hideTimers.set(item.el, setTimeout(apply, item.delay));
    }
  }

  function onScroll() {
    if (destroyed || ticking || !enable) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (destroyed) return;
      const current = getScrollTop();
      const delta = current - lastScrollTop;
      lastScrollTop = current;
      if (Math.abs(delta) < threshold) return;
      if (delta < 0) {
        // Scrolling up — show elements. If showAtTop and reached the very top, always show.
        if (!currentlyVisible) showAll();
        else if (showAtTop && current <= 0) showAll();
      } else if (delta > 0 && currentlyVisible) {
        scheduleHide();
      }
    });
  }

  function init() {
    if (typeof window === "undefined") return;
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
    lastScrollTop = getScrollTop();
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
        if (item.kind === "hide") {
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
      if (item.kind === "hide") {
        item.el.style[TRANSITION] = "";
        item.el.style[TRANSFORM] = "";
      } else {
        item.el.style[TRANSITION] = "";
        item.el.style[item.edgeProp] = item.originalValue;
        // Clear per-prop cache so re-init after destroy captures fresh values.
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
    enable() {
      enable = true;
    },
    disable() {
      enable = false;
    },
  };
}
