import { createContext, Fragment, useContext, useEffect, useState, type ReactNode } from 'react';
import { setLanguage, t, type Language } from '../strings';

const STORAGE_KEY = 'language';

/** The language this browser chose before, or Danish. Storage can be unavailable (private mode). */
function storedLanguage(): Language {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'da';
  } catch {
    return 'da';
  }
}

const LanguageContext = createContext<{ language: Language; change: (l: Language) => void }>({
  language: 'da',
  change: () => {},
});

/**
 * Holds the UI language (Danish or English). Changing it points `t` at the other strings and
 * re-renders the whole app.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setState] = useState<Language>(() => {
    const initial = storedLanguage();
    setLanguage(initial);
    return initial;
  });

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const change = (next: Language) => {
    setLanguage(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered in this browser; the switch still works for this visit.
    }
    setState(next);
  };

  return (
    <LanguageContext.Provider value={{ language, change }}>
      {/* A new key re-renders everything with the new strings. */}
      <Fragment key={language}>{children}</Fragment>
    </LanguageContext.Provider>
  );
}

/** "EN" / "DA" in the header: switches to the other language. */
export function LanguageSwitch() {
  const { language, change } = useContext(LanguageContext);
  return (
    <button
      type="button"
      className="language"
      title={t.language.switchTo}
      aria-label={t.language.switchTo}
      onClick={() => change(language === 'da' ? 'en' : 'da')}
    >
      {t.language.code}
    </button>
  );
}
