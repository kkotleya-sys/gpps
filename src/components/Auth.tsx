import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { LogIn, UserPlus, X } from 'lucide-react';

interface AuthProps {
  onClose?: () => void;
  onGuestMode?: () => void;
}

export function Auth({ onClose, onGuestMode }: AuthProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signUp } = useAuth();

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
      setError(err instanceof Error ? err.message : 'Произошла ошибка');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-white dark:bg-gray-900 rounded-3xl shadow-2xl w-full max-w-md relative animate-scale-in border border-gray-200 dark:border-gray-700">
        {onClose && (
          <button
            onClick={onClose}
            className="absolute right-4 top-4 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-xl"
          >
            <X className="w-6 h-6" />
          </button>
        )}

        <div className="p-8">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-gray-900 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg">
              {isLogin ? (
                <LogIn className="w-8 h-8 text-white" />
              ) : (
                <UserPlus className="w-8 h-8 text-white" />
              )}
            </div>
            <h2 className="text-3xl font-bold text-gray-900 dark:text-gray-50">
              {isLogin ? 'Добро пожаловать' : 'Регистрация'}
            </h2>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              {isLogin ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Имя
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
                    placeholder="Имя"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Фамилия
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                    className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
                    placeholder="Фамилия"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
                placeholder="example@mail.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Пароль
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-2xl bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-50 focus:ring-2 focus:ring-gray-500 focus:border-transparent outline-none transition-all"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-2xl text-sm border border-red-200 dark:border-red-800 animate-slide-up">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gray-900 dark:bg-gray-700 text-white py-3.5 rounded-2xl font-semibold hover:bg-gray-800 dark:hover:bg-gray-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg active:scale-95"
            >
              {loading ? 'Загрузка...' : isLogin ? 'Войти' : 'Зарегистрироваться'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 font-medium transition-colors"
            >
              {isLogin ? 'Нет аккаунта? Зарегистрируйтесь' : 'Уже есть аккаунт? Войдите'}
            </button>
          </div>

          {onGuestMode && (
            <div className="mt-4 text-center">
              <button
                onClick={onGuestMode}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 text-sm transition-colors"
              >
                Продолжить как гость
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
