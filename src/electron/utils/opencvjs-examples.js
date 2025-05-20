/**
 * OpenCV.js Image Analysis Examples
 * 
 * This file contains example implementations of common image analysis functions
 * using OpenCV.js as a replacement for Python-based image analysis.
 */

// Need to load OpenCV.js first - in a real implementation this would be imported properly
// <script async src="https://docs.opencv.org/4.8.0/opencv.js"></script>

/**
 * Extract sections from an image (similar to Python's contour detection)
 * @param {ImageData} imageData - The image data to process
 * @returns {Array} - Array of detected sections with their coordinates
 */
async function extractSections(imageData) {
  // Ensure OpenCV is loaded
  if (typeof cv === 'undefined') {
    console.error('OpenCV.js is not loaded. Make sure to include it in your project.');
    return [];
  }
  
  try {
    // Convert ImageData to cv.Mat
    const src = cv.matFromImageData(imageData);
    
    // Create matrices for image processing
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const hierarchy = new cv.Mat();
    const contours = new cv.MatVector();
    
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Apply Gaussian blur to reduce noise
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
    
    // Detect edges using Canny
    cv.Canny(blurred, edges, 50, 150);
    
    // Find contours
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    
    // Process and filter contours
    const sections = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      
      // Calculate contour area
      const area = cv.contourArea(contour);
      
      // Filter out small contours
      if (area > 500) {
        // Get bounding rectangle
        const rect = cv.boundingRect(contour);
        
        sections.push({
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          area: area
        });
      }
      
      contour.delete();
    }
    
    // Free memory
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    hierarchy.delete();
    contours.delete();
    
    return sections;
  } catch (error) {
    console.error('Error in extractSections:', error);
    return [];
  }
}

/**
 * Analyze colors in an image (similar to Python's color histogram analysis)
 * @param {ImageData} imageData - The image data to process
 * @param {Object} region - Optional region to analyze {x, y, width, height}
 * @returns {Object} - Color analysis results
 */
function analyzeColors(imageData, region = null) {
  if (typeof cv === 'undefined') {
    console.error('OpenCV.js is not loaded');
    return null;
  }
  
  try {
    // Convert ImageData to cv.Mat
    const src = cv.matFromImageData(imageData);
    let roi = src;
    
    // If region is provided, extract region of interest
    if (region) {
      const rect = new cv.Rect(region.x, region.y, region.width, region.height);
      roi = src.roi(rect);
    }
    
    // Convert to RGB (from RGBA)
    const rgbImg = new cv.Mat();
    cv.cvtColor(roi, rgbImg, cv.COLOR_RGBA2RGB);
    
    // Split into channels
    const channels = new cv.MatVector();
    cv.split(rgbImg, channels);
    
    // Calculate histograms for each channel
    const histSize = [256];
    const ranges = [0, 256];
    const rHist = new cv.Mat();
    const gHist = new cv.Mat();
    const bHist = new cv.Mat();
    
    cv.calcHist([channels.get(0)], [0], new cv.Mat(), rHist, histSize, ranges);
    cv.calcHist([channels.get(1)], [0], new cv.Mat(), gHist, histSize, ranges);
    cv.calcHist([channels.get(2)], [0], new cv.Mat(), bHist, histSize, ranges);
    
    // Find dominant colors
    let dominantR = 0;
    let dominantG = 0;
    let dominantB = 0;
    let maxR = 0;
    let maxG = 0;
    let maxB = 0;
    
    for (let i = 0; i < 256; i++) {
      const rValue = rHist.data32F[i];
      const gValue = gHist.data32F[i];
      const bValue = bHist.data32F[i];
      
      if (rValue > maxR) {
        maxR = rValue;
        dominantR = i;
      }
      
      if (gValue > maxG) {
        maxG = gValue;
        dominantG = i;
      }
      
      if (bValue > maxB) {
        maxB = bValue;
        dominantB = i;
      }
    }
    
    // Calculate mean color
    const means = cv.mean(rgbImg);
    
    // Clean up
    src.delete();
    if (roi !== src) roi.delete();
    rgbImg.delete();
    channels.delete();
    rHist.delete();
    gHist.delete();
    bHist.delete();
    
    return {
      dominant: {
        r: dominantR,
        g: dominantG,
        b: dominantB,
        hex: `#${dominantR.toString(16).padStart(2, '0')}${dominantG.toString(16).padStart(2, '0')}${dominantB.toString(16).padStart(2, '0')}`
      },
      mean: {
        r: Math.round(means[0]),
        g: Math.round(means[1]),
        b: Math.round(means[2]),
        hex: `#${Math.round(means[0]).toString(16).padStart(2, '0')}${Math.round(means[1]).toString(16).padStart(2, '0')}${Math.round(means[2]).toString(16).padStart(2, '0')}`
      }
    };
  } catch (error) {
    console.error('Error in analyzeColors:', error);
    return null;
  }
}

