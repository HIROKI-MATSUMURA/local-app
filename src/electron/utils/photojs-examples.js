/**
 * Photon (WebAssembly Image Processing) Examples
 * 
 * This file contains example implementations of image processing functions
 * using Photon, a high-performance Rust/WebAssembly image processing library.
 * 
 * Installation: npm install @silvia-odwyer/photon
 */

// In a real implementation, import Photon properly:
// import photon from '@silvia-odwyer/photon';

/**
 * Process an image using Photon's high-performance filters
 * @param {HTMLImageElement|String} image - Image element or URL
 * @returns {Promise<HTMLCanvasElement>} - Canvas with processed image
 */
async function enhanceImage(image) {
  try {
    // Wait for image to load if URL is provided
    let imgElement = image;
    if (typeof image === 'string') {
      imgElement = new Image();
      imgElement.src = image;
      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });
    }
    
    // Create canvas and get context
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d');
    
    // Draw image to canvas
    ctx.drawImage(imgElement, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Process image data with Photon
    const photonImageData = photon.PhotonImage.new_from_image_data(imageData);
    
    // Apply a series of enhancements for design mockup clarity
    photon.sharpen(photonImageData, 1.5);         // Sharpen to improve edge detection
    photon.adjust_contrast(photonImageData, 15);  // Increase contrast to make elements pop
    photon.saturation(photonImageData, 0.1);      // Slight saturation increase
    
    // Convert back to ImageData and draw to canvas
    const resultImageData = photonImageData.get_image_data();
    ctx.putImageData(resultImageData, 0, 0);
    
    // Clean up WebAssembly memory
    photonImageData.free();
    
    return canvas;
  } catch (error) {
    console.error('Error enhancing image with Photon:', error);
    return null;
  }
}

/**
 * Extract color palette from an image using Photon
 * @param {HTMLImageElement|String} image - Image element or URL
 * @param {Number} colorCount - Number of colors to extract (default: 5)
 * @returns {Promise<Array>} - Array of dominant colors in hex format
 */
async function extractColorPalette(image, colorCount = 5) {
  try {
    // Wait for image to load if URL is provided
    let imgElement = image;
    if (typeof image === 'string') {
      imgElement = new Image();
      imgElement.src = image;
      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });
    }
    
    // Create canvas and get context
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d');
    
    // Draw image to canvas
    ctx.drawImage(imgElement, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Create PhotonImage
    const photonImageData = photon.PhotonImage.new_from_image_data(imageData);
    
    // Get color palette (this is a custom implementation as Photon doesn't have this built-in)
    // This demonstrates a potential implementation approach
    const pixels = imageData.data;
    const colorMap = {};
    
    // Sample pixels (every 10th pixel for performance)
    for (let i = 0; i < pixels.length; i += 40) {
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];
      
      // Skip transparent pixels
      if (pixels[i + 3] < 128) continue;
      
      // Create color key (quantize colors to reduce variety)
      const quantizedR = Math.floor(r / 10) * 10;
      const quantizedG = Math.floor(g / 10) * 10;
      const quantizedB = Math.floor(b / 10) * 10;
      const colorKey = `${quantizedR},${quantizedG},${quantizedB}`;
      
      // Count color occurrences
      if (colorMap[colorKey]) {
        colorMap[colorKey].count++;
      } else {
        colorMap[colorKey] = {
          r: quantizedR,
          g: quantizedG,
          b: quantizedB,
          count: 1
        };
      }
    }
    
    // Convert to array and sort by count
    const colors = Object.values(colorMap).sort((a, b) => b.count - a.count);
    
    // Get top colors and convert to hex
    const topColors = colors.slice(0, colorCount).map(color => {
      const hex = `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`;
      return {
        hex,
        rgb: { r: color.r, g: color.g, b: color.b },
        frequency: color.count
      };
    });
    
    // Clean up WebAssembly memory
    photonImageData.free();
    
    return topColors;
  } catch (error) {
    console.error('Error extracting color palette with Photon:', error);
    return [];
  }
}

/**
 * Apply threshold to identify UI sections in a mockup
 * @param {HTMLImageElement|String} image - Image element or URL
 * @param {Number} threshold - Threshold value (0-255, default: 128)
 * @returns {Promise<HTMLCanvasElement>} - Canvas with thresholded image
 */
