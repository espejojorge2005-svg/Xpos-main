const fs = require('fs');
const path = require('path');

const files = [
  'pos-frontend/app/inventory/stations/page.tsx',
  'pos-frontend/app/inventory/categories/page.tsx',
  'pos-frontend/app/inventory/page.tsx'
];

for (const file of files) {
  const filePath = path.join(__dirname, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // We look for:
  // const url = isEditing
  //   ? `/api/v1/kitchen-stations/${formData.id}`
  //   : '/api/v1/kitchen-stations';
  // And replace /api/v1 with getApiUrl

  content = content.replace(/\?\s*`\/api\/v1\/(.*?)`\s*:\s*('|"|`)\/api\/v1\/(.*?)('|"|`)/g, "? getApiUrl(`/$1`) : getApiUrl(`/$3`)");
  content = content.replace(/\?\s*`\/api\/v1\/(.*?)`\s*:\s*('|"|`)\/api\/v1\/(.*?)('|"|`)/g, "? getApiUrl(`/$1`) : getApiUrl(`/$3`)"); // running twice if any issues
  
  // also check if there's any single-line assignments like `const url = '/api/v1/...';`
  
  fs.writeFileSync(filePath, content, 'utf8');
}
console.log("Done");
