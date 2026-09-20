import { useEffect, useState } from 'react';

export type FeatureView = 'grid' | 'list';

const StorageKey = 'sprintdeck.view';

function storedView(): FeatureView {
  try {
    return localStorage.getItem(StorageKey) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/** The layout choice, remembered so it holds across the landing page and the dashboard. */
export function useFeatureView(): [FeatureView, (view: FeatureView) => void] {
  const [view, setView] = useState<FeatureView>(storedView);

  useEffect(() => {
    try {
      localStorage.setItem(StorageKey, view);
    } catch {
      void 0;
    }
  }, [view]);

  return [view, setView];
}

interface Props {
  view: FeatureView;
  onChange: (view: FeatureView) => void;
}

export default function ViewToggle({ view, onChange }: Props) {
  return (
    <div className="view-toggle" role="tablist" aria-label="Layout">
      <button
        type="button"
        role="tab"
        aria-selected={view === 'grid'}
        aria-label="Card layout"
        title="Cards"
        className={view === 'grid' ? 'active' : ''}
        onClick={() => onChange('grid')}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
          <rect x="2" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="11" y="2" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="2" y="11" width="7" height="7" rx="1.5" fill="currentColor" />
          <rect x="11" y="11" width="7" height="7" rx="1.5" fill="currentColor" />
        </svg>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={view === 'list'}
        aria-label="List layout"
        title="List"
        className={view === 'list' ? 'active' : ''}
        onClick={() => onChange('list')}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden focusable="false">
          <circle cx="3.5" cy="4.5" r="1.5" fill="currentColor" />
          <circle cx="3.5" cy="10" r="1.5" fill="currentColor" />
          <circle cx="3.5" cy="15.5" r="1.5" fill="currentColor" />
          <rect x="7" y="3.5" width="11" height="2" rx="1" fill="currentColor" />
          <rect x="7" y="9" width="11" height="2" rx="1" fill="currentColor" />
          <rect x="7" y="14.5" width="11" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>
    </div>
  );
}
