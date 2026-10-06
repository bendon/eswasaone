import { useEffect, type RefObject } from "react";
import { useLocation } from "react-router-dom";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

/*
 * Site-wide scroll animations, driven by selectors so pages need no wiring.
 * Every animation replays each time its element scrolls back into view:
 * it resets when the element leaves the viewport (either direction) and
 * restarts on the next enter. New content (filters, async lists) is picked
 * up by a MutationObserver.
 */

/** Numbers that count up from zero. Prefix/suffix and thousands separators are kept. */
const COUNT = ".hstat b, .eg-stat b, .aireport__rows b";
/** Single blocks that rise into place. */
const RISE = [
  ".featured__head",
  ".paths__head",
  ".upcoming__head",
  ".process__head",
  ".eg-head",
  ".sec-head",
  ".helpband__copy",
  ".eg-split__copy",
  ".verify-widget",
  ".gcount",
  ".gpills",
].join(",");
/** Containers whose direct children cascade in one after another. */
const CASCADE = [
  ".helpband__rows",
  ".aipipe",
  ".aisteps",
  ".aiduo",
  ".process__steps",
  ".eg-tiles",
  ".eg-photos",
  ".eg-stats__grid",
  ".actiongrid",
  ".updates__grid",
  ".page-hero__stats",
  ".aitech-trust",
  ".eg-hero__trust",
].join(",");
/** List items revealed in batches as they arrive (long, often filtered lists). */
const BATCH = ".gcard, .std, .cert, .course, .session, .upd, .svc, .ncard";
/** Images that wipe open while settling from a slight zoom. */
const WIPE = ".eg-split__img, .eg-photo__img";
/** Hero headings split into words. */
const HEADLINE = ".page-hero h1, .eg-hero h1";
/** Hero copy that drifts up and fades as the hero scrolls away (scrubbed). */
const HERO_EXIT = ".page-hero__inner, .eg-hero__in";

const EASE = "power3.out";

type Bind = (el: HTMLElement) => void;

/** Paused timeline at its hidden state + a trigger that replays it on every enter. */
function replayOnView(el: Element, tl: gsap.core.Timeline, start = "top 88%") {
  tl.pause(0);
  const st = ScrollTrigger.create({
    trigger: el,
    start,
    end: "bottom top",
    onEnter: () => tl.restart(),
    onEnterBack: () => tl.restart(),
    onLeave: () => tl.pause(0),
    onLeaveBack: () => tl.pause(0),
  });
  // Already scrolled past on load (e.g. restored scroll) — show it rather than hide it.
  if (st.progress === 1) tl.progress(1);
  else if (st.isActive) tl.restart();
}

function parseCount(text: string) {
  const m = text.match(/^(\D*?)(\d[\d,]*(?:\.\d+)?)(.*)$/s);
  if (!m) return null;
  const [, prefix, num, suffix] = m;
  const decimals = num.includes(".") ? num.split(".")[1].length : 0;
  return { prefix, suffix, value: parseFloat(num.replace(/,/g, "")), decimals, commas: num.includes(",") };
}

const bindCount: Bind = (el) => {
  const final = el.dataset.fxFinal ?? el.textContent ?? "";
  el.dataset.fxFinal = final;
  const p = parseCount(final);
  if (!p) return;
  const fmt = (n: number) =>
    p.prefix +
    (p.commas
      ? n.toLocaleString("en-US", { minimumFractionDigits: p.decimals, maximumFractionDigits: p.decimals })
      : n.toFixed(p.decimals)) +
    p.suffix;
  const state = { n: 0 };
  const tl = gsap.timeline({
    onComplete: () => {
      el.textContent = final;
    },
  });
  tl.fromTo(
    state,
    { n: 0 },
    {
      n: p.value,
      duration: Math.min(2.2, 0.9 + Math.log10(p.value + 1) * 0.35),
      ease: "power2.out",
      onUpdate: () => {
        el.textContent = fmt(state.n);
      },
    },
  );
  replayOnView(el, tl, "top 92%");
};

const bindRise: Bind = (el) => {
  const tl = gsap.timeline();
  tl.fromTo(el, { autoAlpha: 0, y: 36 }, { autoAlpha: 1, y: 0, duration: 0.8, ease: EASE, clearProps: "transform" });
  replayOnView(el, tl);
};

const bindCascade: Bind = (el) => {
  const kids = Array.from(el.children);
  if (!kids.length) return;
  const tl = gsap.timeline();
  tl.fromTo(
    kids,
    { autoAlpha: 0, y: 28, scale: 0.97 },
    { autoAlpha: 1, y: 0, scale: 1, duration: 0.7, ease: EASE, stagger: 0.09, clearProps: "transform" },
  );
  replayOnView(el, tl);
};

