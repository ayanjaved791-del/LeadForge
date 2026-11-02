import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export function PageHeader({ title, description, crumbs = [], actions }: { title: string; description?: string; crumbs?: { label: string; to?: string }[]; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-gray-800 dark:text-white/90">{title}</h2>
        {description && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{description}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {actions}
        {!actions && (
          <nav>
            <ol className="flex items-center gap-1.5 rounded-full border border-gray-200/80 bg-white px-3.5 py-1.5 text-theme-sm shadow-theme-xs dark:border-gray-800 dark:bg-white/[0.03]">
              <li>
                <Link to="/" className="inline-flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  Home
                </Link>
              </li>
              {[...crumbs, { label: title }].map((c, i) => (
                <li key={i} className="inline-flex items-center gap-1.5">
                  <ChevronRight className="size-3.5 text-gray-400" />
                  {c.to ? (
                    <Link to={c.to} className="text-gray-500 dark:text-gray-400">{c.label}</Link>
                  ) : (
                    <span className="font-medium text-brand-500 dark:text-brand-400">{c.label}</span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
      </div>
    </div>
  );
}

export function Card({ title, description, actions, children, className = "", bodyClassName = "p-5 sm:p-6" }: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`lf-card ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div>
            {title && <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h3>}
            {description && <p className="mt-0.5 text-theme-sm text-gray-500 dark:text-gray-400">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
