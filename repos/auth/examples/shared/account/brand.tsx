const ink = new URL("../../../.github/assets/lockup-auth-ink.svg", import.meta.url).href;
const paper = new URL("../../../.github/assets/lockup-auth-paper.svg", import.meta.url).href;

export function Brand({ href }: { readonly href: string }) {
  return (
    <a className="wordmark" href={href}>
      <picture>
        <source media="(prefers-color-scheme: dark)" srcSet={paper} />
        <img src={ink} alt="Yielded Auth" width="178" height="28" />
      </picture>
    </a>
  );
}
