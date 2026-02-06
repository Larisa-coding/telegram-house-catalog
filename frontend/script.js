// API URL - автоматически определяется из текущего домена
const API_URL = (window.location.origin || 'http://localhost:3000').replace(/\/$/, '') + '/api';
let currentOffset = 0;
let isLoading = false;
let hasMore = true;

// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
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
  document.getElementById('loading').style.display = 'block';
  document.getElementById('error').style.display = 'none';

  try {
    const filters = getFilters();
    const params = new URLSearchParams({
      ...filters,
      limit: 9,
      offset: currentOffset,
    });

    const response = await fetch(`${API_URL}/projects?${params}`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Ошибка загрузки');
    }

    if (data.data.length === 0 && currentOffset === 0) {
      document.getElementById('projects-grid').innerHTML = 
        '<div style="text-align: center; padding: 40px; color: #666;">Проекты не найдены</div>';
      hasMore = false;
    } else {
      renderProjects(data.data);
      currentOffset += data.data.length;
      hasMore = data.data.length === 9;
    }

    document.getElementById('load-more').style.display = hasMore ? 'block' : 'none';

  } catch (error) {
    console.error('Error loading projects:', error);
    document.getElementById('error').textContent = `Ошибка: ${error.message}`;
    document.getElementById('error').style.display = 'block';
  } finally {
    isLoading = false;
    document.getElementById('loading').style.display = 'none';
  }
};

// Получение фильтров
const getFilters = () => {
  const filters = {};
  
  const material = document.getElementById('material-filter').value;
  if (material) filters.material = material;

  const minArea = document.getElementById('min-area').value;
  const maxArea = document.getElementById('max-area').value;
  if (minArea) filters.minArea = minArea;
  if (maxArea) filters.maxArea = maxArea;

  const search = document.getElementById('search-filter').value.trim();
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
  
  card.innerHTML = `
    <img src="${imageUrl}" alt="${project.name}" class="project-image" 
         onerror="this.src='https://via.placeholder.com/400x300?text=Нет+фото'">
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

// Связаться с менеджером
const contactManager = (projectId) => {
  if (tg) {
    tg.openTelegramLink(`https://t.me/${tg.initDataUnsafe?.user?.username || 'your_manager'}`);
  } else {
    alert('Для связи с менеджером откройте приложение в Telegram');
  }
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
  document.getElementById('material-filter').value = '';
  document.getElementById('min-area').value = '50';
  document.getElementById('max-area').value = '350';
  document.getElementById('search-filter').value = '';
  loadProjects(true);
};

// Обновление значения площади
const updateAreaValue = () => {
  const min = document.getElementById('min-area').value;
  const max = document.getElementById('max-area').value;
  document.getElementById('area-value').textContent = `${min}-${max} м²`;
};

// Escape HTML
const escapeHtml = (text) => {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Закрытие модального окна
document.querySelector('.close').addEventListener('click', () => {
  document.getElementById('modal').style.display = 'none';
});

window.addEventListener('click', (e) => {
  const modal = document.getElementById('modal');
  if (e.target === modal) {
    modal.style.display = 'none';
  }
});

// События
document.getElementById('material-filter').addEventListener('change', () => loadProjects(true));
document.getElementById('min-area').addEventListener('input', updateAreaValue);
document.getElementById('min-area').addEventListener('change', () => loadProjects(true));
document.getElementById('max-area').addEventListener('input', updateAreaValue);
document.getElementById('max-area').addEventListener('change', () => loadProjects(true));
document.getElementById('search-filter').addEventListener('input', debounce(() => loadProjects(true), 500));
document.getElementById('reset-filters').addEventListener('click', resetFilters);
document.getElementById('load-more').addEventListener('click', () => loadProjects(false));

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

// Инициализация
loadMaterials();
loadProjects(true);

// Проверка URL параметров для открытия конкретного проекта
const urlParams = new URLSearchParams(window.location.search);
const projectId = urlParams.get('project');
if (projectId) {
  showProjectDetails(projectId);
}
