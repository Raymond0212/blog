import type { HTMLAttributes } from "react";

type SiteBrandProps = HTMLAttributes<HTMLAnchorElement> & {
  showCaption?: boolean;
};

export function SiteBrand({
  className,
  showCaption = false,
  ...props
}: SiteBrandProps) {
  const websiteLink = import.meta.env.VITE_WEBSITE_LINK ?? "#";

  return (
    <a
      href={websiteLink}
      className={`swiss-brand${className ? ` ${className}` : ""}`}
      {...props}
    >
      <img
        className="swiss-brand-logo"
        src={`${import.meta.env.BASE_URL}panic_sad.svg`}
        alt=""
      />
      <span className="swiss-brand-copy">
        <span className="swiss-brand-name">
          RuaMond<span className="swiss-accent">.</span>
        </span>
        {showCaption ? (
          <span className="swiss-brand-caption">It's okay not to be okay</span>
        ) : null}
      </span>
    </a>
  );
}
