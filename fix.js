#\!/usr/bin/env node

const fs = require('fs');

// Read the file
const filePath = '/Users/matsu/Documents/CreAIteCode/local-app/src/electron/public/webassembly-image-analyzer.js';
const content = fs.readFileSync(filePath, 'utf8');

// Split by lines
const lines = content.split('\n');

// Find line range for the first determineGroupType function
let firstDetermineGroupTypeStart = 0;
let firstDetermineGroupTypeEnd = 0;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const determineGroupType = (element) =>')) {
    firstDetermineGroupTypeStart = i;
    
    // Find the closing bracket
    for (let j = i; j < lines.length; j++) {
      if (lines[j].trim() === '};') {
        firstDetermineGroupTypeEnd = j;
        break;
      }
    }
    
    break;
  }
}

// Keep the function declarations we need and remove duplicates
const newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  // Skip duplicate function declarations
  if (i > firstDetermineGroupTypeEnd && 
      (lines[i].includes('const determineGroupType = (element) =>') || 
       lines[i].includes('const areElementsRelated = (element1, element2) =>') ||
       lines[i].includes('const expandBounds = (bounds, position) =>') ||
       lines[i].includes('const findLargestGroup = (groups) =>') ||
       lines[i].includes('const determineElementRole = (group, index, totalGroups) =>') ||
       lines[i].includes('const generateSectionDescription = (structure) =>') ||
       lines[i].includes('const calculateAreaCoverage = (bounds, imageInfo) =>') ||
       lines[i].includes('const calculateRelativePosition = (bounds, imageInfo) =>') ||
       lines[i].includes('const suggestHTMLPattern = (structure) =>') ||
       lines[i].includes('const buildFallbackAIData = (stage1Results) =>') ||
       lines[i].includes('const saveStage2ResultsToJson = (stage2Data, imageType'))) {
    
    // Find the end of this function to skip it entirely
    for (let j = i; j < lines.length; j++) {
      if (lines[j].trim() === '};') {
        i = j;
        break;
      }
    }
  } else {
    newLines.push(lines[i]);
  }
}

// Write the fixed content back
fs.writeFileSync(filePath, newLines.join('\n'), 'utf8');
console.log('Fixed duplicate function declarations');
