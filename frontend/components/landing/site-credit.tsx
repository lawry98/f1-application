import { AUTHOR_NAME, REPO_URL } from '@/lib/site';

export interface SiteCreditProps {
  className?: string;
  /**
   * The repo link's whole treatment, including its focus ring. The caller passes it because only
   * the caller knows what is behind the link: the landing footer's warm card wants an offset ring
   * painted `base-warm`, /credits' bare `zinc-950` a flush one.
   */
  linkClassName: string;
}

/** "Built by Lawrence Crasto · Source on GitHub", on the landing footer and on /credits. */
export function SiteCredit({ className, linkClassName }: SiteCreditProps) {
  return (
    <p className={className}>
      Built by {AUTHOR_NAME} &middot;{' '}
      <a href={REPO_URL} target="_blank" rel="noopener noreferrer" className={linkClassName}>
        Source on GitHub
      </a>
    </p>
  );
}