async function identifySections(image, threshold = 128) {
  try {
    // Wait for image to load if URL is provided
    let imgElement = image;
    if (typeof image === 'string') {
      imgElement = new Image();
      imgElement.src = image;
      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });
    }
    
    // Create canvas and get context
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d');
    
    // Draw image to canvas
    ctx.drawImage(imgElement, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Process image data with Photon
    const photonImageData = photon.PhotonImage.new_from_image_data(imageData);
    
    // Convert to grayscale for better section identification
    photon.grayscale(photonImageData);
    
    // Apply threshold to create binary image
    photon.threshold(photonImageData, threshold);
    
    // Convert back to ImageData and draw to canvas
    const resultImageData = photonImageData.get_image_data();
    ctx.putImageData(resultImageData, 0, 0);
    
    // Clean up WebAssembly memory
    photonImageData.free();
    
    return canvas;
  } catch (error) {
    console.error('Error identifying sections with Photon:', error);
    return null;
  }
}

/**
 * Resize an image while maintaining aspect ratio
 * @param {HTMLImageElement|String} image - Image element or URL
 * @param {Number} targetWidth - Desired width
 * @param {Number} targetHeight - Desired height
 * @param {String} resizeAlgorithm - Algorithm to use ('nearest', 'bilinear', 'catmullrom', 'mitchell', 'lanczos3')
 * @returns {Promise<HTMLCanvasElement>} - Canvas with resized image
 */
async function resizeImage(image, targetWidth, targetHeight, resizeAlgorithm = 'lanczos3') {
  try {
    // Wait for image to load if URL is provided
    let imgElement = image;
    if (typeof image === 'string') {
      imgElement = new Image();
      imgElement.src = image;
      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });
    }
    
    // Create canvas and get context
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d');
    
    // Draw image to canvas
    ctx.drawImage(imgElement, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Process image data with Photon
    const photonImageData = photon.PhotonImage.new_from_image_data(imageData);
    
    // Map resize algorithm string to Photon's enum value
    const algorithmMap = {
      'nearest': 0,      // SamplingFilter::Nearest
      'bilinear': 1,     // SamplingFilter::Triangle
      'catmullrom': 2,   // SamplingFilter::CatmullRom
      'mitchell': 3,     // SamplingFilter::Mitchell
      'lanczos3': 4      // SamplingFilter::Lanczos3
    };
    
    const samplingFilter = algorithmMap[resizeAlgorithm] || 4; // Default to Lanczos3
    
    // Resize image using specified algorithm
    const resizedPhotonImage = photon.resize(photonImageData, targetWidth, targetHeight, samplingFilter);
    
    // Create a new canvas for the resized image
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = targetWidth;
    resizedCanvas.height = targetHeight;
    const resizedCtx = resizedCanvas.getContext('2d');
    
    // Convert back to ImageData and draw to canvas
    const resultImageData = resizedPhotonImage.get_image_data();
    resizedCtx.putImageData(resultImageData, 0, 0);
    
    // Clean up WebAssembly memory
    photonImageData.free();
    resizedPhotonImage.free();
    
    return resizedCanvas;
  } catch (error) {
    console.error('Error resizing image with Photon:', error);
    return null;
  }
}

/**
 * Detect edges in an image for UI element identification
 * @param {HTMLImageElement|String} image - Image element or URL
 * @returns {Promise<HTMLCanvasElement>} - Canvas with edge-detected image
 */
async function detectEdges(image) {
  try {
    // Wait for image to load if URL is provided
    let imgElement = image;
    if (typeof image === 'string') {
      imgElement = new Image();
      imgElement.src = image;
      await new Promise((resolve, reject) => {
        imgElement.onload = resolve;
        imgElement.onerror = reject;
      });
    }
    
    // Create canvas and get context
    const canvas = document.createElement('canvas');
    canvas.width = imgElement.width;
    canvas.height = imgElement.height;
    const ctx = canvas.getContext('2d');
    
    // Draw image to canvas
    ctx.drawImage(imgElement, 0, 0);
    
    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Process image data with Photon
    const photonImageData = photon.PhotonImage.new_from_image_data(imageData);
    
    // Apply edge detection
    photon.edge_detection(photonImageData);
    
    // Convert back to ImageData and draw to canvas
    const resultImageData = photonImageData.get_image_data();
    ctx.putImageData(resultImageData, 0, 0);
    
    // Clean up WebAssembly memory
    photonImageData.free();
    
    return canvas;
  } catch (error) {
    console.error('Error detecting edges with Photon:', error);
    return null;
  }
}

// Export the functions
module.exports = {
  enhanceImage,
  extractColorPalette,
  identifySections,
  resizeImage,
  detectEdges
};