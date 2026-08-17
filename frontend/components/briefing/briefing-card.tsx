'use client';

import * as React from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BlurFade } from '@/components/ui/blur-fade';
import { RedactedReveal } from '@/components/candy/redacted-reveal';
import {
  RevealOrdinalProvider,
  useRevealSlot,
  type RevealSlot,
} from '@/components/briefing/reveal-ordinal';

/**
 * The slice of react-markdown's `node` prop this file reads.
 *
 * Declared structurally rather than `import type { Element } from 'hast'`. `hast` is a *transitive*
 * dependency of react-markdown, not one of ours, and pnpm's strict `node_modules` makes importing
 * it a phantom import — it resolves today only because react-markdown hoists it, and would break
 * the moment react-markdown changed its own dependency layout (`CLAUDE.md` records `three-stdlib`
 * as exactly that failure). hast's real `Element` is assignable to this, so the renderers below
 * hand their `node` straight through with no cast and no `any`.
 */
interface PositionedNode {
  position?: {
    start: { offset?: number | undefined };
    end: { offset?: number | undefined };
  };
}

/**
 * Whether the stream is still writing, and where the source currently ends.
 *
 * **This is a context and not a closure, and that distinction is the difference between a working
 * reveal and a strobing page.** react-markdown takes `components` as a map of component *types*.
 * If those were arrow functions built inside `BriefingCard`, every one of them would be a new
 * function identity on every paint — and since `sourceEnd` changes on *every* 80 ms flush, that is
 * ~12 remounts a second of the entire markdown subtree. React remounts on a changed element type,
 * so every bar on the page would restart from full-width red, twelve times a second, which is the
 * exact artefact spec rule 3 exists to prevent (and rule 3 alone would not have saved it).
 *
 * So the renderers are module constants with permanently stable identities, and the two values
 * they need per-render arrive through context instead. Reading them from context is also what
 * satisfies "the renderers must see the *current* `loading`": a module constant closing over a
 * captured `loading` would see the value from the render that created it, forever.
 */
interface StreamState {
  loading: boolean;
  /** `briefing.trimEnd().length` — see `useBlockReveal`. */
  sourceEnd: number;
}

const StreamContext = React.createContext<StreamState>({ loading: false, sourceEnd: 0 });

interface BlockReveal extends RevealSlot {
  /** True when the block must render with no bar at all. */
  bare: boolean;
}

/**
 * The three numbers every block renderer needs, in one place.
 *
 * **Final-block detection is by source offset, not by counting.** The final block is the one whose
 * `end.offset` reaches the end of the trimmed source. The obvious alternatives are both wrong
 * here: comparing an index to a block *total* would require parsing the markdown a second time on
 * every flush (quadratic in the delta count, which is the cost the 80 ms flush interval exists to
 * avoid), and a "last renderer to run wins" ref assumes the renderers execute in one synchronous
 * pass whose end is observable, which React does not promise.
 *
 * `trimEnd()` rather than raw `length` because a stream almost always has a trailing newline or
 * space that no block's `end.offset` covers; `>=` rather than `===` for the same reason, from the
 * other side — remark can end a block *past* the trimmed length when the source ends mid-list.
 */
function useBlockReveal(node: PositionedNode | undefined): BlockReveal {
  const { loading, sourceEnd } = React.useContext(StreamContext);
  const { ordinal, delaySeconds } = useRevealSlot(node?.position?.start.offset);

  const end = node?.position?.end.offset;
  const isFinal = end !== undefined && end >= sourceEnd;

  // Spec rule 3: while loading, the final block is *still being written*. A bar over it would
  // re-wipe on every flush. Once loading is false the briefing is complete and the final block
  // reveals like any other.
  return { ordinal, delaySeconds, bare: loading && isFinal };
}

interface RevealBlockProps {
  node: PositionedNode | undefined;
  className: string;
  children: React.ReactNode;
}

/**
 * A heading or paragraph: the semantic element itself is the reveal wrapper.
 *
 * `data-reveal-ordinal` / `data-reveal-delay` are here because jsdom cannot observe a motion
 * `delay` — it is an animation option, not an attribute — and the throttle is otherwise untestable.
 * `briefing-loader.tsx` carries `data-state` on its stage rows for the same reason. They stay on
 * the wrapper rather than on the bar so that a block rendered *bare* (rule 3) still reports its
 * slot, which is what lets a test prove the ordinal survived the block growing.
 *
 * Note the `<span>` around `{children}`: `RedactedReveal` gives every top-level child its own line
 * and its own bar, and a markdown paragraph's `children` is an *array* — `Sainz took **P4** after a
 * late stop` passed bare would produce three bars. One child, one bar.
 */
function RevealBlock({
  tag: Tag,
  node,
  className,
  children,
}: RevealBlockProps & { tag: 'h1' | 'h2' | 'h3' | 'p' }) {
  const { ordinal, delaySeconds, bare } = useBlockReveal(node);

  return (
    <Tag className={className} data-reveal-ordinal={ordinal} data-reveal-delay={delaySeconds}>
      {bare ? (
        children
      ) : (
        <RedactedReveal variant="accent" trigger="immediate" delay={delaySeconds}>
          <span>{children}</span>
        </RedactedReveal>
      )}
    </Tag>
  );
}

/**
 * A list: the same treatment, one indirection deeper.
 *
 * `<ul>` may only contain `<li>`, so the `<span>` trick above is invalid markup here and the reveal
 * has to sit *outside* the list instead. `RedactedReveal` renders no wrapper of its own and takes
 * no data attributes, so the slot values need an element to live on that also *contains* the bar —
 * hence the plain outer `<div>`. Keeping that div present in both branches means toggling a list
 * from bare to revealed changes only its inner content, never its own identity, so React never
 * remounts the `<li>`s underneath.
 */
