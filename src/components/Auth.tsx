import { useState } from 'react';
import { LogIn, UserPlus, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';

interface AuthProps {
  onClose?: () => void;
  onGuestMode?: () => void;
}

export function Auth({ onClose, onGuestMode }: AuthProps) {
  const { language } = useLanguage();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

  const copy = {
    ru: {
      welcome: 'Добро пожаловать',
      register: 'Регистрация',
      loginSubtitle: 'Войдите в свой аккаунт',
      registerSubtitle: 'Создайте новый аккаунт',
      firstName: 'Имя',
      lastName: 'Фамилия',
      email: 'Email',
      password: 'Пароль',
      loading: 'Загрузка...',
      loginAction: 'Войти',
      registerAction: 'Зарегистрироваться',
      noAccount: 'Нет аккаунта? Зарегистрируйтесь',
      hasAccount: 'Уже есть аккаунт? Войдите',
      continueGuest: 'Продолжить как гость',
      fallbackError: 'Произошла ошибка',
      firstNamePlaceholder: 'Имя',
      lastNamePlaceholder: 'Фамилия',
    },
    tj: {
      welcome: 'Хуш омадед',
      register: 'Бақайдгирӣ',
      loginSubtitle: 'Ба ҳисоби худ ворид шавед',
      registerSubtitle: 'Ҳисоби нав эҷод кунед',
      firstName: 'Ном',
      lastName: 'Насаб',
      email: 'Email',
      password: 'Рамз',
      loading: 'Боркунӣ...',
      loginAction: 'Даромадан',
      registerAction: 'Бақайдгирӣ кардан',
      noAccount: 'Ҳисоб надоред? Бақайдгирӣ кунед',
      hasAccount: 'Аллакай ҳисоб доред? Дароед',
      continueGuest: 'Ҳамчун меҳмон идома додан',
      fallbackError: 'Хато рӯй дод',
      firstNamePlaceholder: 'Ном',
      lastNamePlaceholder: 'Насаб',
    },
    eng: {
      welcome: 'Welcome back',
      register: 'Sign up',
      loginSubtitle: 'Sign in to your account',
      registerSubtitle: 'Create a new account',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      password: 'Password',
      loading: 'Loading...',
      loginAction: 'Login',
      registerAction: 'Create account',
      noAccount: 'No account? Sign up',
      hasAccount: 'Already have an account? Log in',
      continueGuest: 'Continue as guest',
      fallbackError: 'Something went wrong',
      firstNamePlaceholder: 'First name',
      lastNamePlaceholder: 'Last name',
    },
  }[language];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        await signIn(email, password);
      } else {
        await signUp(email, password, firstName, lastName);
      }
      onClose?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.fallbackError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in dark:bg-black/80">
      <div className="relative w-full max-w-md rounded-3xl border border-gray-200 bg-white shadow-2xl animate-scale-in dark:border-gray-700 dark:bg-gray-900">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 rounded-xl p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        )}

        <div className="p-8">
          <div className="mb-6 flex justify-center">
            <LanguageSwitcher className="animate-scale-in" />
          </div>

          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-900 shadow-lg dark:bg-gray-700">
              {isLogin ? <LogIn className="h-8 w-8 text-white" /> : <UserPlus className="h-8 w-8 text-white" />}
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
              {isLogin ? copy.welcome : copy.register}
            </h2>
            <p className="mt-2 text-gray-600 dark:text-gray-400">
              {isLogin ? copy.loginSubtitle : copy.registerSubtitle}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {copy.firstName}
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-50"
                    placeholder={copy.firstNamePlaceholder}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {copy.lastName}
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full rounded-2xl border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-50"
                    placeholder={copy.lastNamePlaceholder}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {copy.email}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-2xl border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-50"
                placeholder="example@mail.com"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                {copy.password}
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-2xl border border-gray-300 bg-gray-50 px-4 py-2.5 text-gray-900 outline-none transition-all focus:border-transparent focus:ring-2 focus:ring-gray-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-50"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="animate-slide-up rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-gray-900 py-3.5 font-semibold text-white shadow-lg transition-all active:scale-95 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600"
            >
              {loading ? copy.loading : isLogin ? copy.loginAction : copy.registerAction}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
            >
              {isLogin ? copy.noAccount : copy.hasAccount}
            </button>
          </div>

          {onGuestMode && (
            <div className="mt-4 text-center">
              <button
                onClick={onGuestMode}
                className="text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
              >
                {copy.continueGuest}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