/**
 * Recognize text in an image using Tesseract.js (replacement for Python's pytesseract)
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} image - The image to process
 * @param {Object} options - Options for OCR
 * @returns {Promise<Object>} - Recognized text and bounding boxes
 */
async function recognizeText(image, options = {}) {
  // This requires Tesseract.js to be included in the project
  // npm install tesseract.js
  
  if (typeof Tesseract === 'undefined') {
    console.error('Tesseract.js is not loaded. Make sure to include it in your project.');
    return null;
  }
  
  try {
    const { createWorker } = Tesseract;
    const worker = await createWorker('eng');
    
    // Set recognition options
    await worker.setParameters({
      tessedit_char_whitelist: options.whitelist || undefined,
      preserve_interword_spaces: options.preserveSpaces || '1',
    });
    
    // Recognize text
    const result = await worker.recognize(image);
    
    // Extract words with positions
    const words = result.data.words.map(word => ({
      text: word.text,
      confidence: word.confidence,
      bbox: {
        x: word.bbox.x0,
        y: word.bbox.y0,
        width: word.bbox.x1 - word.bbox.x0,
        height: word.bbox.y1 - word.bbox.y0
      }
    }));
    
    // Terminate worker
    await worker.terminate();
    
    return {
      text: result.data.text,
      words: words
    };
  } catch (error) {
    console.error('Error in recognizeText:', error);
    return null;
  }
}

/**
 * Measure elements in an image (to get dimensions like width, height from pixels)
 * @param {ImageData} imageData - The image data to process
 * @returns {Array} - Array of elements with dimensions
 */
function measureElements(imageData) {
  if (typeof cv === 'undefined') {
    console.error('OpenCV.js is not loaded');
    return [];
  }
  
  try {
    // Convert ImageData to cv.Mat
    const src = cv.matFromImageData(imageData);
    
    // Create matrices for processing
    const gray = new cv.Mat();
    const binary = new cv.Mat();
    const hierarchy = new cv.Mat();
    const contours = new cv.MatVector();
    
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    
    // Apply thresholding
    cv.threshold(gray, binary, 127, 255, cv.THRESH_BINARY);
    
    // Find contours
    cv.findContours(binary, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);
    
    // Process contours
    const elements = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      
      // Get bounding rectangle
      const rect = cv.boundingRect(contour);
      
      // Calculate aspect ratio
      const aspectRatio = rect.width / rect.height;
      
      // Determine element type based on shape
      let elementType = 'unknown';
      if (0.9 < aspectRatio && aspectRatio < 1.1) {
        elementType = 'square';
      } else if (aspectRatio > 3) {
        elementType = 'horizontal-line';
      } else if (aspectRatio < 0.33) {
        elementType = 'vertical-line';
      } else {
        elementType = 'rectangle';
      }
      
      elements.push({
        type: elementType,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        aspectRatio: aspectRatio
      });
      
      contour.delete();
    }
    
    // Clean up
    src.delete();
    gray.delete();
    binary.delete();
    hierarchy.delete();
    contours.delete();
    
    return elements;
  } catch (error) {
    console.error('Error in measureElements:', error);
    return [];
  }
}

