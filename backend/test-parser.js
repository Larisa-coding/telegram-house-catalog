/**
 * Тестовый скрипт для проверки парсера проекта 77279
 */
require('dotenv').config();
const { parseProject, generateDescription } = require('./parser');

(async () => {
  console.log('Testing parser for project 77279...\n');
  
  const projectData = await parseProject('77279');
  
  if (projectData) {
    console.log('✅ Project parsed successfully!\n');
    console.log('Raw data:');
    console.log(JSON.stringify(projectData, null, 2));
    console.log('\n---\n');
    console.log('Formatted description:');
    console.log(generateDescription(projectData));
  } else {
    console.log('❌ Failed to parse project or project not from contractor 9465');
  }
})();
