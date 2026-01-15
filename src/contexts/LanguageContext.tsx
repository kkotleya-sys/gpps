import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Language = 'ru' | 'tj' | 'eng';

interface Translations {
  [key: string]: {
    ru: string;
    tj: string;
    eng: string;
  };
}

const translations: Translations = {
  // Navigation
  'nav.map': { ru: 'Карта', tj: 'Харита', eng: 'Map' },
  'nav.schedule': { ru: 'Расписание', tj: 'Ҷадвал', eng: 'Schedule' },
  'nav.settings': { ru: 'Настройки', tj: 'Танзимот', eng: 'Settings' },
  
  // Common
  'common.loading': { ru: 'Загрузка...', tj: 'Боркунӣ...', eng: 'Loading...' },
  'common.save': { ru: 'Сохранить', tj: 'Нигоҳ доштан', eng: 'Save' },
  'common.cancel': { ru: 'Отмена', tj: 'Бекор кардан', eng: 'Cancel' },
  'common.delete': { ru: 'Удалить', tj: 'Нест кардан', eng: 'Delete' },
  'common.close': { ru: 'Закрыть', tj: 'Пӯшидан', eng: 'Close' },
  'common.add': { ru: 'Добавить', tj: 'Илова кардан', eng: 'Add' },
  'common.edit': { ru: 'Редактировать', tj: 'Таҳрир кардан', eng: 'Edit' },
  'common.search': { ru: 'Поиск', tj: 'Ҷустуҷӯ', eng: 'Search' },
  
  // Auth
  'auth.login': { ru: 'Войти', tj: 'Даромадан', eng: 'Login' },
  'auth.logout': { ru: 'Выйти', tj: 'Баромадан', eng: 'Logout' },
  'auth.guest': { ru: 'Гость', tj: 'Меҳмон', eng: 'Guest' },
  
  // Map
  'map.allBuses': { ru: 'Все автобусы', tj: 'Ҳамаи автобусҳо', eng: 'All buses' },
  'map.showRoute': { ru: 'Показать маршрут', tj: 'Маршрутро нишон диҳед', eng: 'Show route' },
  'map.hideRoute': { ru: 'Скрыть маршрут', tj: 'Маршрутро пинҳон кардан', eng: 'Hide route' },
  'map.busNumber': { ru: 'Автобус №', tj: 'Автобус №', eng: 'Bus №' },
  'map.speed': { ru: 'Скорость', tj: 'Суръат', eng: 'Speed' },
  'map.distance': { ru: 'Расстояние', tj: 'Масофа', eng: 'Distance' },
  'map.eta': { ru: 'Время прибытия', tj: 'Вақти расидан', eng: 'Arrival time' },
  'map.minutes': { ru: 'мин', tj: 'дақ', eng: 'min' },
  'map.km': { ru: 'км', tj: 'км', eng: 'km' },
  'map.kmh': { ru: 'км/ч', tj: 'км/соат', eng: 'km/h' },
  
  // Route
  'route.create': { ru: 'Создать маршрут', tj: 'Маршрут эҷод кардан', eng: 'Create route' },
  'route.name': { ru: 'Название маршрута', tj: 'Номи маршрут', eng: 'Route name' },
  'route.addStop': { ru: 'Добавить остановку', tj: 'Истгоҳро илова кардан', eng: 'Add stop' },
  'route.stopName': { ru: 'Название остановки', tj: 'Номи истгоҳ', eng: 'Stop name' },
  'route.stopTime': { ru: 'Время прибытия', tj: 'Вақти расидан', eng: 'Arrival time' },
  'route.active': { ru: 'Активен', tj: 'Фаъол', eng: 'Active' },
  'route.inactive': { ru: 'Неактивен', tj: 'Ғайрифаъол', eng: 'Inactive' },
  'route.save': { ru: 'Сохранить маршрут', tj: 'Маршрутро нигоҳ доштан', eng: 'Save route' },
  'route.noStops': { ru: 'Нет остановок', tj: 'Истгоҳ нест', eng: 'No stops' },
  'route.selectStop': { ru: 'Выберите остановку', tj: 'Истгоҳро интихоб кунед', eng: 'Select stop' },
  'route.noSuchStop': { ru: 'Нет такой остановки', tj: 'Чунин истгоҳ нест', eng: 'No such stop' },
  'route.addNewStop': { ru: '+ Добавить остановку', tj: '+ Истгоҳро илова кардан', eng: '+ Add stop' },
  'route.stopNamePlaceholder': { ru: 'Например: Шахраки Мехробод', tj: 'Масалан: Шаҳраки Меҳробод', eng: 'Example: Shahraki Mehrobod' },
  
  // Schedule
  'schedule.title': { ru: 'Расписание и маршруты', tj: 'Ҷадвал ва маршрутҳо', eng: 'Schedule and routes' },
  'schedule.mySchedule': { ru: 'Моё расписание', tj: 'Ҷадвали ман', eng: 'My schedule' },
  'schedule.nearestBuses': { ru: 'Ближайшие автобусы до вас', tj: 'Автобусҳои наздиктарин', eng: 'Nearest buses to you' },
  'schedule.findByStop': { ru: 'Найти автобус по остановке', tj: 'Автобусро бо истгоҳ ёбед', eng: 'Find bus by stop' },
  'schedule.routeWithTransfers': { ru: 'Маршрут с пересадками', tj: 'Маршрут бо иваз кардан', eng: 'Route with transfers' },
  'schedule.from': { ru: 'Откуда', tj: 'Аз куҷо', eng: 'From' },
  'schedule.to': { ru: 'Куда', tj: 'Ба куҷо', eng: 'To' },
  
  // Settings
  'settings.title': { ru: 'Настройки', tj: 'Танзимот', eng: 'Settings' },
  'settings.language': { ru: 'Язык', tj: 'Забон', eng: 'Language' },
  'settings.firstName': { ru: 'Имя (ник)', tj: 'Ном (ник)', eng: 'First name' },
  'settings.lastName': { ru: 'Фамилия', tj: 'Насаб', eng: 'Last name' },
  'settings.busNumber': { ru: 'Номер автобуса', tj: 'Рақами автобус', eng: 'Bus number' },
  'settings.theme': { ru: 'Тема приложения', tj: 'Мавзӯи барнома', eng: 'App theme' },
  'settings.darkTheme': { ru: 'Тёмная тема', tj: 'Мавзӯи торик', eng: 'Dark theme' },
  'settings.lightTheme': { ru: 'Светлая тема', tj: 'Мавзӯи равшан', eng: 'Light theme' },
  'settings.saveProfile': { ru: 'Сохранить профиль', tj: 'Профилро нигоҳ доштан', eng: 'Save profile' },
  
  // Bus Profile
  'busProfile.title': { ru: 'Профиль автобуса', tj: 'Профили автобус', eng: 'Bus profile' },
  'busProfile.driver': { ru: 'Водитель автобуса', tj: 'Роҳбари автобус', eng: 'Bus driver' },
  'busProfile.description': { ru: 'Описание', tj: 'Тавсиф', eng: 'Description' },
  'busProfile.photos': { ru: 'Фотографии автобуса', tj: 'Аксҳои автобус', eng: 'Bus photos' },
  'busProfile.reviews': { ru: 'Отзывы', tj: 'Шарҳҳо', eng: 'Reviews' },
  'busProfile.writeReview': { ru: 'Написать отзыв', tj: 'Шарҳ нависед', eng: 'Write review' },
  'busProfile.rating': { ru: 'Оценка', tj: 'Баҳо', eng: 'Rating' },
  'busProfile.comment': { ru: 'Комментарий', tj: 'Шарҳ', eng: 'Comment' },
  'busProfile.filter': { ru: 'Фильтр', tj: 'Филтр', eng: 'Filter' },
  'busProfile.positive': { ru: 'Положительные', tj: 'Мусбат', eng: 'Positive' },
  'busProfile.negative': { ru: 'Отрицательные', tj: 'Манфӣ', eng: 'Negative' },
  'busProfile.all': { ru: 'Все', tj: 'Ҳама', eng: 'All' },
  
  // Driver
  'driver.youAreDriver': { ru: 'Вы водитель автобуса', tj: 'Шумо роҳбари автобус ҳастед', eng: 'You are a bus driver' },
  'driver.editBus': { ru: 'Редактировать автобус', tj: 'Автобусро таҳрир кардан', eng: 'Edit bus' },
  'driver.addPhoto': { ru: 'Добавить фото', tj: 'Акс илова кардан', eng: 'Add photo' },
  'driver.addVideo': { ru: 'Добавить видео', tj: 'Видео илова кардан', eng: 'Add video' },
  'driver.maxPhotos': { ru: 'Максимум 10 фото', tj: 'Максимум 10 акс', eng: 'Max 10 photos' },
  'driver.maxVideo': { ru: 'Максимум 20 МБ', tj: 'Максимум 20 МБ', eng: 'Max 20 MB' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const stored = localStorage.getItem('language') as Language;
    return stored && ['ru', 'tj', 'eng'].includes(stored) ? stored : 'ru';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  const t = (key: string): string => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