/**
 * Get the layout structure of an image (grid detection, alignment)
 * @param {ImageData} imageData - The image data to process
 * @returns {Object} - Layout analysis results
 */
function analyzeLayout(imageData) {
  if (typeof cv === 'undefined') {
    console.error('OpenCV.js is not loaded');
    return null;
  }
  
  try {
    // Convert ImageData to cv.Mat
    const src = cv.matFromImageData(imageData);
    const elements = measureElements(imageData);
    
    // Find horizontal and vertical lines (potential grid structures)
    const horizontalElements = elements.filter(el => el.type === 'horizontal-line');
    const verticalElements = elements.filter(el => el.type === 'vertical-line');
    
    // Detect if grid-like structure
    const isGridLayout = horizontalElements.length > 2 && verticalElements.length > 2;
    
    // Detect rows and columns
    let rows = [];
    let columns = [];
    
    if (isGridLayout) {
      // Sort horizontal elements by Y coordinate to find rows
      horizontalElements.sort((a, b) => a.y - b.y);
      
      // Group rows that are close to each other
      let currentY = horizontalElements[0].y;
      let currentRow = [horizontalElements[0]];
      rows.push(currentRow);
      
      for (let i = 1; i < horizontalElements.length; i++) {
        const element = horizontalElements[i];
        if (Math.abs(element.y - currentY) < 10) {
          // Same row
          currentRow.push(element);
        } else {
          // New row
          currentY = element.y;
          currentRow = [element];
          rows.push(currentRow);
        }
      }
      
      // Sort vertical elements by X coordinate to find columns
      verticalElements.sort((a, b) => a.x - b.x);
      
      // Group columns that are close to each other
      let currentX = verticalElements[0].x;
      let currentColumn = [verticalElements[0]];
      columns.push(currentColumn);
      
      for (let i = 1; i < verticalElements.length; i++) {
        const element = verticalElements[i];
        if (Math.abs(element.x - currentX) < 10) {
          // Same column
          currentColumn.push(element);
        } else {
          // New column
          currentX = element.x;
          currentColumn = [element];
          columns.push(currentColumn);
        }
      }
    }
    
    // Analyze alignment of all elements
    let leftAligned = 0;
    let rightAligned = 0;
    let centerAligned = 0;
    
    const imageWidth = src.cols;
    const imageHeight = src.rows;
    
    elements.forEach(element => {
      const leftEdge = element.x;
      const rightEdge = element.x + element.width;
      const center = element.x + element.width / 2;
      
      // Count elements aligned to left, right, or center
      if (leftEdge < 50) leftAligned++;
      if (rightEdge > imageWidth - 50) rightAligned++;
      if (Math.abs(center - imageWidth / 2) < 50) centerAligned++;
    });
    
    // Determine predominant alignment
    let predominantAlignment = 'mixed';
    const total = elements.length;
    
    if (leftAligned > total * 0.6) predominantAlignment = 'left';
    else if (rightAligned > total * 0.6) predominantAlignment = 'right';
    else if (centerAligned > total * 0.6) predominantAlignment = 'center';
    
    // Clean up
    src.delete();
    
    return {
      isGridLayout,
      rowCount: rows.length,
      columnCount: columns.length,
      predominantAlignment,
      alignmentCounts: {
        left: leftAligned,
        right: rightAligned,
        center: centerAligned
      }
    };
  } catch (error) {
    console.error('Error in analyzeLayout:', error);
    return null;
  }
}

// Export the functions
module.exports = {
  extractSections,
  analyzeColors,
  recognizeText,
  measureElements,
  analyzeLayout
};