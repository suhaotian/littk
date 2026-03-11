/**
 *
 * Hides/shows elements marked with [data-scroll-hide] based on scroll direction.
 * SSR-safe: all DOM access is deferred to init() / refresh().
 *
 * Element attributes:
 *   data-scroll-hide="header" | "footer" | "left" | "right"
 *     header → slides up    (translateY, uses top + offsetHeight)
 *     footer → slides down  (translateY, uses bottom + offsetHeight)
 *     left   → slides left  (translateX, uses left + offsetWidth)
 *     right  → slides right (translateX, uses right + offsetWidth)
 *     Element must be position: fixed | sticky | absolute.
 *
 *   data-offset="px"
 *     Override the auto-computed hide distance (positive number).
 *
 *   data-duration="300"   transition animation duration in ms. Default: 300.
 *   data-delay="0"        ms to wait after scroll stops before hiding. Default: 0.
 *                         Hiding is debounced — scrolling again resets the timer.
 *                         Showing is always immediate.
 *   data-always-show      never hidden regardless of scroll direction.
 *
 * Usage:
 *   const ctrl = littk()
 *   ctrl.refresh()   // re-scan DOM after lazy-loaded elements mount
 *   ctrl.destroy()   // call on route change / component unmount
 *
 *   littk({ scrollTarget: '#my-div' })
 *   littk({ scrollTarget: containerRef.current })
 */

export interface LittkOptions {
  /** window (default), CSS selector string, or HTMLElement. */
  scrollTarget?: Window | HTMLElement | string;
  /** Minimum px delta before direction change triggers show/hide. Default: 5 */
  threshold?: number;
  /** Force-show all elements when scrolled to the very top. Default: true */
  showAtTop?: boolean;
}

export interface LittkController {
  /** Re-scan DOM and sync new elements to current scroll state. */
  refresh: () => void;
  /** Remove scroll listener and reset all element styles. */
  destroy: () => void;
}

export function littk(options: LittkOptions = {}): LittkController {
  const { scrollTarget, threshold = 5, showAtTop = true } = options;

  type Role = "header" | "footer" | "left" | "right";
  type Item = {
    el: HTMLElement;
    role: Role;
    duration: number;
    delay: number;
    alwaysShow: boolean;
    hideTransform: string;
  };

  // Shared string constants to reduce bundle size.
  const TRANSFORM = "transform";
  const TRANSITION = "transition";
  const NONE = "none";
  const DATA_SCROLL_HIDE = "data-scroll-hide";

  /** role → [cssProp, axis, edgeProp, sizeKey, sign] */
  const ROLE_CONFIG: Record<
    Role,
    [string, string, string, "offsetHeight" | "offsetWidth", 1 | -1]
  > = {
    header: ["translateY", "Y", "top", "offsetHeight", -1],
    footer: ["translateY", "Y", "bottom", "offsetHeight", 1],
    left: ["translateX", "X", "left", "offsetWidth", -1],
    right: ["translateX", "X", "right", "offsetWidth", 1],
  };

  let managed: Item[] = [];
  let eventTarget: Window | HTMLElement | null = null;
  let getScrollTop: () => number = () => 0;
  let lastScrollTop = 0;
  let currentlyVisible = true;
  let ticking = false;
  let destroyed = false;

  const hideTimers = new Map<number, ReturnType<typeof setTimeout>>();

  function setTransform(
    el: HTMLElement,
    value: string,
    animated: boolean,
    duration: number
  ) {
    el.style[TRANSITION] = animated ? `${TRANSFORM} ${duration}ms ease` : NONE;
    el.style[TRANSFORM] = value;
  }

  /**
   * Compute CSS transform to fully slide an element out of the viewport.
   * +2px guards against box-shadow bleed. Falls back to ±110% if the
   * computed edge property is unparseable (e.g. "auto").
   */
  function computeHideTransform(el: HTMLElement, role: Role): string {
    const override = parseFloat(el.getAttribute("data-offset") ?? "");
    const [fn, , edgeProp, sizeKey, sign] = ROLE_CONFIG[role];
    if (!isNaN(override)) return `${fn}(${sign * override}px)`;
    const v = parseFloat(
      getComputedStyle(el)[edgeProp as keyof CSSStyleDeclaration] as string
    );
    const dist = isNaN(v)
      ? "110%"
      : `${Math.abs(sign) * (v + el[sizeKey] + 2)}px`;
    return `${fn}(${sign < 0 ? "-" : ""}${dist})`;
  }

  function scanElements() {
    managed = Array.from(
      document.querySelectorAll<HTMLElement>(`[${DATA_SCROLL_HIDE}]`)
    ).flatMap((el) => {
      const role = el.getAttribute(DATA_SCROLL_HIDE) as Role;
      if (!(role in ROLE_CONFIG)) return [];
      return [
        {
          el,
          role,
          duration: parseInt(el.getAttribute("data-duration") ?? "300", 10),
          delay: parseInt(el.getAttribute("data-delay") ?? "0", 10),
          alwaysShow: el.hasAttribute("data-always-show"),
          hideTransform: computeHideTransform(el, role),
        },
      ];
    });
  }

  function showAll(animated = true) {
    currentlyVisible = true;
    hideTimers.forEach(clearTimeout);
    hideTimers.clear();
    for (const item of managed) {
      if (!item.alwaysShow) setTransform(item.el, "", animated, item.duration);
    }
  }

  /** Hiding is debounced per element — scrolling again cancels pending timers. */
  function scheduleHide() {
    currentlyVisible = false;
    hideTimers.forEach(clearTimeout);
    hideTimers.clear();
    managed.forEach((item, i) => {
      if (item.alwaysShow) return;
      const apply = () => {
        hideTimers.delete(i);
        if (!destroyed)
          setTransform(item.el, item.hideTransform, true, item.duration);
      };
      if (item.delay <= 0) {
        apply();
        return;
      }
      hideTimers.set(i, setTimeout(apply, item.delay));
    });
  }

  function onScroll() {
    if (destroyed || ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      if (destroyed) return;
      const current = getScrollTop();
      const delta = current - lastScrollTop;
      lastScrollTop = current;
      if (showAtTop && current <= 0) {
        if (!currentlyVisible) showAll();
        return;
      }
      if (Math.abs(delta) < threshold) return;
      if (delta < 0 && !currentlyVisible) showAll();
      else if (delta > 0 && currentlyVisible) scheduleHide();
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
        if (!item.alwaysShow)
          setTransform(item.el, item.hideTransform, false, 0);
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
      item.el.style[TRANSITION] = "";
      item.el.style[TRANSFORM] = "";
    }
    managed = [];
    eventTarget = null;
  }

  init();
  return { refresh, destroy };
}
