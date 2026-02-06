const { pool } = require('./db');
const { parseProject } = require('./parser');
require('dotenv').config();

const PROJECT_IDS = [
  67335, 49980, 77271, 77279, 77126, 67330, 76518, 76038, 65185, 57336,
  34945, 74578, 48400, 39072, 74074, 74073, 49696, 54569, 49474, 38077,
  41936, 55987, 48502, 50601, 47340, 49700, 47480, 49497, 73995, 52136,
  62452, 73759, 41933, 40797, 54067, 52133, 33385, 52139, 50953, 50700,
  60458, 46005, 60620, 64921
];

const fillProjects = async () => {
  console.log(`Начинаем заполнение каталога из ${PROJECT_IDS.length} проектов...\n`);
  const results = { created: 0, updated: 0, failed: [] };

  for (let i = 0; i < PROJECT_IDS.length; i++) {
    const id = PROJECT_IDS[i];
    console.log(`[${i + 1}/${PROJECT_IDS.length}] Парсинг проекта ${id}...`);
    
    try {
      const projectData = await parseProject(String(id), { skipContractorCheck: true });
      
      if (!projectData) {
        console.log(`  ❌ Проект ${id} не найден или ошибка парсинга`);
        results.failed.push(id);
        continue;
      }

      const existing = await pool.query(
        'SELECT id FROM projects WHERE project_id = $1',
        [projectData.project_id]
      );

      const floorPlansJson = JSON.stringify(projectData.floor_plans || []);
      const fields = [
        projectData.name,
        projectData.area,
        projectData.material,
        projectData.price,
        projectData.bedrooms,
        projectData.has_kitchen_living,
        projectData.has_garage,
        projectData.has_second_floor,
        projectData.has_terrace,
        projectData.description,
        JSON.stringify(projectData.images),
        floorPlansJson,
        projectData.url,
        projectData.project_id,
      ];

      if (existing.rows.length > 0) {
        await pool.query(
          `UPDATE projects SET name=$1, area=$2, material=$3, price=$4, bedrooms=$5,
           has_kitchen_living=$6, has_garage=$7, has_second_floor=$8, has_terrace=$9,
           description=$10, images=$11, floor_plans=$12, url=$13, parsed_at=CURRENT_TIMESTAMP WHERE project_id=$14`,
          fields
        );
        results.updated += 1;
        console.log(`  ✅ Проект ${id} обновлён: ${projectData.name}`);
      } else {
        await pool.query(
          `INSERT INTO projects (project_id, name, area, material, price, bedrooms,
           has_kitchen_living, has_garage, has_second_floor, has_terrace, description, images, floor_plans, url)
           VALUES ($14, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          fields
        );
        results.created += 1;
        console.log(`  ✅ Проект ${id} создан: ${projectData.name}`);
      }

      // Задержка между запросами
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.error(`  ❌ Ошибка при обработке проекта ${id}:`, error.message);
      results.failed.push(id);
    }
  }

  console.log(`\n✅ Готово!`);
  console.log(`   Создано: ${results.created}`);
  console.log(`   Обновлено: ${results.updated}`);
  console.log(`   Ошибок: ${results.failed.length}`);
  if (results.failed.length > 0) {
    console.log(`   Не удалось обработать: ${results.failed.join(', ')}`);
  }

  await pool.end();
  process.exit(0);
};

fillProjects().catch(error => {
  console.error('Критическая ошибка:', error);
  process.exit(1);
});
