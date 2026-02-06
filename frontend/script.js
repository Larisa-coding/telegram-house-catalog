// API — тот же хост, что и страница (важно для Telegram WebView)
const getApiBase = () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!origin || origin === 'null' || origin.startsWith('file')) {
    return ''; // относительный путь /api при открытии через сервер
  }
  return origin.replace(/\/$/, '');
};
const API_URL = getApiBase() + '/api';
let currentOffset = 0;
let isLoading = false;
let hasMore = true;
let showFavoritesOnly = false;

// Управление избранным (localStorage)
const FAVORITES_KEY = 'house_catalog_favorites';

const getFavorites = () => {
  const favorites = localStorage.getItem(FAVORITES_KEY);
  return favorites ? JSON.parse(favorites) : [];
};

const saveFavorites = (favorites) => {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
};

const toggleFavorite = (projectId) => {
  const favorites = getFavorites();
  const index = favorites.indexOf(projectId);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(projectId);
  }
  saveFavorites(favorites);
  updateFavoritesCount();
  return favorites.includes(projectId);
};

const isFavorite = (projectId) => {
  return getFavorites().includes(projectId);
};

const updateFavoritesCount = () => {
  const el = document.getElementById('favorites-count');
  if (el) el.textContent = getFavorites().length;
};

// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
  // Отправляем данные пользователя на сервер для отслеживания
  if (tg.initDataUnsafe?.user) {
    fetch(`${API_URL}/track-user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: tg.initDataUnsafe.user }),
    }).catch(() => {});
  }
}

// Загрузка проектов
const loadProjects = async (reset = false) => {
  if (isLoading) return;
  
  if (reset) {
    currentOffset = 0;
    hasMore = true;
    document.getElementById('projects-grid').innerHTML = '';
  }

  isLoading = true;
  const loadingEl = document.getElementById('loading');
  const errorEl = document.getElementById('error');
  if (loadingEl) loadingEl.style.display = 'block';
  if (errorEl) errorEl.style.display = 'none';

  const loadingTimeout = setTimeout(() => {
    if (isLoading && loadingEl) {
      loadingEl.style.display = 'none';
      if (errorEl) {
        errorEl.textContent = 'Загрузка заняла слишком много времени. Проверьте интернет и обновите страницу.';
        errorEl.style.display = 'block';
      }
      isLoading = false;
    }
  }, 30000);

  try {
    let projects = [];
    
    if (showFavoritesOnly) {
      // Загружаем избранные проекты
      const favorites = getFavorites();
      if (favorites.length === 0) {
        clearTimeout(loadingTimeout);
        document.getElementById('projects-grid').innerHTML = 
          '<div class="empty-catalog">У вас пока нет избранных проектов</div>';
        document.getElementById('load-more').style.display = 'none';
        isLoading = false;
        if (loadingEl) loadingEl.style.display = 'none';
        return;
      }
      
      // Загружаем проекты по ID из избранного
      const promises = favorites.map(id => 
        fetch(`${API_URL}/projects/${id}`)
          .then(r => r.json())
          .catch(() => ({ success: false }))
      );
      const results = await Promise.all(promises);
      projects = results
        .filter(r => r.success)
        .map(r => r.data);
      
      // Применяем пагинацию
      const paginatedProjects = projects.slice(currentOffset, currentOffset + 9);
      hasMore = paginatedProjects.length === 9 && currentOffset + 9 < projects.length;
      projects = paginatedProjects;
    } else {
      // Обычная загрузка с фильтрами
      const filters = getFilters();
      const queryParams = { ...filters, limit: 9, offset: currentOffset };
      const params = new URLSearchParams();
      Object.entries(queryParams).forEach(([k, v]) => {
        if (v != null && v !== '') params.set(k, String(v));
      });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      const response = await fetch(`${API_URL}/projects?${params}`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const contentType = response.headers.get('content-type') || '';
      let data = {};
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        await response.text();
        throw new Error(`Сервер вернул не JSON (${response.status}). Проверьте /api/projects`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `Ошибка ${response.status}`);
      }

      const rawData = data && typeof data === 'object' ? data : {};
      if (!rawData.success) {
        throw new Error(rawData.error || 'Ошибка загрузки');
      }

      projects = Array.isArray(rawData.data) ? rawData.data : [];
      hasMore = projects.length === 9;
    }

    if (projects.length === 0 && currentOffset === 0) {
      const grid = document.getElementById('projects-grid');
      const emptyMsg = showFavoritesOnly
        ? 'У вас пока нет избранных проектов'
        : 'Каталог пока пуст. Добавьте проекты через <a href="/admin.html" style="color: var(--mint-border);">админ-панель</a> или подождите загрузки.';
      if (grid) {
        grid.innerHTML = `<div class="empty-catalog">${emptyMsg}</div>`;
      }
      hasMore = false;
    } else {
      renderProjects(projects);
      currentOffset += projects.length;
    }

    document.getElementById('load-more').style.display = hasMore ? 'block' : 'none';

  } catch (error) {
    console.error('Error loading projects:', error);
    let errMsg = error.message;
    if (error.name === 'AbortError') {
      errMsg = 'Превышено время ожидания. Проверьте интернет.';
    } else if (typeof error.message === 'string' && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
      errMsg = 'Нет связи с сервером. Убедитесь, что приложение открыто с правильного адреса.';
    }
    const errEl = document.getElementById('error');
    if (errEl) {
      errEl.textContent = 'Ошибка: ' + errMsg;
      errEl.style.display = 'block';
    }
    if (currentOffset === 0) {
      const grid = document.getElementById('projects-grid');
      if (grid) {
        grid.innerHTML = '<div class="empty-catalog">Не удалось загрузить проекты. <a href="" onclick="location.reload(); return false;" style="color: var(--mint-border);">Обновить</a></div>';
      }
    }
  } finally {
    clearTimeout(loadingTimeout);
    isLoading = false;
    const loadingElFinal = document.getElementById('loading');
    if (loadingElFinal) loadingElFinal.style.display = 'none';
  }
};

// Получение фильтров (по умолчанию не ограничиваем площадь — показываем все проекты)
const getFilters = () => {
  const filters = {};
  
  const material = document.getElementById('material-filter').value;
  if (material) filters.material = material;

  const minArea = document.getElementById('min-area')?.value;
  const maxArea = document.getElementById('max-area')?.value;
  if (minArea && minArea !== '50') filters.minArea = minArea;
  if (maxArea && maxArea !== '350') filters.maxArea = maxArea;

  const search = document.getElementById('search-filter')?.value?.trim() || '';
  if (search) {
    // Если поиск - число, ищем по project_id, иначе по названию
    if (/^\d+$/.test(search)) {
      filters.projectId = search;
    } else {
      filters.search = search;
    }
  }

  return filters;
};

// Отрисовка проектов
const renderProjects = (projects) => {
  const grid = document.getElementById('projects-grid');
  
  projects.forEach(project => {
    const card = createProjectCard(project);
    grid.appendChild(card);
  });
};

// Создание карточки проекта
const createProjectCard = (project) => {
  const card = document.createElement('div');
  card.className = 'project-card';
  
  const imageUrl = project.images && project.images.length > 0 
    ? project.images[0] 
    : 'https://via.placeholder.com/400x300?text=Нет+фото';
  
  const specs = [];
  if (project.area) specs.push(`Площадь: ${project.area} м²`);
  if (project.material) specs.push(`Материал: ${project.material}`);
  
  const price = project.price 
    ? `${project.price.toLocaleString('ru-RU')} ₽`
    : 'Цена по запросу';
  
  const favoriteClass = isFavorite(project.id) ? 'active' : '';
  const favoriteIcon = isFavorite(project.id) ? '❤️' : '🤍';
  
  card.innerHTML = `
    <div class="project-image-container">
      <img src="${imageUrl}" alt="${project.name}" class="project-image" 
           onerror="this.src='https://via.placeholder.com/400x300?text=Нет+фото'">
      <button class="favorite-btn ${favoriteClass}" onclick="toggleProjectFavorite(${project.id}, this)" title="Добавить в избранное">
        ${favoriteIcon}
      </button>
    </div>
    <div class="project-info">
      <div class="project-name">${escapeHtml(project.name)}</div>
      <div class="project-specs">${specs.join(' | ')}</div>
      <div class="project-price">${price}</div>
      <div class="project-description">${escapeHtml(project.formatted_description || project.description || '')}</div>
      <div class="project-actions">
        <button class="btn btn-primary" onclick="showProjectDetails(${project.id})">
          Подробнее
        </button>
        <button class="btn btn-secondary" onclick="contactManager(${project.id})">
          Связаться
        </button>
      </div>
    </div>
  `;
  
  return card;
};

// Показать детали проекта
const showProjectDetails = async (projectId) => {
  try {
    const response = await fetch(`${API_URL}/projects/${projectId}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error('Проект не найден');
    }

    const project = data.data;
    const modal = document.getElementById('modal');
    const modalBody = document.getElementById('modal-body');

    const specs = [];
    if (project.area) specs.push(`Площадь: ${project.area} м²`);
    if (project.material) specs.push(`Материал: ${project.material}`);
    if (project.bedrooms) specs.push(`Спален: ${project.bedrooms}`);

    const price = project.price 
      ? `${project.price.toLocaleString('ru-RU')} ₽`
      : 'Цена по запросу';

    let imagesHtml = '';
    if (project.images && project.images.length > 0) {
      imagesHtml = `
        <img src="${project.images[0]}" alt="${project.name}" class="modal-image"
             onerror="this.style.display='none'">
        ${project.images.length > 1 ? `
          <div class="modal-images">
            ${project.images.slice(1).map(img => 
              `<img src="${img}" alt="${project.name}" onerror="this.style.display='none'">`
            ).join('')}
          </div>
        ` : ''}
      `;
    }

    modalBody.innerHTML = `
      ${imagesHtml}
      <div class="modal-name">${escapeHtml(project.name)}</div>
      <div class="modal-specs">${specs.join(' | ')}</div>
      <div class="modal-price">${price}</div>
      <div class="modal-description">${escapeHtml(project.formatted_description || project.description || '')}</div>
      <div class="project-actions">
        <button class="btn btn-secondary" onclick="contactManager(${project.id})">
          Связаться с менеджером
        </button>
      </div>
    `;

    modal.style.display = 'block';
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
};

