# Инструкция по применению миграций

## Важно! Выполните эти шаги в Supabase Dashboard

### Шаг 1: Применить SQL миграции

1. Откройте Supabase Dashboard
2. Перейдите в раздел **SQL Editor**
3. Откройте файл `supabase/migrations/20251206000000_create_all_tables.sql`
4. Скопируйте весь SQL код и выполните его в SQL Editor
5. Убедитесь, что все таблицы созданы успешно

### Шаг 2: Создать Storage Bucket

1. В Supabase Dashboard перейдите в **Storage**
2. Нажмите **New bucket**
3. Название: `bus-media`
4. Public bucket: **Включено** (галочка)
5. File size limit: `20971520` (20 MB)
6. Allowed MIME types: `image/jpeg, image/png, image/webp, video/mp4, video/webm`
7. Нажмите **Create bucket**

### Шаг 3: Применить Storage политики

1. В SQL Editor выполните код из файла `supabase/migrations/20251206000001_create_bus_media_bucket.sql`
2. Это создаст политики доступа для bucket

### Шаг 4: Проверить создание таблиц

Выполните в SQL Editor:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'stops', 
  'bus_stop_schedules', 
  'routes', 
  'route_stops', 
  'bus_profiles', 
  'bus_media', 
  'reviews'
);
```

Должно вернуться 7 строк с названиями таблиц.

### Шаг 5: Проверить Storage Bucket

В Storage должен быть виден bucket `bus-media`.

## После выполнения миграций

Перезапустите приложение и все должно работать!