function RevealListBlock({
  tag: Tag,
  node,
  className,
  children,
}: RevealBlockProps & { tag: 'ul' | 'ol' }) {
  const { ordinal, delaySeconds, bare } = useBlockReveal(node);
  const list = <Tag className={className}>{children}</Tag>;

  return (
    <div data-reveal-ordinal={ordinal} data-reveal-delay={delaySeconds}>
      {bare ? (
        list
      ) : (
        <RedactedReveal as="div" variant="accent" trigger="immediate" delay={delaySeconds}>
          {list}
        </RedactedReveal>
      )}
    </div>
  );
}

/**
 * Module scope on purpose — see `StreamState` above. Every class string is the one this component
 * already shipped: this phase restyles the *reveal*, not the prose typography, and `h2`'s
 * `text-f1-red` is legal only because `text-2xl` is 24px, which is the size at which red clears
 * WCAG's large-text bar.
 *
 * `strong` and `em` are inline and get no reveal — the spec names `h1`–`h3`, `p`, `ul`, `ol`, and
 * a bar per emphasised word is the multi-bar bug, not a feature.
 */
const MARKDOWN_COMPONENTS: Components = {
  h1: ({ node, children }) => (
    <RevealBlock tag="h1" node={node} className="mb-4 mt-6 text-3xl font-bold text-ink">
      {children}
    </RevealBlock>
  ),
  h2: ({ node, children }) => (
    <RevealBlock tag="h2" node={node} className="mb-3 mt-6 text-2xl font-bold text-f1-red">
      {children}
    </RevealBlock>
  ),
  h3: ({ node, children }) => (
    <RevealBlock tag="h3" node={node} className="mb-2 mt-4 text-xl font-semibold text-ink">
      {children}
    </RevealBlock>
  ),
  p: ({ node, children }) => (
    <RevealBlock tag="p" node={node} className="mb-4 leading-relaxed text-zinc-300">
      {children}
    </RevealBlock>
  ),
  ul: ({ node, children }) => (
    <RevealListBlock
      tag="ul"
      node={node}
      className="mb-4 list-inside list-disc space-y-1 text-zinc-300"
    >
      {children}
    </RevealListBlock>
  ),
  ol: ({ node, children }) => (
    <RevealListBlock
      tag="ol"
      node={node}
      className="mb-4 list-inside list-decimal space-y-1 text-zinc-300"
    >
      {children}
    </RevealListBlock>
  ),
  strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
  em: ({ children }) => <em className="italic text-zinc-400">{children}</em>,
};

interface BriefingCardProps {
  race: string;
  briefing: string;
  /** Whether synthesis stopped partway, leaving the prose unfinished. */
  truncated?: boolean;
  /**
   * Whether the stream is still writing. Drives spec rule 3 — the final block renders bare,
   * because a bar over a paragraph that grows every 80 ms re-wipes twelve times a second.
   *
   * Optional and defaulting to `false` so an existing caller — and the completed-briefing render
   * on `/briefing` — gets the every-block-reveals behaviour with no wiring at all.
   */
  loading?: boolean;
}

export function BriefingCard({ race, briefing, truncated, loading = false }: BriefingCardProps) {
  // Recomputed per paint, which is one `trimEnd()` over the accumulated string every 80 ms —
  // linear, and nothing next to the markdown parse it sits beside.
  const sourceEnd = briefing.trimEnd().length;
  const streamState = React.useMemo<StreamState>(
    () => ({ loading, sourceEnd }),
    [loading, sourceEnd],
  );

  return (
    <BlurFade delay={0.1} inView>
      <Card className="border-zinc-800 bg-zinc-900 shadow-xl">
        <CardHeader className="border-b border-zinc-800">
          <CardTitle className="text-2xl font-bold text-ink">
            {/*
              `variant="ink"` rather than the default accent: the prose below is a wall of red
              bars, and the card's own title competing with them makes the header read as one more
              streaming block. The 🏁 that used to sit here is gone — Phase 6 removes the emoji
              from the empty state and the trace too, and one survivor reads as an oversight. The
              race name itself is unchanged, and `RedactedReveal` keeps its child in the DOM from
              first render, so the accessible name is exactly what it was.
            */}
            <RedactedReveal variant="ink" trigger="immediate">
              <span>{race}</span>
            </RedactedReveal>
          </CardTitle>
          {/* zinc-500 → zinc-400. The branch rule is absolute — no resting `text-zinc-500` or
              dimmer on a run carrying real text — and zinc-500 on this card's `bg-zinc-900`
              measures 3.66:1 against the 4.5:1 bar. zinc-400 is 6.91:1. */}
          <p className="text-sm text-zinc-400">Race Weekend Briefing</p>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="prose prose-invert prose-zinc max-w-none">
            <StreamContext.Provider value={streamState}>
              <RevealOrdinalProvider source={briefing}>
                <ReactMarkdown components={MARKDOWN_COMPONENTS}>{briefing}</ReactMarkdown>
              </RevealOrdinalProvider>
            </StreamContext.Provider>
          </div>

          {/*
            Deliberately calm, and deliberately *after* the prose: the briefing
            above is worth reading, and an alarm at the top would say otherwise.
            The alternative — an `error` event in the red banner — was rejected
            in ADR-0002.
          */}
          {truncated && (
            <p className="mt-6 border-t border-zinc-800 pt-4 text-sm italic text-zinc-400">
              This briefing stopped early — the rest could not be generated.
            </p>
          )}
        </CardContent>
      </Card>
    </BlurFade>
  );
}