const TELEGRAM_MANAGER = 'larissa_malio';
const TELEGRAM_AUTO_TEXT = 'Добрый день! 😊 Пишу из приложения «Каталог уютных домов» — хотелось бы узнать подробнее о проектах. Подскажите, пожалуйста?';

const getTelegramLink = (prefillText) => {
  const text = prefillText ? encodeURIComponent(prefillText) : '';
  const base = `https://t.me/${TELEGRAM_MANAGER}`;
  return text ? `${base}?text=${text}` : base;
};

// tg:// для лучшей работы из WebApp (автозаполнение текста)
const getTelegramNativeLink = (prefillText) => {
  const text = prefillText ? `&text=${encodeURIComponent(prefillText)}` : '';
  return `tg://resolve?domain=${TELEGRAM_MANAGER}${text}`;
};

// Связаться с менеджером
const contactManager = (projectId) => {
  openTelegramLink(TELEGRAM_AUTO_TEXT);
};

// Загрузка материалов для фильтра
const loadMaterials = async () => {
  try {
    const select = document.getElementById('material-filter');
    
    // Добавляем стандартные материалы
    const materials = ['брус', 'газобетон'];
    materials.forEach(material => {
      const option = document.createElement('option');
      option.value = material;
      option.textContent = material.charAt(0).toUpperCase() + material.slice(1);
      select.appendChild(option);
    });
    
    // Также загружаем уникальные материалы из БД
    try {
      const response = await fetch(`${API_URL}/materials`);
      const data = await response.json();
      if (data.success && data.data.length > 0) {
        data.data.forEach(material => {
          if (!materials.includes(material.toLowerCase())) {
            const option = document.createElement('option');
            option.value = material;
            option.textContent = material;
            select.appendChild(option);
          }
        });
      }
    } catch (error) {
      console.error('Error loading materials from API:', error);
    }
  } catch (error) {
    console.error('Error loading materials:', error);
  }
};

