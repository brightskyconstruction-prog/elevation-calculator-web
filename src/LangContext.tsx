import React, { createContext, useContext, useState } from 'react';
import { strings, Lang } from './i18n';

export type { Lang };

interface LangCtx {
  lang:    Lang;
  setLang: (l: Lang) => void;
  /** Translate a string key. Falls back to English, then the key itself. */
  t: (key: string) => string;
}

const LangContext = createContext<LangCtx>({
  lang:    'en',
  setLang: () => {},
  t:       (k) => k,
});

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    try {
      const s = localStorage.getItem('app:language');
      return s === 'es' ? 'es' : 'en';
    } catch { return 'en'; }
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('app:language', l); } catch {}
  };

  const t = (key: string): string => {
    const map = strings[lang] as Record<string, unknown>;
    const v = map[key];
    if (typeof v === 'string') return v;
    // fallback to English
    const en = strings.en as Record<string, unknown>;
    const ev = en[key];
    if (typeof ev === 'string') return ev;
    return key;
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangCtx {
  return useContext(LangContext);
}
