/**
 * Tesseract.js OCR Examples
 * 
 * This file contains example implementations of OCR (Optical Character Recognition)
 * functions using Tesseract.js for WebAssembly-based text recognition.
 */

// In a real implementation, you'd import Tesseract.js properly:
// import Tesseract from 'tesseract.js';
// or 
// const { createWorker } = require('tesseract.js');

/**
 * Basic text recognition from an image
 * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source (element, canvas, or URL)
 * @returns {Promise<Object>} - OCR results
 */
async function performOCR(image) {
  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker();
    
    // Initialize worker with English language
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // Perform OCR
    const result = await worker.recognize(image);
    
    // Terminate worker to free resources
    await worker.terminate();
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      paragraphs: result.data.paragraphs,
      lines: result.data.lines,
      words: result.data.words,
    };
  } catch (error) {
    console.error('OCR Error:', error);
    return { error: error.message };
  }
}

/**
 * Recognize text with bounding boxes for UI element detection
 * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source
 * @returns {Promise<Object>} - Text with position information
 */
async function recognizeUIElements(image) {
  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker();
    
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // Set parameters for better UI text recognition
    await worker.setParameters({
      tessedit_char_whitelist: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,:-_',
      preserve_interword_spaces: '1',
    });
    
    const result = await worker.recognize(image);
    
    // Process results to identify UI elements
    const uiElements = result.data.words.map(word => {
      // Create a bounding box for the word
      const bbox = word.bbox;
      
      // Determine potential UI element type based on text and position
      let type = 'text';
      
      // Heuristics for UI element classification
      if (word.text.toLowerCase().includes('button') || 
          word.text.match(/submit|login|sign in|register|send|ok|cancel|save|delete/i)) {
        type = 'button';
      } else if (word.text.match(/checkbox|radio/i)) {
        type = 'input';
      } else if (word.text.match(/menu|dropdown|select/i)) {
        type = 'dropdown';
      } else if (word.text.match(/input|field|form|text/i)) {
        type = 'input';
      }
      
      return {
        text: word.text,
        confidence: word.confidence,
        type: type,
        position: {
          x: bbox.x0,
          y: bbox.y0,
          width: bbox.x1 - bbox.x0,
          height: bbox.y1 - bbox.y0
        }
      };
    });
    
    await worker.terminate();
    
    return {
      elements: uiElements,
      rawText: result.data.text
    };
  } catch (error) {
    console.error('UI Element Recognition Error:', error);
    return { error: error.message };
  }
}

/**
 * Extract numerical measurements from design mockups
 * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source
 * @returns {Promise<Object>} - Extracted measurements
 */
async function extractMeasurements(image) {
  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker();
    
    await worker.loadLanguage('eng');
    await worker.initialize('eng');
    
    // Set parameters for number recognition
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789px%rem.,-',
      preserve_interword_spaces: '1',
    });
    
    const result = await worker.recognize(image);
    
    // Extract measurements using regex
    const measurements = [];
    const pixelPattern = /(\d+)(?:\s*)px/g;
    const percentPattern = /(\d+)(?:\.\d+)?(?:\s*)%/g;
    const remPattern = /(\d+)(?:\.\d+)?(?:\s*)rem/g;
    
    let match;
    
    // Extract pixel values
    while ((match = pixelPattern.exec(result.data.text)) !== null) {
      measurements.push({
        value: parseInt(match[1], 10),
        unit: 'px',
        text: match[0],
        position: findPositionInResult(result.data, match[0])
      });
    }
    
    // Extract percentage values
    while ((match = percentPattern.exec(result.data.text)) !== null) {
      measurements.push({
        value: parseFloat(match[1]),
        unit: '%',
        text: match[0],
        position: findPositionInResult(result.data, match[0])
      });
    }
    
    // Extract rem values
    while ((match = remPattern.exec(result.data.text)) !== null) {
      measurements.push({
        value: parseFloat(match[1]),
        unit: 'rem',
        text: match[0],
        position: findPositionInResult(result.data, match[0])
      });
    }
    
    await worker.terminate();
    
    return {
      measurements,
      rawText: result.data.text
    };
  } catch (error) {
    console.error('Measurement Extraction Error:', error);
    return { error: error.message };
  }
}

/**
 * Helper function to find the position of a text segment in OCR results
 * @param {Object} data - OCR result data
 * @param {string} text - Text to find
 * @returns {Object|null} - Position information or null if not found
 */
function findPositionInResult(data, text) {
  // Search in words
  for (const word of data.words) {
    if (word.text.includes(text)) {
      return {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      };
    }
  }
  
  return null;
}

/**
 * Multi-language text recognition
 * @param {HTMLImageElement|HTMLCanvasElement|string} image - Image source
 * @param {string[]} languages - Array of language codes (e.g., ['eng', 'jpn'])
 * @returns {Promise<Object>} - OCR results
 */
async function multiLanguageOCR(image, languages = ['eng']) {
  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker();
    
    // Load and initialize all requested languages
    await worker.loadLanguage(languages.join('+'));
    await worker.initialize(languages.join('+'));
    
    const result = await worker.recognize(image);
    await worker.terminate();
    
    return {
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words.map(word => ({
        text: word.text,
        confidence: word.confidence,
        position: {
          x: word.bbox.x0,
          y: word.bbox.y0,
          width: word.bbox.x1 - word.bbox.x0,
          height: word.bbox.y1 - word.bbox.y0
        }
      }))
    };
  } catch (error) {
    console.error('Multi-language OCR Error:', error);
    return { error: error.message };
  }
}

/**
 * Process a batch of images with OCR
 * @param {Array<HTMLImageElement|HTMLCanvasElement|string>} images - Array of image sources 
 * @returns {Promise<Array>} - Array of OCR results
 */
async function batchOCR(images) {
  try {
    const { createWorker, createScheduler } = Tesseract;
    const scheduler = createScheduler();
    
    // Create multiple workers for parallel processing
    const workerCount = Math.min(4, navigator.hardwareConcurrency || 2);
    const workers = [];
    
    for (let i = 0; i < workerCount; i++) {
      const worker = await createWorker('eng');
      scheduler.addWorker(worker);
      workers.push(worker);
    }
    
    // Process all images in parallel
    const results = await Promise.all(
      images.map(image => scheduler.addJob('recognize', image))
    );
    
    // Clean up
    await scheduler.terminate();
    
    return results.map(result => ({
      text: result.data.text,
      confidence: result.data.confidence,
      words: result.data.words
    }));
  } catch (error) {
    console.error('Batch OCR Error:', error);
    return { error: error.message };
  }
}

// Export the functions
module.exports = {
  performOCR,
  recognizeUIElements,
  extractMeasurements,
  multiLanguageOCR,
  batchOCR
};