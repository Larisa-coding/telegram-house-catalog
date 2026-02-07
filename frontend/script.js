// API — тот же хост, что и страница (важно для Telegram WebView)
const getApiBase = () => {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (!origin || origin === 'null' || origin.startsWith('file')) {
    return ''; // относительный путь /api при открытии через сервер
  }
  return origin.replace(/\/$/, '');
};
const API_URL = getApiBase() + '/api';

// дом.рф — wsrv.nl (CDN), fallback на наш proxy. data: — как есть (загрузки из админки)
const toImgUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:')) return url;
  const needsProxy = url.includes('xn--80az8a') || url.includes('xn--h1aieheg') ||
    url.includes('строим.дом') || url.includes('наш.дом');
  if (needsProxy) {
    return `https://wsrv.nl/?url=${encodeURIComponent(url)}`;
  }
  return url;
};
const getProxyFallbackUrl = (url) => {
  if (!url || !url.startsWith('http')) return null;
  const needsProxy = url.includes('xn--80az8a') || url.includes('xn--h1aieheg') ||
    url.includes('строим.дом') || url.includes('наш.дом');
  if (needsProxy) {
    const base = getApiBase();
    return base ? `${base}/api/proxy-image?url=${encodeURIComponent(url)}` : null;
  }
  return null;
};

let currentOffset = 0;
let totalCount = 0;
let isLoading = false;
let hasMore = true;
let showFavoritesOnly = false;
const PAGE_SIZE = 12;

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
  const id = Number(projectId);
  const favorites = getFavorites();
  const index = favorites.findIndex((f) => Number(f) === id);
  if (index > -1) {
    favorites.splice(index, 1);
  } else {
    favorites.push(id);
  }
  saveFavorites(favorites);
  updateFavoritesCount();
  return index === -1;
};

const isFavorite = (projectId) => {
  const id = Number(projectId);
  return getFavorites().some((f) => Number(f) === id);
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
        const grid = document.getElementById('projects-grid');
        if (grid) grid.innerHTML = '<div class="empty-catalog">У вас пока нет избранных проектов</div>';
        document.getElementById('load-more').style.display = 'none';
        showResultsCount(0, false);
        isLoading = false;
        if (loadingEl) loadingEl.style.display = 'none';
        return;
      }

      const promises = favorites.map((id) =>
        fetch(`${API_URL}/projects/${id}`)
          .then((r) => r.json())
          .catch(() => ({ success: false }))
      );
      const results = await Promise.all(promises);
      projects = results.filter((r) => r.success).map((r) => r.data);
      hasMore = false;
      showResultsCount(projects.length, false);
    } else {
      const filters = getFilters();
      const offset = reset ? 0 : currentOffset;
      const queryParams = { ...filters, limit: PAGE_SIZE, offset };
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
      totalCount = rawData.total ?? 0;
      hasMore = currentOffset + projects.length < totalCount;
      showResultsCount(totalCount, Object.keys(filters).length > 0);
    }

    if (projects.length === 0 && currentOffset === 0) {
      const grid = document.getElementById('projects-grid');
      const emptyMsg = showFavoritesOnly
        ? 'У вас пока нет избранных проектов'
        : 'Каталог пока пуст. Добавьте проекты через <a href="/admin.html" style="color: var(--mint-border);">админ-панель</a> или подождите загрузки.';
      if (grid) {
        grid.innerHTML = `<div class="empty-catalog">${emptyMsg}</div>`;
      }
      showResultsCount(0, false);
      hasMore = false;
    } else {
      renderProjects(projects);
      currentOffset += projects.length;
      if (!showFavoritesOnly) hasMore = currentOffset < totalCount;
    }

    const loadMoreEl = document.getElementById('load-more');
    if (loadMoreEl) loadMoreEl.style.display = hasMore && !showFavoritesOnly ? 'block' : 'none';

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

const declenseProject = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'проект';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'проекта';
  return 'проектов';
};
const declenseObject = (n) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'объект';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'объекта';
  return 'объектов';
};

const showResultsCount = (count, hasFilters) => {
  const el = document.getElementById('results-count');
  if (!el) return;
  if (showFavoritesOnly) {
    el.textContent = `Избранное: ${count} ${declenseProject(count)}`;
    el.style.display = count > 0 ? 'block' : 'none';
  } else if (hasFilters && count >= 0) {
    el.textContent = `Найдено ${count} ${declenseObject(count)}`;
    el.style.display = 'block';
  } else if (count >= 0) {
    el.textContent = `${count} ${declenseProject(count)}`;
    el.style.display = count > 0 ? 'block' : 'none';
  } else {
    el.style.display = 'none';
  }
};

