# ИНСТРУКЦИЯ ПО ИСПРАВЛЕНИЮ STORAGE

## Проблема: Ошибка RLS при загрузке файлов

Ошибка `new row violates row-level security policy` означает, что политики доступа для Storage не настроены правильно.

## Решение (выполните по порядку):

### Шаг 1: Проверить существование buckets

1. Откройте **Supabase Dashboard**
2. Перейдите в раздел **Storage**
3. Убедитесь, что существуют buckets:
   - `avatars` (для аватарок пользователей)
   - `bus-media` (для фото/видео автобусов)

### Шаг 2: Создать bucket `avatars` (если его нет)

1. В разделе **Storage** нажмите **New bucket**
2. Название: `avatars`
3. **Public bucket**: ✅ Включено (галочка)
4. File size limit: `5242880` (5 MB)
5. Allowed MIME types: `image/jpeg, image/png, image/webp, image/gif`
6. Нажмите **Create bucket**

### Шаг 3: Создать bucket `bus-media` (если его нет)

1. В разделе **Storage** нажмите **New bucket**
2. Название: `bus-media`
3. **Public bucket**: ✅ Включено (галочка)
4. File size limit: `20971520` (20 MB)
5. Allowed MIME types: `image/jpeg, image/png, image/webp, video/mp4, video/webm`
6. Нажмите **Create bucket**

### Шаг 4: Применить политики доступа

1. Откройте **SQL Editor** в Supabase Dashboard
2. Откройте файл `fix_storage_policies.sql`
3. Скопируйте **ВЕСЬ** код из файла
4. Вставьте в SQL Editor
5. Нажмите **Run** или **Execute**
6. Убедитесь, что нет ошибок

### Шаг 5: Проверить политики

Выполните в SQL Editor:

```sql
SELECT * FROM storage.policies WHERE bucket_id IN ('avatars', 'bus-media');
```

Должно вернуться 8 строк (4 политики для каждого bucket).

## После выполнения

1. Перезагрузите страницу приложения
2. Попробуйте загрузить аватар - должно работать
3. Попробуйте загрузить фото/видео автобуса - должно работать

## Если все еще не работает

1. Проверьте в консоли браузера (F12) какие именно ошибки появляются
2. Убедитесь, что вы авторизованы (залогинены)
3. Убедитесь, что ваш профиль имеет правильную роль (для загрузки медиа автобуса нужна роль Driver)
