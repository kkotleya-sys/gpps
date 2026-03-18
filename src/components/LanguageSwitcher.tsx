import { Language, useLanguage } from '../contexts/LanguageContext';

interface LanguageSwitcherProps {
  onChange?: (lang: Language) => void;
  className?: string;
}

const LANGS: Array<{ code: Language; label: string }> = [
  { code: 'ru', label: 'RU' },
  { code: 'tj', label: 'TJ' },
  { code: 'eng', label: 'ENG' },
];

export function LanguageSwitcher({ onChange, className = '' }: LanguageSwitcherProps) {
  const { language, setLanguage } = useLanguage();
  const activeIndex = LANGS.findIndex((item) => item.code === language);

  const handleChange = (lang: Language) => {
    if (lang === language) return;
    onChange?.(lang);
    if (!onChange) setLanguage(lang);
  };

  return (
    <div
      className={`relative flex items-center rounded-full border border-gray-200/70 bg-white/80 px-1.5 py-1 shadow-sm backdrop-blur-md dark:border-gray-700/80 dark:bg-gray-900/80 ${className}`.trim()}
    >
      <div
        className="pointer-events-none absolute top-1 bottom-1 rounded-full bg-gray-900 shadow-lg transition-transform duration-300 ease-out dark:bg-gray-700"
        style={{
          left: '6px',
          width: 'calc((100% - 12px) / 3)',
          transform: `translateX(${activeIndex * 100}%)`,
        }}
      />
      {LANGS.map((item) => (
        <button
          key={item.code}
          onClick={() => handleChange(item.code)}
          className={`relative z-10 min-w-[44px] rounded-full px-3 py-1 text-[10px] font-semibold tracking-[0.24em] transition-all duration-300 ${
            language === item.code
              ? 'scale-100 text-white'
              : 'scale-95 text-gray-500 hover:scale-100 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
          }`}
        >
          <span className={language === item.code ? 'animate-language-transition inline-block' : 'inline-block'}>
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}