// Получение фильтров (по умолчанию не ограничиваем площадь — показываем все проекты)
const getFilters = () => {
  const filters = {};
  
  const material = document.getElementById('material-filter')?.value;
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

const isLogoOrIcon = (url) => {
  if (!url || typeof url !== 'string') return true;
  const lower = url.toLowerCase();
  return /logo|favicon|icon\.(png|svg|gif)|emblem|sprite|banner|watermark|nophoto/.test(lower) ||
    /\/icons?\/|\/logo\/|favicon\.|logo\.(png|svg|jpg|jpeg|gif)/.test(lower);
};

const isFloorPlan = (url) => {
  if (!url || typeof url !== 'string') return false;
  const lower = url.toLowerCase();
  return /plan|планир|этаж|floor|layout|чертеж|схема/i.test(lower);
};

const isTinyThumbnail = (url) => /width=32|width=64|height=32|height=64/.test(url || '');

const getCoverImage = (project) => {
  const im = project?.images;
  if (!im) return null;
  if (im.main && Array.isArray(im.main) && im.main[0]) return im.main[0];
  if (Array.isArray(im) && im[0]) return im[0];
  return null;
};

const getAllGalleryImages = (project) => {
  const im = project?.images;
  if (!im) return [];
  if (im.main || im.gallery) {
    return [...(im.main || []), ...(im.gallery || [])].filter((s) => s && typeof s === 'string');
  }
  return Array.isArray(im) ? im.filter((s) => s && typeof s === 'string') : [];
};

const debounce = (fn, ms) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

// Создание карточки проекта
const createProjectCard = (project) => {
  const card = document.createElement('div');
  card.className = 'project-card';
  const firstImg = getCoverImage(project);
  const imageUrl = firstImg ? toImgUrl(firstImg) : 'https://via.placeholder.com/400x300?text=Дом';
  const fallbackUrl = firstImg ? getProxyFallbackUrl(firstImg) : null;
  
  const specs = [];
  if (project.area) specs.push(`Площадь: ${project.area} м²`);
  if (project.material) specs.push(`Материал: ${project.material}`);
  
  const price = project.price 
    ? `${project.price.toLocaleString('ru-RU')} ₽*`
    : 'Цена по запросу*';
  
  const projId = project.id ?? project.project_id;
  const favoriteClass = isFavorite(projId) ? 'active' : '';
  const favoriteIcon = isFavorite(projId) ? '❤️' : '🤍';
  
  card.innerHTML = `
    <div class="project-image-container">
      <img src="${imageUrl}" alt="${project.name}" class="project-image"
           ${fallbackUrl ? `data-fallback="${escapeHtml(fallbackUrl)}" onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;delete this.dataset.fallback}else{this.src='https://via.placeholder.com/400x300?text=Нет+фото'}"` : "onerror=\"this.src='https://via.placeholder.com/400x300?text=Нет+фото'\""}>
      <button class="favorite-btn ${favoriteClass}" onclick="toggleProjectFavorite(${projId}, this)" title="Добавить в избранное">
        ${favoriteIcon}
      </button>
    </div>
    <div class="project-info">
      <div class="project-name">${escapeHtml(project.name)}</div>
      <div class="project-specs">${specs.join(' | ')}</div>
      <div class="project-price">${price}</div>
      <div class="project-price-note">* Уточняйте актуальные цены у менеджера</div>
      <div class="project-description">${renderDescription(project.formatted_description || project.description || '')}</div>
      <div class="project-actions">
        <button class="btn btn-primary details-btn" data-project-id="${projId}" data-project-name="${escapeHtml(project.name || '')}">
          Подробнее
        </button>
        <button class="btn btn-secondary" onclick="contactManager(${projId})">
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

    const allImages = getAllGalleryImages(project);
    if (allImages.length === 0 && !project.description) {
      throw new Error('Нет данных для отображения');
    }

    const specs = [];
    if (project.area) specs.push(`Площадь: ${project.area} м²`);
    if (project.material) specs.push(`Материал: ${project.material}`);
    if (project.bedrooms) specs.push(`Спален: ${project.bedrooms}`);

    const price = project.price 
      ? `${project.price.toLocaleString('ru-RU')} ₽*`
      : 'Цена по запросу*';

    const floorPlans = (project.floor_plans || []).filter((src) => src && typeof src === 'string');
    const imgTag = (url, cls) => {
      if (!url || typeof url !== 'string') return '';
      const srcUrl = toImgUrl(url);
      const fb = url.startsWith('http') ? getProxyFallbackUrl(url) : null;
      const onerr = fb
        ? `onerror="if(this.dataset.fallback){this.src=this.dataset.fallback;delete this.dataset.fallback}else{this.style.display='none'}" data-fallback="${escapeHtml(fb)}"`
        : `onerror="this.style.display='none'"`;
      return `<img src="${escapeHtml(srcUrl)}" alt="${escapeHtml(project.name)}" class="${cls}" ${onerr}>`;
    };

    const carouselImages = [...allImages, ...floorPlans];
    const carouselHtml = carouselImages.length > 0 ? `
      <div class="modal-carousel">
        <div class="modal-carousel-inner">
          ${carouselImages.map((url, i) => `<div class="modal-carousel-slide" data-index="${i}">${imgTag(url, 'modal-image')}</div>`).join('')}
        </div>
        ${carouselImages.length > 1 ? `<div class="modal-carousel-nav"><button type="button" class="carousel-prev" aria-label="Назад">←</button><span class="carousel-counter">1 / ${carouselImages.length}</span><button type="button" class="carousel-next" aria-label="Вперёд">→</button></div>` : ''}
      </div>
    ` : '';
    const modalImagesHtml = carouselHtml;

    modalBody.innerHTML = `
      ${modalImagesHtml}
      <div class="modal-name">${escapeHtml(project.name)}</div>
      <div class="modal-specs">${specs.join(' | ')}</div>
      <div class="modal-price">${price}</div>
      <div class="modal-price-note">* Уточняйте актуальные цены у менеджера</div>
      <div class="modal-description">${renderDescription(project.formatted_description || project.description || '')}</div>
      <div class="project-actions modal-actions">
        <a href="https://строим.дом.рф/project/${project.project_id || project.id}" target="_blank" rel="noopener noreferrer" class="btn btn-primary">Подробнее на сайте</a>
        <button class="btn btn-secondary" onclick="contactManager(${project.id ?? project.project_id})">Связаться с менеджером</button>
      </div>
    `;

    modal.style.display = 'block';

    if (carouselImages.length > 1) {
      let currIdx = 0;
      const slides = modalBody.querySelectorAll('.modal-carousel-slide');
      const counterEl = modalBody.querySelector('.carousel-counter');
      const goTo = (idx) => {
        currIdx = Math.max(0, Math.min(idx, slides.length - 1));
        slides.forEach((s, i) => s.style.display = i === currIdx ? 'block' : 'none');
        if (counterEl) counterEl.textContent = `${currIdx + 1} / ${slides.length}`;
      };
      goTo(0);
      modalBody.querySelector('.carousel-prev')?.addEventListener('click', () => goTo(currIdx - 1));
      modalBody.querySelector('.carousel-next')?.addEventListener('click', () => goTo(currIdx + 1));
    }
  } catch (error) {
    alert(`Ошибка: ${error.message}`);
  }
};

