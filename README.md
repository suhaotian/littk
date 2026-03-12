# littkk

Hide and show elements on scroll — works on multiple elements, in any direction, with no classes, no config files, and no framework adapters.

Just add a `data-scroll-top` (or `bottom` / `left` / `right`) attribute and call `littkk()`!

## Online Demos

https://suhaotian.github.io/littkk

## Attributes

There are two modes, determined by whether the attribute has a value.

### Hide mode — no value

Slides the element out of the viewport on scroll down, back in on scroll up. Element must be `position: fixed | sticky | absolute`.

```html
<header data-scroll-top></header>
<footer data-scroll-bottom></footer>
<nav data-scroll-left></nav>
<aside data-scroll-right></aside>
```

| Direction | Attribute            | Behavior                     |
| --------- | -------------------- | ---------------------------- |
| Up        | `data-scroll-top`    | slides up out of viewport    |
| Down      | `data-scroll-bottom` | slides down out of viewport  |
| Left      | `data-scroll-left`   | slides left out of viewport  |
| Right     | `data-scroll-right`  | slides right out of viewport |

### Distance mode — CSS value

The element is never hidden. Instead its CSS edge property (`top` / `bottom` / `left` / `right`) transitions to the given value on scroll down, and reverts on scroll up.

Bare numbers are treated as `px`. Any CSS unit is accepted.

```html
<!-- top → 0px when scrolled down, reverts when scrolled up -->
<div data-scroll-top="0"></div>

<!-- top → 1rem -->
<div data-scroll-top="1rem"></div>

<!-- multiple axes on the same element -->
<div data-scroll-bottom="0" data-scroll-right="0"></div>
```

### Shared attributes

| Attribute       | Values | Default                  | Applies to     |
| --------------- | ------ | ------------------------ | -------------- |
| `data-duration` | ms     | `300`                    | both modes     |
| `data-delay`    | ms     | `0`                      | both modes     |
| `data-offset`   | px     | auto from computed style | hide mode only |

`data-delay` — ms to wait after scroll stops before executing. Scrolling again resets the timer. Showing is always immediate.

`data-offset` — overrides the auto-computed slide distance. Useful when `getComputedStyle().top/bottom/left/right` is unreliable, e.g. with `inset` shorthand or a pre-existing `transform`.

## Options

```ts
littkk({
  scrollTarget: "#my-div", // window (default), HTMLElement, or CSS selector
  threshold: 5, // min px delta before triggering. Default: 5
  showAtTop: true, // force-show all elements when scroll position reaches 0. Default: true
});
```

### Return

```ts
export interface LittkkController {
  /** Re-scan DOM and sync new elements to current scroll state. */
  refresh: () => void;
  /** disable */
  disable: () => void;
  /** enable */
  enable: () => void;
  /** Remove scroll listener and reset all element styles. */
  destroy: () => void;
}
```

## HTML

```html
<header data-scroll-top style="position: fixed; top: 0; width: 100%;">
  ...
</header>

<nav data-scroll-left style="position: fixed; left: 0;">...</nav>

<footer data-scroll-bottom style="position: fixed; bottom: 0; width: 100%;">
  ...
</footer>

<script type="module">
  import { littkk } from "littkk";
  littkk();
</script>
```

## React

```tsx
import { useEffect } from "react";
import { littkk, LittkkOptions } from "littkk";

function useLittkk(options?: LittkkOptions) {
  useEffect(() => {
    const ctrl = littkk(options);
    return () => ctrl.destroy();
  }, []);
}
```

```tsx
export default function App() {
  useLittkk();

  return (
    <>
      <header
        data-scroll-top
        style={{ position: "fixed", top: 0, width: "100%" }}>
        ...
      </header>

      {/* Shifts top to 0 when header hides, reverts when header shows */}
      <main data-scroll-top="0" style={{ position: "fixed", top: 64 }}>
        ...
      </main>
    </>
  );
}
```

For a scrollable container, pass the ref as `scrollTarget`. Call `ctrl.refresh()` after conditionally rendered elements mount.

```tsx
export default function Feed() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const ctrl = littkk({ scrollTarget: containerRef.current });
    return () => ctrl.destroy();
  }, []);

  return (
    <div ref={containerRef} style={{ height: "100vh", overflowY: "auto" }}>
      <header data-scroll-top style={{ position: "sticky", top: 0 }}>
        ...
      </header>
    </div>
  );
}
```

## Vue

```vue
<script setup>
import { onUnmounted } from "vue";
import { littkk } from "littkk";

const ctrl = littkk();
onUnmounted(() => ctrl.destroy());
</script>

<template>
  <header data-scroll-top style="position: fixed; top: 0; width: 100%;">
    ...
  </header>
  <main>...</main>
</template>
```

For a scrollable container:

```vue
<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { littkk } from "littkk";

const containerRef = ref(null);
let ctrl;

onMounted(() => {
  ctrl = littkk({ scrollTarget: containerRef.value });
});
onUnmounted(() => ctrl?.destroy());
</script>

<template>
  <div ref="containerRef" style="height: 100vh; overflow-y: auto;">
    <header data-scroll-top style="position: sticky; top: 0;">...</header>
  </div>
</template>
```

Call `ctrl.refresh()` after conditionally rendered elements mount — e.g. in a `watch` or after an async operation.

## Projects You May Also Be Interested In

- [xior](https://github.com/suhaotian/xior) - A tiny but powerful fetch wrapper with plugins support and axios-like API
- [tsdk](https://github.com/tsdk-monorepo/tsdk) - Type-safe API development CLI tool for TypeScript projects
- [broad-infinite-list](https://github.com/suhaotian/broad-infinite-list) - ⚡ High performance and Bidirectional infinite scrolling list component for React and Vue3

## Reporting Issues

Found an issue? Please feel free to [create issue](https://github.com/suhaotian/littkk/issues/new)

## Support

If you find this project helpful, consider [buying me a coffee](https://github.com/suhaotian/littkk/stargazers).