const bindBatchItem: Bind = (el) => {
  const tl = gsap.timeline();
  // Small delay by column (staggered grids) or sibling order so a row ripples rather than pops.
  const col = el.closest(".ggrid__col");
  const idx = col?.parentElement
    ? Array.from(col.parentElement.children).indexOf(col)
    : el.parentElement
      ? Array.from(el.parentElement.children).indexOf(el)
      : 0;
  tl.fromTo(
    el,
    { autoAlpha: 0, y: 44 },
    { autoAlpha: 1, y: 0, duration: 0.75, ease: EASE, delay: (idx % 3) * 0.08, clearProps: "transform" },
  );
  replayOnView(el, tl, "top 94%");
};

const bindWipe: Bind = (el) => {
  const img = el.querySelector("img");
  const tl = gsap.timeline();
  tl.fromTo(el, { clipPath: "inset(0 0 100% 0)" }, { clipPath: "inset(0 0 0% 0)", duration: 1.1, ease: "power4.inOut" });
  if (img) tl.fromTo(img, { scale: 1.18 }, { scale: 1, duration: 1.4, ease: EASE }, 0);
  replayOnView(el, tl);
};

const bindHeadline: Bind = (el) => {
  const split = SplitText.create(el, { type: "words", mask: "words" });
  const tl = gsap.timeline();
  tl.fromTo(split.words, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: "power4.out", stagger: 0.06 });
  replayOnView(el, tl, "top 95%");
};

const bindHeroExit: Bind = (el) => {
  const hero = el.parentElement;
  if (!hero) return;
  gsap.to(el, {
    y: -60,
    autoAlpha: 0.25,
    ease: "none",
    scrollTrigger: { trigger: hero, start: "top top", end: "bottom top", scrub: true },
  });
};

/** AI page sample report: meters fill (CSS transition) each time the panel enters. */
const bindMeters: Bind = (el) => {
  const on = () => el.classList.add("is-filled");
  const off = () => el.classList.remove("is-filled");
  const st = ScrollTrigger.create({
    trigger: el,
    start: "top 90%",
    end: "bottom top",
    onEnter: on,
    onEnterBack: on,
    onLeave: off,
    onLeaveBack: off,
  });
  if (st.isActive || st.progress === 1) on();
};

const BINDINGS: [string, Bind][] = [
  [HEADLINE, bindHeadline],
  [HERO_EXIT, bindHeroExit],
  [COUNT, bindCount],
  [RISE, bindRise],
  [CASCADE, bindCascade],
  [BATCH, bindBatchItem],
  [WIPE, bindWipe],
  [".aireport", bindMeters],
];

/** Mounts once in the layout; rebinds on every route change. */
export function ScrollFx({ root }: { root: RefObject<HTMLElement | null> }) {
  const { pathname } = useLocation();

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;
    const mm = gsap.matchMedia();

    mm.add(
      { motion: "(prefers-reduced-motion: no-preference)", reduce: "(prefers-reduced-motion: reduce)" },
      (ctx) => {
        if (ctx.conditions?.reduce) {
          // No motion: just make sure meter panels show their final state.
          scope.querySelectorAll(".aireport").forEach((el) => el.classList.add("is-filled"));
          return;
        }

        const bound = new WeakSet<Element>();
        // Reordered lists (sorting) move bound elements without adding new ones,
        // so trigger positions must be re-measured on any element move too.
        const scan = (moved = false) => {
          let added = false;
          for (const [sel, bind] of BINDINGS) {
            scope.querySelectorAll<HTMLElement>(sel).forEach((el) => {
              if (bound.has(el)) return;
              bound.add(el);
              ctx.add(() => bind(el));
              added = true;
            });
          }
          // Drop triggers whose elements React has removed.
          ScrollTrigger.getAll().forEach((st) => {
            const t = st.trigger;
            if (t && !t.isConnected) st.kill();
          });
          if (added || moved) ScrollTrigger.refresh();
        };

        scan();

        let timer = 0;
        const mo = new MutationObserver((records) => {
          // Ignore text-only updates (count-up numbers) so they don't force refreshes.
          const elementsChanged = records.some((r) =>
            [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === Node.ELEMENT_NODE),
          );
          if (!elementsChanged) return;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => scan(true), 120);
        });
        mo.observe(scope, { childList: true, subtree: true });

        // Late layout shifts (fonts, images) move trigger positions.
        const onLoad = () => ScrollTrigger.refresh();
        window.addEventListener("load", onLoad);
        document.fonts?.ready.then(onLoad).catch(() => undefined);

        return () => {
          mo.disconnect();
          window.clearTimeout(timer);
          window.removeEventListener("load", onLoad);
        };
      },
      scope,
    );

    return () => mm.revert();
  }, [root, pathname]);

  return null;
}

/** Thin bar under the header that fills as the page is scrolled. */
export function ScrollProgress() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        ".scroll-progress",
        { scaleX: 0 },
        {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: document.documentElement, start: "top top", end: "bottom bottom", scrub: 0.3 },
        },
      );
    });
    return () => mm.revert();
  }, []);
  return <div className="scroll-progress" aria-hidden="true" />;
}
