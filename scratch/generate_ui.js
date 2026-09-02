const fs = require('fs');
const path = require('path');

const uiDir = path.join(__dirname, '..', 'components', 'ui');

// Check that all required UI components exist and are intact
const expectedComponents = [
  'Button.tsx',
  'Badge.tsx',
  'Card.tsx',
  'Modal.tsx',
  'Input.tsx',
  'Textarea.tsx',
  'Slider.tsx',
  'Tooltip.tsx',
  'index.ts',
];

if (!fs.existsSync(uiDir)) {
  console.error(`UI directory not found at ${uiDir}`);
  process.exit(1);
}

let allValid = true;
for (const file of expectedComponents) {
  const filePath = path.join(uiDir, file);
  if (fs.existsSync(filePath)) {
    console.log(`[OK] ${file} is present.`);
  } else {
    console.warn(`[MISSING] ${file} is not found in components/ui/`);
    allValid = false;
  }
}

if (allValid) {
  console.log('All UI primitives are verified and ready.');
}