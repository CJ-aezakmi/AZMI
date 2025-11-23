// AEZAKMI Antidetect Pro v2.0 - Renderer Process
console.log('AEZAKMI Renderer loaded');

// Глобальные переменные
let profiles = [];
let proxies = [];
let selectedProfiles = new Set();
let currentEditingProfile = null;

// Инициализация приложения
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM loaded, initializing app...');
    
    try {
        await loadProfiles();
        await loadProxies();
        setupEventListeners();
        showNotification('AEZAKMI Antidetect Pro загружен успешно!', 'success');
        console.log('App initialized successfully');
    } catch (error) {
        console.error('Error initializing app:', error);
        showNotification('Ошибка инициализации приложения: ' + error.message, 'error');
    }
});

// Настройка обработчиков событий
function setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Навигация по разделам
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const view = item.getAttribute('data-view');
            if (view) {
                switchView(view);
            }
        });
    });
    
    // Кнопки управления профилями
    const createProfileBtn = document.getElementById('createProfileBtn');
    if (createProfileBtn) {
        createProfileBtn.addEventListener('click', () => openProfileModal());
    }
    
    const selectAllBtn = document.getElementById('selectAllBtn');
    if (selectAllBtn) {
        selectAllBtn.addEventListener('click', toggleSelectAll);
    }
    
    const startSelectedBtn = document.getElementById('startSelectedBtn');
    if (startSelectedBtn) {
        startSelectedBtn.addEventListener('click', launchSelectedProfiles);
    }
    
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    if (deleteSelectedBtn) {
        deleteSelectedBtn.addEventListener('click', deleteSelectedProfiles);
    }
    
    // Поиск профилей
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterProfiles(e.target.value);
        });
    }
    
    // Модальное окно профиля
    const profileModal = document.getElementById('profileModal');
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) {
                closeProfileModal();
            }
        });
    }
    
    // Кнопки модального окна профиля
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }
    
    const cancelProfileBtn = document.getElementById('cancelProfileBtn');
    if (cancelProfileBtn) {
        cancelProfileBtn.addEventListener('click', closeProfileModal);
    }
    
    // Табы в модальном окне профиля
    document.querySelectorAll('.tab-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const tabName = button.getAttribute('data-tab');
            if (tabName) {
                switchModalTab(tabName);
            }
        });
    });
    
    // Прокси
    const addProxiesBtn = document.getElementById('addProxiesBtn');
    if (addProxiesBtn) {
        addProxiesBtn.addEventListener('click', () => {
            const textarea = document.getElementById('proxyInput');
            if (textarea && textarea.value.trim()) {
                saveProxiesFromInput();
            }
        });
    }
    
    const testAllProxiesBtn = document.getElementById('testAllProxiesBtn');
    if (testAllProxiesBtn) {
        testAllProxiesBtn.addEventListener('click', testAllProxies);
    }
    
    // Прокси настройки в профиле
    const proxyEnabled = document.getElementById('proxyEnabled');
    if (proxyEnabled) {
        proxyEnabled.addEventListener('change', (e) => {
            const proxySettings = document.getElementById('proxySettings');
            if (proxySettings) {
                proxySettings.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }
    
    // Быстрый ввод прокси
    const quickProxyInput = document.getElementById('quickProxyInput');
    if (quickProxyInput) {
        quickProxyInput.addEventListener('input', (e) => {
            if (e.target.value.trim()) {
                parseQuickProxy(e.target.value);
            }
        });
    }
    
    // Тест прокси в модальном окне профиля
    const testProxyBtn = document.getElementById('testProxyBtn');
    if (testProxyBtn) {
        testProxyBtn.addEventListener('click', testCurrentProxy);
    }
    
    // Геолокация
    const spoofGeolocation = document.getElementById('spoofGeolocation');
    if (spoofGeolocation) {
        spoofGeolocation.addEventListener('change', (e) => {
            const geolocationSettings = document.getElementById('geolocationSettings');
            if (geolocationSettings) {
                geolocationSettings.style.display = e.target.checked ? 'block' : 'none';
            }
        });
    }
    
    console.log('Event listeners set up successfully');
}

// Переключение между разделами
function switchView(viewName) {
    console.log('Switching to view:', viewName);
    
    // Скрываем все разделы
    document.querySelectorAll('.view').forEach(view => {
        view.classList.add('hidden');
    });
    
    // Убираем активный класс с навигации
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    
    // Показываем нужный раздел
    const targetView = document.getElementById(viewName + 'View');
    if (targetView) {
        targetView.classList.remove('hidden');
    }
    
    // Добавляем активный класс
    const activeNavItem = document.querySelector(`[data-view="${viewName}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }
}

// Переключение табов в модальном окне
function switchModalTab(tabName) {
    console.log('Switching to modal tab:', tabName);
    
    // Скрываем все табы
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.add('hidden');
    });
    
    // Убираем активный класс с кнопок табов
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // Показываем нужный таб
    const targetTab = document.getElementById(tabName + 'Tab');
    if (targetTab) {
        targetTab.classList.remove('hidden');
    }
    
    // Добавляем активный класс
    const activeButton = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeButton) {
        activeButton.classList.add('active');
    }
}

// Загрузка профилей
async function loadProfiles() {
    try {
        console.log('Loading profiles...');
        profiles = await window.electronAPI.getProfiles();
        console.log('Profiles loaded:', profiles.length);
        renderProfiles();
        updateProfileCount();
    } catch (error) {
        console.error('Error loading profiles:', error);
        showNotification('Ошибка загрузки профилей: ' + error.message, 'error');
        profiles = [];
    }
}

// Обновление счетчика профилей
function updateProfileCount() {
    const profileCount = document.getElementById('profileCount');
    if (profileCount) {
        profileCount.textContent = profiles.length;
    }
}

// Отображение профилей
function renderProfiles() {
    console.log('Rendering profiles:', profiles.length);
    const container = document.getElementById('profilesContainer');
    if (!container) {
        console.error('Profiles container not found');
        return;
    }
    
    if (profiles.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Нет профилей</h3>
                <p>Создайте свой первый профиль для начала работы</p>
                <button class="btn btn-primary" onclick="openProfileModal()">
                    + Создать профиль
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = profiles.map(profile => `
        <div class="profile-card" data-profile-id="${profile.id}">
            <div class="profile-header">
                <input type="checkbox" class="profile-checkbox" 
                       onchange="toggleProfileSelection('${profile.id}')"
                       ${selectedProfiles.has(profile.id) ? 'checked' : ''}>
                <h3>${escapeHtml(profile.name || 'Без названия')}</h3>
                <div class="profile-status ${profile.status || 'inactive'}"></div>
            </div>
            
            <div class="profile-info">
                <div class="info-row">
                    <span class="label">User Agent:</span>
                    <span class="value">${escapeHtml(profile.userAgent || 'Авто')}</span>
                </div>
                <div class="info-row">
                    <span class="label">Разрешение:</span>
                    <span class="value">${profile.screenWidth || 1920}x${profile.screenHeight || 1080}</span>
                </div>
                <div class="info-row">
                    <span class="label">Прокси:</span>
                    <span class="value">${profile.proxy?.enabled ? `${profile.proxy.host}:${profile.proxy.port}` : 'Не используется'}</span>
                </div>
                <div class="info-row">
                    <span class="label">Создан:</span>
                    <span class="value">${formatDate(profile.createdAt)}</span>
                </div>
            </div>
            
            <div class="profile-actions">
                <button class="btn btn-primary" onclick="launchProfile('${profile.id}')">
                    🚀 Запустить
                </button>
                <button class="btn btn-secondary" onclick="editProfile('${profile.id}')">
                    ✏️ Редактировать
                </button>
                <button class="btn btn-secondary" onclick="cloneProfile('${profile.id}')">
                    📋 Клонировать
                </button>
                <button class="btn btn-danger" onclick="deleteProfile('${profile.id}')">
                    🗑️ Удалить
                </button>
            </div>
        </div>
    `).join('');
}

// Открытие модального окна профиля
function openProfileModal(profileData = null) {
    console.log('Opening profile modal:', profileData ? 'edit' : 'create');
    
    currentEditingProfile = profileData;
    const modal = document.getElementById('profileModal');
    const form = document.getElementById('profileForm');
    
    if (!modal || !form) {
        console.error('Profile modal elements not found');
        return;
    }
    
    // Заполняем форму
    if (profileData) {
        document.getElementById('profileModalTitle').textContent = 'Редактировать профиль';
        document.getElementById('profileName').value = profileData.name || '';
        document.getElementById('profileNotes').value = profileData.notes || '';
        document.getElementById('userAgent').value = profileData.userAgent || 'auto';
        document.getElementById('screenWidth').value = profileData.screenWidth || '1920';
        document.getElementById('screenHeight').value = profileData.screenHeight || '1080';
        document.getElementById('language').value = profileData.language || 'ru-RU';
        document.getElementById('timezone').value = profileData.timezone || 'Europe/Moscow';
        
        // Прокси настройки
        if (profileData.proxy) {
            document.getElementById('proxyEnabled').checked = profileData.proxy.enabled || false;
            document.getElementById('proxyType').value = profileData.proxy.type || 'http';
            document.getElementById('proxyHost').value = profileData.proxy.host || '';
            document.getElementById('proxyPort').value = profileData.proxy.port || '';
            document.getElementById('proxyUsername').value = profileData.proxy.username || '';
            document.getElementById('proxyPassword').value = profileData.proxy.password || '';
            
            const proxySettings = document.getElementById('proxySettings');
            if (proxySettings) {
                proxySettings.style.display = profileData.proxy.enabled ? 'block' : 'none';
            }
        }
        
        // Антидетект настройки
        if (profileData.antidetect) {
            document.getElementById('canvasNoise').checked = profileData.antidetect.canvasNoise !== false;
            document.getElementById('webglNoise').checked = profileData.antidetect.webglNoise !== false;
            document.getElementById('audioNoise').checked = profileData.antidetect.audioNoise !== false;
            document.getElementById('blockWebRTC').checked = profileData.antidetect.blockWebRTC !== false;
            document.getElementById('spoofGeolocation').checked = profileData.antidetect.spoofGeolocation || false;
            
            if (profileData.antidetect.geolocation) {
                document.getElementById('latitude').value = profileData.antidetect.geolocation.latitude || '';
                document.getElementById('longitude').value = profileData.antidetect.geolocation.longitude || '';
            }
            
            const geolocationSettings = document.getElementById('geolocationSettings');
            if (geolocationSettings) {
                geolocationSettings.style.display = profileData.antidetect.spoofGeolocation ? 'block' : 'none';
            }
        }
    } else {
        document.getElementById('profileModalTitle').textContent = 'Создать новый профиль';
        form.reset();
        // Устанавливаем значения по умолчанию
        document.getElementById('screenWidth').value = '1920';
        document.getElementById('screenHeight').value = '1080';
        document.getElementById('language').value = 'ru-RU';
        document.getElementById('timezone').value = 'Europe/Moscow';
        document.getElementById('canvasNoise').checked = true;
        document.getElementById('webglNoise').checked = true;
        document.getElementById('audioNoise').checked = true;
        document.getElementById('blockWebRTC').checked = true;
        
        const proxySettings = document.getElementById('proxySettings');
        if (proxySettings) {
            proxySettings.style.display = 'none';
        }
        
        const geolocationSettings = document.getElementById('geolocationSettings');
        if (geolocationSettings) {
            geolocationSettings.style.display = 'none';
        }
    }
    
    // Переключаемся на первый таб
    switchModalTab('basic');
    
    modal.classList.remove('hidden');
}

// Закрытие модального окна профиля
function closeProfileModal() {
    console.log('Closing profile modal');
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.add('hidden');
    }
    currentEditingProfile = null;
}

// Сохранение профиля
async function saveProfile() {
    try {
        console.log('Saving profile...');
        
        const profileName = document.getElementById('profileName').value.trim();
        if (!profileName) {
            showNotification('Введите название профиля', 'error');
            return;
        }
        
        const profileData = {
            id: currentEditingProfile?.id,
            name: profileName,
            notes: document.getElementById('profileNotes').value.trim(),
            userAgent: document.getElementById('userAgent').value,
            screenWidth: parseInt(document.getElementById('screenWidth').value) || 1920,
            screenHeight: parseInt(document.getElementById('screenHeight').value) || 1080,
            language: document.getElementById('language').value,
            timezone: document.getElementById('timezone').value,
            proxy: {
                enabled: document.getElementById('proxyEnabled').checked,
                type: document.getElementById('proxyType').value,
                host: document.getElementById('proxyHost').value.trim(),
                port: document.getElementById('proxyPort').value.trim(),
                username: document.getElementById('proxyUsername').value.trim(),
                password: document.getElementById('proxyPassword').value.trim()
            },
            antidetect: {
                canvasNoise: document.getElementById('canvasNoise').checked,
                webglNoise: document.getElementById('webglNoise').checked,
                audioNoise: document.getElementById('audioNoise').checked,
                blockWebRTC: document.getElementById('blockWebRTC').checked,
                spoofGeolocation: document.getElementById('spoofGeolocation').checked,
                geolocation: document.getElementById('spoofGeolocation').checked ? {
                    latitude: parseFloat(document.getElementById('latitude').value) || 0,
                    longitude: parseFloat(document.getElementById('longitude').value) || 0
                } : null
            }
        };
        
        console.log('Profile data to save:', profileData);
        
        const savedProfile = await window.electronAPI.saveProfile(profileData);
        console.log('Profile saved successfully:', savedProfile);
        
        await loadProfiles();
        closeProfileModal();
        
        showNotification(`Профиль "${savedProfile.name}" сохранен успешно!`, 'success');
        
    } catch (error) {
        console.error('Error saving profile:', error);
        showNotification('Ошибка сохранения профиля: ' + error.message, 'error');
    }
}

// Запуск профиля
async function launchProfile(profileId) {
    try {
        console.log('Launching profile:', profileId);
        
        const profile = profiles.find(p => p.id === profileId);
        if (!profile) {
            throw new Error('Профиль не найден');
        }
        
        showNotification(`Запуск профиля "${profile.name}"...`, 'info');
        
        const result = await window.electronAPI.launchProfile(profileId);
        console.log('Profile launched:', result);
        
        if (result.success) {
            showNotification(`Профиль "${profile.name}" запущен успешно!`, 'success');
            
            // Обновляем статус профиля
            profile.status = 'active';
            renderProfiles();
        } else {
            throw new Error(result.message || 'Неизвестная ошибка');
        }
        
    } catch (error) {
        console.error('Error launching profile:', error);
        showNotification('Ошибка запуска профиля: ' + error.message, 'error');
    }
}

// Редактирование профиля
function editProfile(profileId) {
    console.log('Editing profile:', profileId);
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
        openProfileModal(profile);
    } else {
        showNotification('Профиль не найден', 'error');
    }
}

// Клонирование профиля
async function cloneProfile(profileId) {
    try {
        console.log('Cloning profile:', profileId);
        
        const profile = profiles.find(p => p.id === profileId);
        if (!profile) {
            throw new Error('Профиль не найден');
        }
        
        const clonedProfile = {
            ...profile,
            id: undefined, // Будет сгенерирован новый ID
            name: `${profile.name} (копия)`,
            createdAt: undefined,
            updatedAt: undefined
        };
        
        const savedProfile = await window.electronAPI.saveProfile(clonedProfile);
        console.log('Profile cloned successfully:', savedProfile);
        
        await loadProfiles();
        showNotification(`Профиль "${profile.name}" клонирован успешно!`, 'success');
        
    } catch (error) {
        console.error('Error cloning profile:', error);
        showNotification('Ошибка клонирования профиля: ' + error.message, 'error');
    }
}

// Удаление профиля
async function deleteProfile(profileId) {
    try {
        const profile = profiles.find(p => p.id === profileId);
        if (!profile) {
            throw new Error('Профиль не найден');
        }
        
        if (!confirm(`Вы уверены, что хотите удалить профиль "${profile.name}"?`)) {
            return;
        }
        
        console.log('Deleting profile:', profileId);
        
        await window.electronAPI.deleteProfile(profileId);
        console.log('Profile deleted successfully');
        
        await loadProfiles();
        selectedProfiles.delete(profileId);
        updateSelectionUI();
        
        showNotification(`Профиль "${profile.name}" удален успешно!`, 'success');
        
    } catch (error) {
        console.error('Error deleting profile:', error);
        showNotification('Ошибка удаления профиля: ' + error.message, 'error');
    }
}

// Выбор профилей
function toggleProfileSelection(profileId) {
    console.log('Toggling profile selection:', profileId);
    
    if (selectedProfiles.has(profileId)) {
        selectedProfiles.delete(profileId);
    } else {
        selectedProfiles.add(profileId);
    }
    
    updateSelectionUI();
}

// Выбрать все профили
function toggleSelectAll() {
    console.log('Toggling select all');
    
    if (selectedProfiles.size === profiles.length) {
        selectedProfiles.clear();
    } else {
        profiles.forEach(profile => selectedProfiles.add(profile.id));
    }
    
    renderProfiles();
    updateSelectionUI();
}

// Обновление UI выбора
function updateSelectionUI() {
    const selectedCount = selectedProfiles.size;
    const countElement = document.getElementById('selectedCount');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const startSelectedBtn = document.getElementById('startSelectedBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    
    if (countElement) {
        countElement.textContent = selectedCount;
    }
    
    if (selectAllBtn) {
        selectAllBtn.textContent = selectedCount === profiles.length ? 'Снять выбор' : 'Выбрать все';
    }
    
    if (startSelectedBtn) {
        startSelectedBtn.disabled = selectedCount === 0;
    }
    
    if (deleteSelectedBtn) {
        deleteSelectedBtn.disabled = selectedCount === 0;
    }
}

// Запуск выбранных профилей
async function launchSelectedProfiles() {
    if (selectedProfiles.size === 0) {
        showNotification('Не выбрано ни одного профиля', 'warning');
        return;
    }
    
    console.log('Launching selected profiles:', selectedProfiles.size);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const profileId of selectedProfiles) {
        try {
            await launchProfile(profileId);
            successCount++;
        } catch (error) {
            console.error('Error launching profile:', profileId, error);
            errorCount++;
        }
        
        // Небольшая задержка между запусками
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    showNotification(`Запущено профилей: ${successCount}, ошибок: ${errorCount}`, 
                    errorCount === 0 ? 'success' : 'warning');
}

// Удаление выбранных профилей
async function deleteSelectedProfiles() {
    if (selectedProfiles.size === 0) {
        showNotification('Не выбрано ни одного профиля', 'warning');
        return;
    }
    
    if (!confirm(`Вы уверены, что хотите удалить ${selectedProfiles.size} профилей?`)) {
        return;
    }
    
    console.log('Deleting selected profiles:', selectedProfiles.size);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const profileId of selectedProfiles) {
        try {
            await window.electronAPI.deleteProfile(profileId);
            successCount++;
        } catch (error) {
            console.error('Error deleting profile:', profileId, error);
            errorCount++;
        }
    }
    
    selectedProfiles.clear();
    await loadProfiles();
    updateSelectionUI();
    
    showNotification(`Удалено профилей: ${successCount}, ошибок: ${errorCount}`, 
                    errorCount === 0 ? 'success' : 'warning');
}

// Фильтрация профилей
function filterProfiles(searchTerm) {
    console.log('Filtering profiles:', searchTerm);
    
    const cards = document.querySelectorAll('.profile-card');
    cards.forEach(card => {
        const profileName = card.querySelector('h3').textContent.toLowerCase();
        const isVisible = profileName.includes(searchTerm.toLowerCase());
        card.style.display = isVisible ? 'block' : 'none';
    });
}

// Загрузка прокси
async function loadProxies() {
    try {
        console.log('Loading proxies...');
        proxies = await window.electronAPI.getProxies();
        console.log('Proxies loaded:', proxies.length);
        renderProxies();
        updateProxyCount();
    } catch (error) {
        console.error('Error loading proxies:', error);
        showNotification('Ошибка загрузки прокси: ' + error.message, 'error');
        proxies = [];
    }
}

// Обновление счетчика прокси
function updateProxyCount() {
    const proxyCount = document.getElementById('proxyCount');
    if (proxyCount) {
        proxyCount.textContent = proxies.length;
    }
}

// Отображение прокси
function renderProxies() {
    console.log('Rendering proxies:', proxies.length);
    const container = document.getElementById('proxiesContainer');
    if (!container) {
        console.error('Proxies container not found');
        return;
    }
    
    if (proxies.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <h3>Нет прокси</h3>
                <p>Добавьте прокси для использования в профилях</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = proxies.map((proxy, index) => `
        <div class="proxy-card" data-proxy-index="${index}">
            <div class="proxy-info">
                <div class="proxy-address">
                    <strong>${proxy.type.toUpperCase()}://${proxy.host}:${proxy.port}</strong>
                </div>
                <div class="proxy-auth">
                    ${proxy.username ? `${proxy.username}:${proxy.password ? '***' : ''}` : 'Без авторизации'}
                </div>
                <div class="proxy-status ${proxy.status || 'unknown'}">
                    ${getProxyStatusText(proxy.status)}
                </div>
            </div>
            <div class="proxy-actions">
                <button class="btn btn-secondary" onclick="testProxy(${index})">
                    🔍 Проверить
                </button>
                <button class="btn btn-danger" onclick="deleteProxy(${index})">
                    🗑️ Удалить
                </button>
            </div>
        </div>
    `).join('');
}

// Получение текста статуса прокси
function getProxyStatusText(status) {
    switch (status) {
        case 'working': return '✅ Работает';
        case 'failed': return '❌ Не работает';
        case 'timeout': return '⏰ Таймаут';
        case 'testing': return '🔄 Проверяется';
        default: return '❓ Не проверен';
    }
}

// Сохранение прокси из текстового поля
async function saveProxiesFromInput() {
    try {
        console.log('Saving proxies from input...');
        
        const textarea = document.getElementById('proxyInput');
        if (!textarea) {
            throw new Error('Текстовое поле не найдено');
        }
        
        const proxyText = textarea.value.trim();
        if (!proxyText) {
            showNotification('Список прокси пуст', 'warning');
            return;
        }
        
        const newProxies = parseProxyList(proxyText);
        console.log('Parsed proxies:', newProxies.length);
        
        if (newProxies.length === 0) {
            throw new Error('Не удалось распознать ни одного прокси');
        }
        
        // Добавляем новые прокси к существующим
        const allProxies = [...proxies, ...newProxies];
        
        await window.electronAPI.saveProxies(allProxies);
        console.log('Proxies saved successfully');
        
        await loadProxies();
        textarea.value = '';
        
        showNotification(`Добавлено ${newProxies.length} прокси!`, 'success');
        
    } catch (error) {
        console.error('Error saving proxies:', error);
        showNotification('Ошибка сохранения прокси: ' + error.message, 'error');
    }
}

// Парсинг списка прокси
function parseProxyList(text) {
    console.log('Parsing proxy list...');
    const lines = text.split('\n').map(line => line.trim()).filter(line => line);
    const proxies = [];
    
    for (const line of lines) {
        try {
            const proxy = parseProxyLine(line);
            if (proxy) {
                proxies.push(proxy);
            }
        } catch (error) {
            console.warn('Failed to parse proxy line:', line, error);
        }
    }
    
    console.log('Parsed proxies:', proxies.length);
    return proxies;
}

// Парсинг строки прокси
function parseProxyLine(line) {
    // Поддерживаемые форматы:
    // socks5://username:password@127.0.0.1:1080
    // http://127.0.0.1:8080
    // 192.168.1.1:8080:admin:password
    // proxy.example.com:3128
    
    // URL формат
    if (line.includes('://')) {
        try {
            const url = new URL(line);
            return {
                type: url.protocol.replace(':', ''),
                host: url.hostname,
                port: url.port,
                username: url.username || '',
                password: url.password || ''
            };
        } catch (error) {
            console.warn('Failed to parse URL format:', line);
        }
    }
    
    // Формат host:port:username:password
    const parts = line.split(':');
    if (parts.length >= 2) {
        return {
            type: 'http',
            host: parts[0],
            port: parts[1],
            username: parts[2] || '',
            password: parts[3] || ''
        };
    }
    
    throw new Error('Неподдерживаемый формат прокси');
}

// Быстрый парсинг прокси в модальном окне профиля
function parseQuickProxy(proxyString) {
    try {
        const proxy = parseProxyLine(proxyString);
        if (proxy) {
            document.getElementById('proxyType').value = proxy.type;
            document.getElementById('proxyHost').value = proxy.host;
            document.getElementById('proxyPort').value = proxy.port;
            document.getElementById('proxyUsername').value = proxy.username || '';
            document.getElementById('proxyPassword').value = proxy.password || '';
        }
    } catch (error) {
        console.warn('Failed to parse quick proxy:', error);
    }
}

// Тест текущего прокси в модальном окне профиля
async function testCurrentProxy() {
    try {
        const proxyEnabled = document.getElementById('proxyEnabled').checked;
        if (!proxyEnabled) {
            showNotification('Включите использование прокси', 'warning');
            return;
        }
        
        const proxy = {
            type: document.getElementById('proxyType').value,
            host: document.getElementById('proxyHost').value.trim(),
            port: document.getElementById('proxyPort').value.trim(),
            username: document.getElementById('proxyUsername').value.trim(),
            password: document.getElementById('proxyPassword').value.trim()
        };
        
        if (!proxy.host || !proxy.port) {
            showNotification('Заполните хост и порт прокси', 'warning');
            return;
        }
        
        showNotification('Проверка прокси...', 'info');
        
        const result = await window.electronAPI.testProxy(proxy);
        console.log('Proxy test result:', result);
        
        showNotification(`Прокси ${proxy.host}:${proxy.port} - ${result.message}`, 
                        result.success ? 'success' : 'error');
        
    } catch (error) {
        console.error('Error testing proxy:', error);
        showNotification('Ошибка проверки прокси: ' + error.message, 'error');
    }
}

// Тестирование прокси
async function testProxy(index) {
    try {
        console.log('Testing proxy:', index);
        
        if (index < 0 || index >= proxies.length) {
            throw new Error('Неверный индекс прокси');
        }
        
        const proxy = proxies[index];
        proxy.status = 'testing';
        renderProxies();
        
        const result = await window.electronAPI.testProxy(proxy);
        console.log('Proxy test result:', result);
        
        proxy.status = result.success ? 'working' : 'failed';
        proxy.message = result.message;
        
        await window.electronAPI.saveProxies(proxies);
        renderProxies();
        
        showNotification(`Прокси ${proxy.host}:${proxy.port} - ${result.message}`, 
                        result.success ? 'success' : 'error');
        
    } catch (error) {
        console.error('Error testing proxy:', error);
        
        if (index >= 0 && index < proxies.length) {
            proxies[index].status = 'failed';
            proxies[index].message = error.message;
            renderProxies();
        }
        
        showNotification('Ошибка проверки прокси: ' + error.message, 'error');
    }
}

// Тестирование всех прокси
async function testAllProxies() {
    if (proxies.length === 0) {
        showNotification('Нет прокси для проверки', 'warning');
        return;
    }
    
    console.log('Testing all proxies:', proxies.length);
    
    showNotification(`Начинаю проверку ${proxies.length} прокси...`, 'info');
    
    let workingCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < proxies.length; i++) {
        try {
            await testProxy(i);
            if (proxies[i].status === 'working') {
                workingCount++;
            } else {
                failedCount++;
            }
        } catch (error) {
            failedCount++;
        }
        
        // Небольшая задержка между проверками
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    showNotification(`Проверка завершена. Работает: ${workingCount}, не работает: ${failedCount}`, 
                    workingCount > 0 ? 'success' : 'warning');
}

// Удаление прокси
async function deleteProxy(index) {
    try {
        console.log('Deleting proxy:', index);
        
        if (index < 0 || index >= proxies.length) {
            throw new Error('Неверный индекс прокси');
        }
        
        const proxy = proxies[index];
        
        if (!confirm(`Удалить прокси ${proxy.host}:${proxy.port}?`)) {
            return;
        }
        
        proxies.splice(index, 1);
        
        await window.electronAPI.saveProxies(proxies);
        renderProxies();
        updateProxyCount();
        
        showNotification('Прокси удален успешно!', 'success');
        
    } catch (error) {
        console.error('Error deleting proxy:', error);
        showNotification('Ошибка удаления прокси: ' + error.message, 'error');
    }
}

// Показ уведомлений
function showNotification(message, type = 'info') {
    console.log('Notification:', type, message);
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    
    // Добавляем уведомление в контейнер
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.className = 'notification-container';
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    
    // Показываем уведомление
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    // Скрываем уведомление через 5 секунд
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

// Вспомогательные функции
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    if (!dateString) return 'Неизвестно';
    
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return 'Неверная дата';
    }
}

// Глобальные функции для использования в HTML
window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfile = saveProfile;
window.launchProfile = launchProfile;
window.editProfile = editProfile;
window.cloneProfile = cloneProfile;
window.deleteProfile = deleteProfile;
window.toggleProfileSelection = toggleProfileSelection;
window.toggleSelectAll = toggleSelectAll;
window.launchSelectedProfiles = launchSelectedProfiles;
window.deleteSelectedProfiles = deleteSelectedProfiles;
window.testProxy = testProxy;
window.testAllProxies = testAllProxies;
window.deleteProxy = deleteProxy;