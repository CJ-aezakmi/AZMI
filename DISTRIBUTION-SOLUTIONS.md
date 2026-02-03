# AEZAKMI Pro v2.0.0 - Решения для распространения

## ✅ ГОТОВОЕ РЕШЕНИЕ #1: Portable версия (РЕКОМЕНДУЕТСЯ)

### Преимущества:
- ✅ Всё включено: Node.js + Playwright + Chromium (103 MB)
- ✅ Просто распаковать ZIP и запустить
- ✅ Не требует установки
- ✅ Не требует прав администратора
- ✅ Работает из любой папки
- ✅ Можно запускать с флешки

### Файлы:
- `AEZAKMI-Portable-v2.0.0.zip` (36.83 MB) - архив для распространения
- `AEZAKMI-Portable\` (103.86 MB) - готовая папка

### Использование:
1. Пользователь скачивает `AEZAKMI-Portable-v2.0.0.zip`
2. Распаковывает в любую папку
3. Запускает `AEZAKMI.exe`
4. Всё работает!

### Создание portable версии:
```powershell
$project="C:\Users\User\aezakmi"
$release="$project\src-tauri\target\release"
$portable="$project\AEZAKMI-Portable"

# Копируем все файлы
Copy-Item "$release\app.exe" "$portable\AEZAKMI.exe"
Copy-Item "$project\bundle\node" "$portable\node" -Recurse
Copy-Item "$project\bundle\playwright" "$portable\playwright" -Recurse
Copy-Item "$project\bundle\scripts" "$portable\scripts" -Recurse

# Создаём ZIP
Compress-Archive -Path $portable -DestinationPath "AEZAKMI-Portable-v2.0.0.zip"
```

---

## ⚠️ ПРОБЛЕМНОЕ РЕШЕНИЕ #2: Tauri NSIS installer

### Проблема:
- Bundle ресурсы НЕ включаются в установщик
- Установщик 23.87 MB (должен быть ~100 MB)
- Ресурсы не копируются при установке

### Почему не работает:
```json
// tauri.conf.json
"resources": ["../bundle/**/*"]  // ❌ Не включается в NSIS
```

Tauri может правильно не копировать большие bundle в installer.

---

## 💡 АЛЬТЕРНАТИВНОЕ РЕШЕНИЕ #3: Inno Setup installer

### Создайте `installer.iss`:
```inno
[Setup]
AppName=AEZAKMI Pro
AppVersion=2.0.0
DefaultDirName={autopf}\AEZAKMI
OutputBaseFilename=AEZAKMI-Setup-v2.0.0
Compression=lzma2/ultra64
SolidCompression=yes

[Files]
Source: "AEZAKMI-Portable\AEZAKMI.exe"; DestDir: "{app}"
Source: "AEZAKMI-Portable\node\*"; DestDir: "{app}\node"; Flags: recursesubdirs
Source: "AEZAKMI-Portable\playwright\*"; DestDir: "{app}\playwright"; Flags: recursesubdirs
Source: "AEZAKMI-Portable\scripts\*"; DestDir: "{app}\scripts"; Flags: recursesubdirs

[Icons]
Name: "{autoprograms}\AEZAKMI Pro"; Filename: "{app}\AEZAKMI.exe"
Name: "{autodesktop}\AEZAKMI Pro"; Filename: "{app}\AEZAKMI.exe"
```

Установите Inno Setup и скомпилируйте: `iscc installer.iss`

---

## 🔄 АЛЬТЕРНАТИВНОЕ РЕШЕНИЕ #4: Старая схема (требует Node.js)

### Как в v2.0.0:
- Приложение требует Node.js установленный пользователем
- Playwright устанавливается автоматически при первом запуске
- Размер установщика: ~3 MB

### Изменения в коде:
1. Убрать bundle подготовку
2. Удалить `setup_bundled_resources()`
3. Добавить проверку Node.js при запуске
4. Использовать системный Node.js

### Минусы:
- ❌ Пользователь должен установить Node.js
- ❌ Дополнительный шаг установки
- ❌ Не автономное решение

---

## 🎯 РЕКОМЕНДАЦИЯ: Используйте Portable версию!

### Почему:
1. **Работает гарантированно** - все зависимости включены
2. **Просто для пользователя** - распаковать и запустить
3. **Быстрое распространение** - ZIP 36.83 MB
4. **Не нужны права администратора**
5. **Работает из любого места**

### Для GitHub Release:
1. Загрузите `AEZAKMI-Portable-v2.0.0.zip` (36.83 MB)
2. В описании укажите:
   ```
   ## Installation
   1. Download AEZAKMI-Portable-v2.0.0.zip
   2. Extract to any folder
   3. Run AEZAKMI.exe
   4. Done! Everything included.
   ```

### Первый запуск:
- Приложение проверит наличие Node.js в папке `node/`
- Playwright и Chromium уже готовы в папке `playwright/`
- Скрипты запуска в папке `scripts/`
- Всё работает без дополнительных установок!
