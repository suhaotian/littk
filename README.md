# littk

Like `Headroom` — hides and shows fixed elements on scroll — works on multiple element, in any direction, with no classes, no config files, and no framework adapters.

Just add a `data-scroll-hide` attribute and call `littk()`!

## Online Demos

https://suhaotian.github.io/littk

## Attributes

Add `data-scroll-hide` to any `position: fixed | sticky | absolute` element.

| Attribute          | Values                           | Default                  |
| ------------------ | -------------------------------- | ------------------------ |
| `data-scroll-hide` | `header` `footer` `left` `right` | —                        |
| `data-offset`      | px                               | auto from computed style |
| `data-duration`    | ms                               | `300`                    |
| `data-delay`       | ms                               | `0`                      |
| `data-always-show` | flag                             | —                        |

`data-offset` overrides the auto-computed slide distance. Use it when `getComputedStyle().top/bottom/left/right` is unreliable — e.g. `inset` shorthand or elements with a pre-existing `transform`.

## Options

```ts
littk({
  scrollTarget: "#my-div", // window (default), HTMLElement, or selector
  threshold: 5, // min px delta before triggering
  showAtTop: true, // force-show when scroll position is 0
});
```

## HTML

```html
<header data-scroll-hide="header" style="position: fixed; top: 0; width: 100%;">
  ...
</header>

<nav data-scroll-hide="left" style="position: fixed; left: 0;">...</nav>

<footer
  data-scroll-hide="footer"
  style="position: fixed; bottom: 0; width: 100%;">
  ...
</footer>

<script type="module">
  import { littk } from "littk";
  littk();
</script>
```

## React

```tsx
import { useEffect } from "react";
import { littk, LittkOptions } from "littk";

function useLittk(options?: LittkOptions) {
  useEffect(() => {
    const ctrl = littk(options);
    return () => ctrl.destroy();
  }, []);
}
```

```tsx
export default function App() {
  useLittk();

  return (
    <>
      <header
        data-scroll-hide="header"
        style={{ position: "fixed", top: 0, width: "100%" }}>
        ...
      </header>
      <main>...</main>
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
    const ctrl = littk({ scrollTarget: containerRef.current });
    return () => ctrl.destroy();
  }, []);

  return (
    <div ref={containerRef} style={{ height: "100vh", overflowY: "auto" }}>
      <header data-scroll-hide="header" style={{ position: "sticky", top: 0 }}>
        ...
      </header>
    </div>
  );
}
```

## Vue

```vue
<script setup>
import { onMounted, onUnmounted } from "vue";
import { littk } from "littk";

const ctrl = littk();
onUnmounted(() => ctrl.destroy());
</script>

<template>
  <header
    data-scroll-hide="header"
    style="position: fixed; top: 0; width: 100%;">
    ...
  </header>
  <main>...</main>
</template>
```

For a scrollable container:

```vue
<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { littk } from "littk";

const containerRef = ref(null);
let ctrl;

onMounted(() => {
  ctrl = littk({ scrollTarget: containerRef.value });
});
onUnmounted(() => ctrl?.destroy());
</script>

<template>
  <div ref="containerRef" style="height: 100vh; overflow-y: auto;">
    <header data-scroll-hide="header" style="position: sticky; top: 0;">
      ...
    </header>
  </div>
</template>
```

Call `ctrl.refresh()` after conditionally rendered elements mount — e.g. in a `watch` or after an async operation.

## Projects You May Also Be Interested In

- [xior](https://github.com/suhaotian/xior) - A tiny but powerful fetch wrapper with plugins support and axios-like API
- [tsdk](https://github.com/tsdk-monorepo/tsdk) - Type-safe API development CLI tool for TypeScript projects
- [broad-infinite-list](https://github.com/suhaotian/broad-infinite-list) - ⚡ High performance and Bidirectional infinite scrolling list component for React and Vue3

## Reporting Issues

Found an issue? Please feel free to [create issue](https://github.com/suhaotian/littk/issues/new)

## Support

If you find this project helpful, consider [buying me a coffee](https://github.com/suhaotian/littk/stargazers).
