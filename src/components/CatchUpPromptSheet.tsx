import { useEffect } from 'react';
import { useCueStore, useModalBackHandler } from '../store/useCueStore';

/** Bottom sheet prompting to catch up skipped prior atoms when marking a non-adjacent atom finished. */
export function CatchUpPromptSheet() {
  const {
    catchUpPrompt,
    confirmCatchUpPrompt,
    neverAskCatchUpPrompt,
    dismissCatchUpPrompt,
  } = useCueStore();

  useModalBackHandler(Boolean(catchUpPrompt), dismissCatchUpPrompt);

  useEffect(() => {
    if (!catchUpPrompt) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismissCatchUpPrompt();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [catchUpPrompt, dismissCatchUpPrompt]);

  if (!catchUpPrompt) return null;

  const { count, unitSingular, unitPlural, verbPast, mediaNoun } = catchUpPrompt;
  const unverb = verbPast === 'watched' ? 'unwatched' : 'unread';
  const unitWord = count === 1 ? unitSingular : unitPlural;
  const markLabel =
    count === 1
      ? `Mark ${unitSingular} ${verbPast}`
      : `Mark all ${count} ${verbPast}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Catch up previous items"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-sm p-0 sm:p-4 animate-fade-in"
      onClick={dismissCatchUpPrompt}
    >
      <div
        className="w-full sm:max-w-md bg-surface-raised border-t sm:border border-white/10 rounded-t-[26px] sm:rounded-[24px] px-5 pt-3 pb-6 shadow-2xl animate-sheet-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-10 h-1 rounded-full bg-white/25 mx-auto mb-5 sm:hidden" />

        <p className="text-[13px] text-ink-dim mb-3">
          You have {count} {unverb} {unitWord} before this one.
        </p>

        <div className="flex flex-col">
          <button
            type="button"
            onClick={confirmCatchUpPrompt}
            className="w-full py-3.5 text-left text-[15px] font-semibold text-ink hover:text-watched transition-colors rounded-xl px-2 -mx-2 hover:bg-white/[0.04]"
          >
            {markLabel}
          </button>
          <button
            type="button"
            onClick={neverAskCatchUpPrompt}
            className="w-full py-3.5 text-left text-[15px] font-normal text-ink/90 hover:text-ink transition-colors rounded-xl px-2 -mx-2 hover:bg-white/[0.04]"
          >
            Never ask for this {mediaNoun}
          </button>
          <button
            type="button"
            onClick={dismissCatchUpPrompt}
            className="w-full py-3.5 text-left text-[15px] font-normal text-ink-dim hover:text-ink transition-colors rounded-xl px-2 -mx-2 hover:bg-white/[0.04]"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