const debouncedShowDetails = debounce((projectId) => showProjectDetails(projectId), 300);

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('projects-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.details-btn');
    if (btn) {
      const id = btn.dataset.projectId;
      if (id) debouncedShowDetails(id);
    }
  });
});

const TELEGRAM_MANAGER = 'larissa_malio';
const TELEGRAM_AUTO_TEXT = 'Добрый день! ✨ Пишу с вашего классного приложения — хочу обсудить несколько моментов. Подскажете?';

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

// Фильтр: только Пиленый брус и Газобетон (опции в HTML)
const loadMaterials = async () => { /* опции статичны в index.html */ };

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
  if (text == null || text === '') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Рендер структурированного описания (плашки + поэтичный текст)
const renderDescription = (desc) => {
  if (!desc) return '';
  const parts = String(desc).split('\n\n');
  const badgesLine = parts[0] || '';
  const poetic = parts[1] || '';
  const badges = badgesLine.split(' • ').filter(Boolean);
  if (badges.length === 0) return escapeHtml(desc);
  const badgesHtml = badges.map((b) => `<span class="desc-badge">${escapeHtml(b.trim())}</span>`).join('');
  return `<div class="desc-badges">${badgesHtml}</div>${poetic ? `<div class="desc-poetic">${escapeHtml(poetic)}</div>` : ''}`;
};

// Закрытие модального окна (крестик)
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target.closest('.close')) {
    document.getElementById('modal').style.display = 'none';
  }
});
window.addEventListener('click', (e) => {
  const modal = document.getElementById('modal');
  if (e.target === modal) modal.style.display = 'none';
});

// События — с проверкой существования элементов
const safeAddListener = (id, event, handler) => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
};
safeAddListener('min-area', 'input', updateAreaValue);
safeAddListener('max-area', 'input', updateAreaValue);
safeAddListener('apply-filters', 'click', () => loadProjects(true));
safeAddListener('reset-filters', 'click', resetFilters);
safeAddListener('load-more', 'click', () => loadProjects(false));

// Фильтры теперь работают через checkbox+label (чистый HTML/CSS)

// Переключение избранного
const toggleProjectFavorite = (projectId, button) => {
  const isNowFavorite = toggleFavorite(projectId);
  button.className = `favorite-btn ${isNowFavorite ? 'active' : ''}`;
  button.innerHTML = isNowFavorite ? '❤️' : '🤍';
  updateFavoritesCount();
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