// Сброс фильтров
const resetFilters = () => {
  const material = document.getElementById('material-filter');
  const minArea = document.getElementById('min-area');
  const maxArea = document.getElementById('max-area');
  const search = document.getElementById('search-filter');
  if (material) material.value = '';
  if (minArea) minArea.value = '50';
  if (maxArea) maxArea.value = '350';
  if (search) search.value = '';
  loadProjects(true);
};

// Обновление значения площади
const updateAreaValue = () => {
  const min = document.getElementById('min-area');
  const max = document.getElementById('max-area');
  const areaValue = document.getElementById('area-value');
  if (min && max && areaValue) {
    areaValue.textContent = `${min.value}-${max.value} м²`;
  }
};

// Escape HTML
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Закрытие модального окна
const closeEl = document.querySelector('.close');
if (closeEl) closeEl.addEventListener('click', () => {
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  const modal = document.getElementById('modal');
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});

// События — с проверкой существования элементов
const safeAddListener = (id, event, handler) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
};
safeAddListener('material-filter', 'change', () => loadProjects(true));
safeAddListener('min-area', 'input', updateAreaValue);
safeAddListener('min-area', 'change', () => loadProjects(true));
safeAddListener('max-area', 'input', updateAreaValue);
safeAddListener('max-area', 'change', () => loadProjects(true));
safeAddListener('search-filter', 'input', debounce(() => loadProjects(true), 500));
safeAddListener('reset-filters', 'click', resetFilters);
safeAddListener('load-more', 'click', () => loadProjects(false));

// Debounce функция
const debounce = (func, wait) => {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// Фильтры теперь работают через checkbox+label (чистый HTML/CSS)

// Переключение избранного
const toggleProjectFavorite = (projectId, button) => {
  const isNowFavorite = toggleFavorite(projectId);
  button.className = `favorite-btn ${isNowFavorite ? 'active' : ''}`;
  button.innerHTML = isNowFavorite ? '❤️' : '🤍';
  
  // Если показываем только избранное, обновляем список
  if (showFavoritesOnly) {
    loadProjects(true);
  }
};

// Показать избранные проекты
const showFavorites = () => {
  showFavoritesOnly = !showFavoritesOnly;
  const btn = document.getElementById('favorites-btn');
  if (btn) {
    if (showFavoritesOnly) btn.classList.add('active');
    else btn.classList.remove('active');
  }
  loadProjects(true);
};

// Открыть ссылку на Telegram (с автозаполнением сообщения)
const openTelegramLink = (prefillText) => {
  const text = prefillText || TELEGRAM_AUTO_TEXT;
  const tg = window.Telegram?.WebApp;
  // В WebApp используем tg:// — лучше сохраняет ?text=
  const link = tg ? getTelegramNativeLink(text) : getTelegramLink(text);
  if (tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(link);
    } catch (e) {
      window.location.href = getTelegramLink(text);
    }
  } else {
    window.open(getTelegramLink(text), '_blank', 'noopener');
  }
};

const openTelegram = () => openTelegramLink(TELEGRAM_AUTO_TEXT);

// События для header кнопок
safeAddListener('favorites-btn', 'click', showFavorites);

const telegramBtn = document.getElementById('telegram-btn');
if (telegramBtn) {
  telegramBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openTelegram();
  });
}

// Инициализация — после готовности DOM
const init = () => {
  updateFavoritesCount();
  loadMaterials();
  loadProjects(true);

  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project');
  if (projectId) {
    showProjectDetails(projectId);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
